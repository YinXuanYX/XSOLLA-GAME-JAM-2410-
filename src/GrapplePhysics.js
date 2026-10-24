import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

/**
 * GrapplePhysics implements the dual-hook state machine, linear pull winch acceleration,
 * slack/fall-cancellation tension physics, and 3D rope/claw/preview meshes for AERO-HOOK.
 *
 * Adheres to PRD.md Sections 4.4.C and 4.4.D:
 * - Independent left (cyan) and right (orange) hook channels
 * - Base winch pull acceleration: 58.0 m/s^2 (single) vs 37.7 m/s^2 per hook (dual, 1.3x combined)
 * - Proximity softening within MIN_DETACH_DIST (2.5m) to avoid violent oscillation
 * - Slack / Fall Cancellation Force opposing negative radial velocity (falling away from anchor)
 * - 100% momentum conservation on release
 * - Procedural 3D cylinder rope and octahedron claw meshes
 * - Dynamic surface preview reticle ring aligned to surface normals
 */
export class GrapplePhysics {
  /**
   * @param {THREE.Scene} [scene] Three.js scene for 3D rope/claw and preview meshes
   * @param {import('./PlayerController.js').PlayerController|{ body: CANNON.Body }} [player] Player controller instance
   */
  constructor(scene = null, player = null) {
    this.scene = scene;
    this.player = player;

    // Scratch math vectors to avoid GC allocation in high-frequency update loops (60-180 Hz)
    this._vD = new THREE.Vector3();
    this._vU = new THREE.Vector3();
    this._vPlayerVel = new THREE.Vector3();
    this._vFPull = new THREE.Vector3();
    this._vFTension = new THREE.Vector3();
    this._vFTotal = new THREE.Vector3();
    this._scratchMuzzle = new THREE.Vector3();
    this._scratchTargetNormal = new THREE.Vector3();
    this._unitZ = new THREE.Vector3(0, 0, 1);
    this._defaultNormal = new THREE.Vector3(0, 1, 0);
    this._cannonForce = new CANNON.Vec3();
    this._zeroVec = new CANNON.Vec3(0, 0, 0);

    // Hook channel configuration
    const leftColor = CONFIG.COLORS?.HOOK_LEFT ?? 0x00f0ff;
    const rightColor = CONFIG.COLORS?.HOOK_RIGHT ?? 0xff6b00;
    const ropeRadius = CONFIG.GRAPPLE?.ROPE_RADIUS ?? 0.045;

    // Initialize hook channel states
    this.hooks = {
      left: {
        active: false,
        anchor: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 1, 0),
        lastForce: new THREE.Vector3(),
        lastPullForce: 0,
        lastTensionForce: 0,
        lastRadialVelocity: 0,
        lastDistance: 0,
        ropeMesh: null,
        clawMesh: null,
      },
      right: {
        active: false,
        anchor: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 1, 0),
        lastForce: new THREE.Vector3(),
        lastPullForce: 0,
        lastTensionForce: 0,
        lastRadialVelocity: 0,
        lastDistance: 0,
        ropeMesh: null,
        clawMesh: null,
      },
    };

    // 1. Build 3D Rope & Claw Meshes for Left and Right Channels
    const hookConfigs = [
      { side: 'left', color: leftColor },
      { side: 'right', color: rightColor },
    ];

    for (const { side, color } of hookConfigs) {
      // Rope: CylinderGeometry(radius, radius, height=1, radialSegments=6, heightSegments=1)
      // Geometry rotated on X by +PI/2 so its length extends from z = -0.5 to z = +0.5 along local +Z.
      const ropeGeo = new THREE.CylinderGeometry(ropeRadius, ropeRadius, 1, 6, 1);
      ropeGeo.rotateX(Math.PI / 2);
      const ropeMat = new THREE.MeshBasicMaterial({
        color,
        wireframe: false,
      });
      const ropeMesh = new THREE.Mesh(ropeGeo, ropeMat);
      ropeMesh.name = `GrappleRope_${side}`;
      ropeMesh.visible = false;
      if (this.scene) {
        this.scene.add(ropeMesh);
      }
      this.hooks[side].ropeMesh = ropeMesh;

      // Claw: OctahedronGeometry(radius=0.35, detail=0)
      const clawGeo = new THREE.OctahedronGeometry(0.35, 0);
      const clawMat = new THREE.MeshBasicMaterial({
        color,
      });
      const clawMesh = new THREE.Mesh(clawGeo, clawMat);
      clawMesh.name = `GrappleClaw_${side}`;
      clawMesh.visible = false;
      if (this.scene) {
        this.scene.add(clawMesh);
      }
      this.hooks[side].clawMesh = clawMesh;
    }

    // 2. Build Surface Preview Ring
    // RingGeometry(innerRadius=0.4, outerRadius=0.65, thetaSegments=16)
    const ringGeo = new THREE.RingGeometry(0.4, 0.65, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.previewRing = new THREE.Mesh(ringGeo, ringMat);
    this.previewRing.name = 'GrapplePreviewRing';
    this.previewRing.visible = false;
    if (this.scene) {
      this.scene.add(this.previewRing);
    }
  }

  /**
   * Binds or re-parents visual meshes to a new Three.js scene.
   *
   * @param {THREE.Scene|null} scene
   */
  setScene(scene) {
    if (this.scene === scene) return;

    // Remove meshes from existing scene
    if (this.scene) {
      for (const side of ['left', 'right']) {
        if (this.hooks[side].ropeMesh) this.scene.remove(this.hooks[side].ropeMesh);
        if (this.hooks[side].clawMesh) this.scene.remove(this.hooks[side].clawMesh);
      }
      if (this.previewRing) this.scene.remove(this.previewRing);
    }

    this.scene = scene;

    // Attach to new scene
    if (this.scene) {
      for (const side of ['left', 'right']) {
        if (this.hooks[side].ropeMesh) this.scene.add(this.hooks[side].ropeMesh);
        if (this.hooks[side].clawMesh) this.scene.add(this.hooks[side].clawMesh);
      }
      if (this.previewRing) this.scene.add(this.previewRing);
    }
  }

  /**
   * Sets the player reference for physics calculations and muzzle offsets.
   *
   * @param {import('./PlayerController.js').PlayerController|{ body: CANNON.Body }} player
   */
  setPlayer(player) {
    this.player = player;
  }

  /**
   * Attaches a hook to a target world anchor point and normal.
   *
   * @param {'left'|'right'} side Hook channel identifier
   * @param {THREE.Vector3|{x: number, y: number, z: number}} targetPoint World anchor location
   * @param {THREE.Vector3|{x: number, y: number, z: number}|((side: string) => void)} [targetNormal] Surface normal or optional callback
   * @param {(side: string) => void} [onSuccessCallback] Optional callback invoked on attachment
   */
  fireHook(side, targetPoint, targetNormal = null, onSuccessCallback = null) {
    const hook = this.hooks[side];
    if (!hook || !targetPoint) return false;

    // Handle flexible 3-argument invocation: fireHook(side, targetPoint, callback)
    if (typeof targetNormal === 'function' && onSuccessCallback === null) {
      onSuccessCallback = targetNormal;
      targetNormal = null;
    }

    const tx = targetPoint.x ?? 0;
    const ty = targetPoint.y ?? 0;
    const tz = targetPoint.z ?? 0;

    // Validate finite numerical coordinates
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
      return false;
    }

    hook.active = true;
    hook.anchor.set(tx, ty, tz);

    if (targetNormal) {
      const nx = targetNormal.x ?? 0;
      const ny = targetNormal.y ?? 1;
      const nz = targetNormal.z ?? 0;
      if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) {
        hook.normal.set(nx, ny, nz);
      } else {
        hook.normal.set(0, 1, 0);
      }
    } else {
      hook.normal.set(0, 1, 0);
    }

    if (hook.clawMesh) {
      hook.clawMesh.visible = true;
      hook.clawMesh.position.copy(hook.anchor);
    }

    if (hook.ropeMesh) {
      hook.ropeMesh.visible = true;
      // Pre-position rope immediately so no 1-frame visual flash occurs at (0, 0, 0)
      this._updateHookRope(side);
    }

    if (typeof onSuccessCallback === 'function') {
      onSuccessCallback(side);
    }

    return true;
  }

  /**
   * Detaches a hook, hiding visual elements and strictly conserving 100% of player velocity.
   *
   * @param {'left'|'right'} side Hook channel identifier
   */
  releaseHook(side) {
    const hook = this.hooks[side];
    if (!hook) return;

    hook.active = false;

    if (hook.ropeMesh) {
      hook.ropeMesh.visible = false;
    }
    if (hook.clawMesh) {
      hook.clawMesh.visible = false;
    }

    // Zero recorded forces and distance for telemetry
    hook.lastForce.set(0, 0, 0);
    hook.lastPullForce = 0;
    hook.lastTensionForce = 0;
    hook.lastRadialVelocity = 0;
    hook.lastDistance = 0;

    // Strict PRD Requirement: Conserves 100% of player.body.velocity (does NOT damp or clamp).
    // player.body.velocity is left untouched.
  }

  /**
   * Releases both left and right hooks simultaneously.
   */
  releaseAll() {
    this.releaseHook('left');
    this.releaseHook('right');
  }

  /**
   * Returns true if the specified hook channel is currently attached and pulling.
   *
   * @param {'left'|'right'} side
   * @returns {boolean}
   */
  isHookActive(side) {
    return this.hooks[side]?.active ?? false;
  }

  /**
   * Returns the count of currently active hooks (0, 1, or 2).
   *
   * @returns {number}
   */
  getActiveCount() {
    let count = 0;
    if (this.hooks.left.active) count++;
    if (this.hooks.right.active) count++;
    return count;
  }

  /**
   * Fixed physics step solver for linear pull and slack-cancellation forces.
   * Implements PRD.md Section 4.4.C:
   * 1. Evaluates active hook count N in {0, 1, 2}.
   * 2. Sets base acceleration (58 m/s^2 single, 37.7 m/s^2 dual).
   * 3. Calculates vector to anchor d, length L, unit direction u.
   * 4. Applies proximity softening if L < 2.5m.
   * 5. Computes radial velocity v_radial = velocity . u.
   * 6. If v_radial < 0 (moving/falling away), applies tension counter-force:
   *    F_tension = mass * (-v_radial * 8.5) * u.
   * 7. Sums total force F_total = (mass * a_pull * u) + F_tension and applies to player body
   *    at the center of mass (preventing spurious rotational torque).
   *
   * @param {number} [dt=1/60] Simulation delta time
   */
  fixedUpdate(dt = CONFIG.PHYSICS?.TIMESTEP ?? 1 / 60) {
    if (typeof dt === 'number' && (!Number.isFinite(dt) || dt <= 0)) return;

    const activeCount = this.getActiveCount();
    if (activeCount === 0) return;

    const playerBody = this.player?.body || (this.player?.position && this.player?.velocity ? this.player : null);
    if (!playerBody || !playerBody.position || !playerBody.velocity) return;

    const playerPos = playerBody.position;
    const playerVel = playerBody.velocity;

    // Sanitize against NaN / non-finite inputs
    if (!Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.y) || !Number.isFinite(playerPos.z)) {
      return;
    }
    if (!Number.isFinite(playerVel.x) || !Number.isFinite(playerVel.y) || !Number.isFinite(playerVel.z)) {
      playerVel.x = 0;
      playerVel.y = 0;
      playerVel.z = 0;
    }

    const singlePull = CONFIG.GRAPPLE?.SINGLE_PULL_ACCEL ?? 58.0;
    const dualPull = CONFIG.GRAPPLE?.DUAL_PULL_ACCEL ?? 37.7;
    const baseAccel = activeCount === 1 ? singlePull : dualPull;
    const rawMass = playerBody.mass;
    const mass = (typeof rawMass === 'number' && Number.isFinite(rawMass) && rawMass > 0)
      ? rawMass
      : (CONFIG.PHYSICS?.PLAYER_MASS ?? 70.0);
    const minDetachDist = CONFIG.GRAPPLE?.MIN_DETACH_DIST ?? 2.5;
    const tensionDamping = CONFIG.GRAPPLE?.TENSION_DAMPING ?? 8.5;

    for (const side of ['left', 'right']) {
      const hook = this.hooks[side];
      if (!hook.active) continue;

      // 1. Vector to Anchor: d = anchor - playerPos, L = length, u = d / L
      this._vD.set(
        hook.anchor.x - playerPos.x,
        hook.anchor.y - playerPos.y,
        hook.anchor.z - playerPos.z
      );
      const L = this._vD.length();

      // Guard against zero-distance numerical singularity and NaN
      if (!Number.isFinite(L) || L < 1e-4) {
        hook.lastForce.set(0, 0, 0);
        hook.lastPullForce = 0;
        hook.lastTensionForce = 0;
        hook.lastRadialVelocity = 0;
        hook.lastDistance = Number.isFinite(L) ? L : 0;
        continue;
      }

      this._vU.copy(this._vD).multiplyScalar(1 / L);

      // 2. Proximity Softening: scale a_pull by (L / 2.5) when L < 2.5m
      let a_pull = baseAccel;
      if (L < minDetachDist) {
        a_pull = baseAccel * (L / minDetachDist);
      }

      // 3. Radial Velocity: v_radial = playerVelocity . u
      this._vPlayerVel.set(playerVel.x, playerVel.y, playerVel.z);
      const v_radial = this._vPlayerVel.dot(this._vU);

      // 4. Slack / Fall Cancellation Force:
      // When v_radial < 0, the player is moving/falling away from the anchor.
      // Counter-tension force cancels outward momentum.
      this._vFTension.set(0, 0, 0);
      if (v_radial < 0) {
        const tensionMag = mass * (-v_radial * tensionDamping);
        this._vFTension.copy(this._vU).multiplyScalar(tensionMag);
      }

      // 5. Linear Pull Force: F_pull = mass * a_pull * u
      const pullMag = mass * a_pull;
      this._vFPull.copy(this._vU).multiplyScalar(pullMag);

      // 6. Total Force: F_total = F_pull + F_tension
      this._vFTotal.addVectors(this._vFPull, this._vFTension);

      // Cache telemetry for inspection and testing
      hook.lastForce.copy(this._vFTotal);
      hook.lastPullForce = pullMag;
      hook.lastTensionForce = this._vFTension.length();
      hook.lastRadialVelocity = v_radial;
      hook.lastDistance = L;

      // 7. Apply force to Cannon physics body at center of mass
      // In Cannon-es, applyForce(force, relativePoint) treats relativePoint as displacement
      // from center of mass. Passing (0, 0, 0) applies force strictly to center of mass,
      // avoiding massive artificial rotational torque.
      if (typeof playerBody.applyForce === 'function') {
        this._cannonForce.set(this._vFTotal.x, this._vFTotal.y, this._vFTotal.z);
        playerBody.applyForce(this._cannonForce, this._zeroVec);
      }
    }
  }

  /**
   * Helper to retrieve muzzle world position for a given side, supporting
   * PlayerController methods, mesh hierarchy, and Cannon body positions.
   *
   * @private
   * @param {'left'|'right'} side
   * @param {THREE.Vector3} target Scratch vector
   * @returns {THREE.Vector3}
   */
  _getMuzzlePosition(side, target) {
    if (side === 'left') {
      if (typeof this.player?.getLeftMuzzlePosition === 'function') {
        return this.player.getLeftMuzzlePosition(target);
      }
      if (typeof this.player?.getMuzzlePosition === 'function') {
        return this.player.getMuzzlePosition('left', target);
      }
    } else {
      if (typeof this.player?.getRightMuzzlePosition === 'function') {
        return this.player.getRightMuzzlePosition(target);
      }
      if (typeof this.player?.getMuzzlePosition === 'function') {
        return this.player.getMuzzlePosition('right', target);
      }
    }

    // Fallback: extract player world coordinates from body, mesh, or position object
    const px = this.player?.body?.position?.x
      ?? this.player?.mesh?.position?.x
      ?? this.player?.position?.x
      ?? 0;
    const py = this.player?.body?.position?.y
      ?? this.player?.mesh?.position?.y
      ?? this.player?.position?.y
      ?? 0;
    const pz = this.player?.body?.position?.z
      ?? this.player?.mesh?.position?.z
      ?? this.player?.position?.z
      ?? 0;

    const lateralOffset = side === 'left' ? -0.42 : 0.42;
    return target.set(px + lateralOffset, py - 0.1, pz);
  }

  /**
   * Internal helper to update a single hook's 3D rope cylinder midpoint,
   * orientation, and length scaling.
   *
   * @private
   * @param {'left'|'right'} side
   */
  _updateHookRope(side) {
    const hook = this.hooks[side];
    if (!hook || !hook.ropeMesh) return;

    const muzzlePos = this._getMuzzlePosition(side, this._scratchMuzzle);
    const distance = muzzlePos.distanceTo(hook.anchor);

    // Midpoint transform and orientation for 3D rope cylinder
    hook.ropeMesh.position.set(
      (muzzlePos.x + hook.anchor.x) * 0.5,
      (muzzlePos.y + hook.anchor.y) * 0.5,
      (muzzlePos.z + hook.anchor.z) * 0.5
    );

    if (distance > 1e-4) {
      hook.ropeMesh.lookAt(hook.anchor);
    }

    // Scale along local +Z axis where height was aligned
    hook.ropeMesh.scale.set(1, 1, Math.max(0.01, distance));
  }

  /**
   * Updates 3D rope midpoint transforms, lookAt orientations, length scales,
   * claw anchor positions, and surface preview reticle ring alignment.
   *
   * @param {{ hit: boolean, point?: THREE.Vector3|{x: number, y: number, z: number}, normal?: THREE.Vector3|{x: number, y: number, z: number} }|null} [targetInfo]
   */
  updateVisuals(targetInfo = null) {
    // 1. Update Surface Preview Ring
    if (this.previewRing) {
      if (targetInfo && targetInfo.hit && targetInfo.point) {
        const px = targetInfo.point.x;
        const py = targetInfo.point.y;
        const pz = targetInfo.point.z;

        if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) {
          this.previewRing.visible = true;

          const rawNorm = targetInfo.normal;
          const nx = (typeof rawNorm?.x === 'number' && Number.isFinite(rawNorm.x)) ? rawNorm.x : 0;
          const ny = (typeof rawNorm?.y === 'number' && Number.isFinite(rawNorm.y)) ? rawNorm.y : 1;
          const nz = (typeof rawNorm?.z === 'number' && Number.isFinite(rawNorm.z)) ? rawNorm.z : 0;

          // Position slightly offset along surface normal to eliminate Z-fighting
          this.previewRing.position.set(
            px + nx * 0.02,
            py + ny * 0.02,
            pz + nz * 0.02
          );

          // Align ring normal (RingGeometry is built on XY plane, normal along +Z) with surface normal
          this._scratchTargetNormal.set(nx, ny, nz);
          if (this._scratchTargetNormal.lengthSq() < 1e-6) {
            this._scratchTargetNormal.set(0, 1, 0);
          } else {
            this._scratchTargetNormal.normalize();
          }

          this.previewRing.quaternion.setFromUnitVectors(this._unitZ, this._scratchTargetNormal);
        } else {
          this.previewRing.visible = false;
        }
      } else {
        this.previewRing.visible = false;
      }
    }

    // 2. Update Active Hooks 3D Ropes and Claws
    for (const side of ['left', 'right']) {
      const hook = this.hooks[side];
      if (!hook.active) {
        if (hook.ropeMesh) hook.ropeMesh.visible = false;
        if (hook.clawMesh) hook.clawMesh.visible = false;
        continue;
      }

      if (hook.ropeMesh) hook.ropeMesh.visible = true;
      if (hook.clawMesh) hook.clawMesh.visible = true;

      // Update rope transform
      this._updateHookRope(side);

      // Position claw octahedron at the world anchor point
      if (hook.clawMesh) {
        hook.clawMesh.position.copy(hook.anchor);
      }
    }
  }

  /**
   * Release resources, dispose geometries, materials, and detach meshes from scene.
   */
  dispose() {
    this.releaseAll();

    for (const side of ['left', 'right']) {
      const hook = this.hooks[side];

      if (hook.ropeMesh) {
        if (this.scene) this.scene.remove(hook.ropeMesh);
        if (hook.ropeMesh.parent) hook.ropeMesh.parent.remove(hook.ropeMesh);
        if (hook.ropeMesh.geometry) hook.ropeMesh.geometry.dispose();
        if (hook.ropeMesh.material) hook.ropeMesh.material.dispose();
        hook.ropeMesh = null;
      }

      if (hook.clawMesh) {
        if (this.scene) this.scene.remove(hook.clawMesh);
        if (hook.clawMesh.parent) hook.clawMesh.parent.remove(hook.clawMesh);
        if (hook.clawMesh.geometry) hook.clawMesh.geometry.dispose();
        if (hook.clawMesh.material) hook.clawMesh.material.dispose();
        hook.clawMesh = null;
      }
    }

    if (this.previewRing) {
      if (this.scene) this.scene.remove(this.previewRing);
      if (this.previewRing.parent) this.previewRing.parent.remove(this.previewRing);
      if (this.previewRing.geometry) this.previewRing.geometry.dispose();
      if (this.previewRing.material) this.previewRing.material.dispose();
      this.previewRing = null;
    }
  }
}

export const GrappleSystem = GrapplePhysics;
export default GrapplePhysics;

