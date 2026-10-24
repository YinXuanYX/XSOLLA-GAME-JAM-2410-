import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GrappleRaycaster } from './GrappleRaycaster.js';
import { GrapplePhysics } from './GrapplePhysics.js';

/**
 * GrappleSystem is the unified dual-hook system for AERO-HOOK (Version 2.0).
 *
 * Merges:
 * - Sub-Agent 1C-1: Hybrid Center Raycast + 2-Ring Magnetism Cone Targeting (src/GrappleRaycaster.js)
 * - Sub-Agent 1C-2: Dual-Hook State, 3D Rope/Claw/Preview Visuals & Slack-Cancellation Physics (src/GrapplePhysics.js)
 * - Sub-Agent 1-V2C: Tron / Beat Saber Aesthetic, Preview Ring Z-fighting fix, and Pooled Grapple Connect Impact Burst
 *
 * Implements PRD Section 4.4 & V2.0 Upgrades:
 * - Opposing Dual-Color Scheme (Tron / Beat Saber):
 *   * Left Hook: CONFIG.COLORS.HOOK_LEFT (0xff0044 Crimson Red)
 *   * Right Hook: CONFIG.COLORS.HOOK_RIGHT (0x00aaff Electric Blue)
 * - Surface Preview Ring Z-Fighting Fix:
 *   * Material polygonOffset: true, factor -2, units -2, depthWrite: false
 *   * Normal-offset positioning: target.point + normal * 0.06m
 * - Pooled Grapple Impact Dust/Spark Burst System:
 *   * Pre-allocated pool of 6 burst slots, 18 box particles each (BoxGeometry 0.14)
 *   * Alternating hook color and spark white (0xd8f8ff)
 *   * Hemisphere reflection away from surface normal
 *   * Dynamic decay, gravity (-9.8 m/s^2), rotation, and scale shrink over 0.38s
 * - Single hook pull: 58.0 m/s^2, Dual hook pull: 37.7 m/s^2 per hook (1.3x combined)
 * - Proximity softening (< 2.5m)
 * - Slack / Fall Cancellation Force (F_tension = m * (-v_radial * 8.5) * u_i)
 * - 100% velocity conservation on release
 */
export class GrappleSystem {
  /**
   * @param {THREE.Scene} [scene] Three.js scene for 3D rope/claw, preview ring and impact particles
   * @param {THREE.Camera} [camera] Player camera for raycasting direction and position
   * @param {import('./PlayerController.js').PlayerController|{ body: any, mesh: any }} [player] Player controller instance
   * @param {typeof CONFIG} [config=CONFIG] Game configuration
   */
  constructor(scene = null, camera = null, player = null, config = CONFIG) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.config = config || CONFIG;

    // Scratch math vectors
    this._defaultNormal = new THREE.Vector3(0, 1, 0);
    this._scratchImpactNormal = new THREE.Vector3();
    this._scratchRandDir = new THREE.Vector3();
    this._scratchPreviewNormal = new THREE.Vector3();

    // Prevent browser context menu on right click (Mouse2) so right-hook never breaks PointerLock (PRD §4.4.A)
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._contextMenuHandler = (e) => e.preventDefault();
      window.addEventListener('contextmenu', this._contextMenuHandler);
    }

    // 1. Initialize Targeting Raycaster (Sub-Agent 1C-1)
    this.raycaster = new GrappleRaycaster(this.config);

    // Target telemetry cache
    this.targetInfo = {
      hit: false,
      point: null,
      normal: null,
      assisted: false,
      distance: null,
    };

    // 2. Initialize Physics & 3D Visuals (Sub-Agent 1C-2)
    this.physics = new GrapplePhysics(this.scene, this.player);

    // Direct references to hook states and visual preview ring
    this.hooks = this.physics.hooks;
    this.previewRing = this.physics.previewRing;

    // Apply Tron / Beat Saber opposing color scheme & preview ring Z-fighting material fixes
    this._applyHookColors();
    this._configurePreviewRingMaterial();

    // 3. Initialize Pooled Impact Dust/Spark Bursts (V2.0)
    this._initImpactBursts();
  }

  /**
   * Applies Opposing Dual-Color Scheme:
   * Left Hook rope and anchor claw use CONFIG.COLORS.HOOK_LEFT (0xff0044 Red).
   * Right Hook rope and anchor claw use CONFIG.COLORS.HOOK_RIGHT (0x00aaff Blue).
   * @private
   */
  _applyHookColors() {
    const leftColor = this.config.COLORS?.HOOK_LEFT ?? 0xff0044;
    const rightColor = this.config.COLORS?.HOOK_RIGHT ?? 0x00aaff;

    if (this.hooks?.left?.ropeMesh?.material) {
      this.hooks.left.ropeMesh.material.color.setHex(leftColor);
    }
    if (this.hooks?.left?.clawMesh?.material) {
      this.hooks.left.clawMesh.material.color.setHex(leftColor);
    }
    if (this.hooks?.right?.ropeMesh?.material) {
      this.hooks.right.ropeMesh.material.color.setHex(rightColor);
    }
    if (this.hooks?.right?.clawMesh?.material) {
      this.hooks.right.clawMesh.material.color.setHex(rightColor);
    }
  }

  /**
   * Configures preview ring material with polygon offset and depth write settings
   * to eliminate Z-fighting against surfaces.
   * @private
   */
  _configurePreviewRingMaterial() {
    if (this.previewRing?.material) {
      this.previewRing.material.polygonOffset = true;
      this.previewRing.material.polygonOffsetFactor = -2;
      this.previewRing.material.polygonOffsetUnits = -2;
      this.previewRing.material.depthWrite = false;
    }
  }

  /**
   * Pre-allocates pooled impact dust/spark burst emitters and particle meshes.
   * @private
   */
  _initImpactBursts() {
    const poolSize = this.config.FX?.IMPACT_POOL_SIZE ?? 6;
    const particleCount = this.config.FX?.IMPACT_PARTICLE_COUNT ?? 18;
    this.impactBoxGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this.impactBursts = [];

    const sparkWhite = this.config.COLORS?.SPARK_WHITE ?? 0xd8f8ff;

    for (let b = 0; b < poolSize; b++) {
      const particles = [];
      for (let p = 0; p < particleCount; p++) {
        const mat = new THREE.MeshStandardMaterial({
          color: sparkWhite,
          emissive: sparkWhite,
          emissiveIntensity: 1.5,
          roughness: 0.2,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(this.impactBoxGeo, mat);
        mesh.name = `GrappleImpactDust_${b}_${p}`;
        mesh.visible = false;
        mesh.frustumCulled = false;

        if (this.scene) {
          this.scene.add(mesh);
        }

        particles.push({
          mesh,
          velocity: new THREE.Vector3(),
          rotSpeed: new THREE.Vector3(),
        });
      }

      this.impactBursts.push({
        active: false,
        timer: 0,
        particles,
      });
    }
  }

  /**
   * Binds or updates the camera reference.
   * @param {THREE.Camera} camera
   */
  setCamera(camera) {
    this.camera = camera;
  }

  /**
   * Binds or updates the player reference.
   * @param {import('./PlayerController.js').PlayerController} player
   */
  setPlayer(player) {
    this.player = player;
    if (this.physics) {
      this.physics.setPlayer(player);
    }
  }

  /**
   * Binds or re-parents visual meshes and impact particles to a new Three.js scene.
   * @param {THREE.Scene} scene
   */
  setScene(scene) {
    if (this.scene === scene) return;

    // Remove impact burst meshes from existing scene
    if (this.scene && this.impactBursts) {
      for (const burst of this.impactBursts) {
        for (const p of burst.particles) {
          if (p.mesh) this.scene.remove(p.mesh);
        }
      }
    }

    this.scene = scene;
    if (this.physics) {
      this.physics.setScene(scene);
      this.previewRing = this.physics.previewRing;
      this.hooks = this.physics.hooks;
      this._applyHookColors();
      this._configurePreviewRingMaterial();
    }

    // Attach impact burst meshes to new scene
    if (this.scene && this.impactBursts) {
      for (const burst of this.impactBursts) {
        for (const p of burst.particles) {
          if (p.mesh) this.scene.add(p.mesh);
        }
      }
    }
  }

  /**
   * Runs the hybrid center-screen direct raycast and magnetism cone fallback
   * against the provided grappleable meshes.
   *
   * @param {Array<THREE.Mesh>|{ grappleableMeshes: Array<THREE.Mesh> }} grappleableMeshes
   * @returns {{ hit: boolean, point: THREE.Vector3|null, normal: THREE.Vector3|null, assisted: boolean, distance: number|null }}
   */
  findTargetPoint(grappleableMeshes = []) {
    if (!this.camera) {
      this.targetInfo.hit = false;
      this.targetInfo.point = null;
      this.targetInfo.normal = null;
      this.targetInfo.assisted = false;
      this.targetInfo.distance = null;
      return this.targetInfo;
    }

    // Raycaster fills targetInfo in-place to ensure zero-allocation steady state
    return this.raycaster.findTargetPoint(this.camera, this.player, grappleableMeshes, this.targetInfo);
  }

  /**
   * Spawns a pooled impact dust/spark burst at the anchor contact point.
   *
   * @param {THREE.Vector3|{x: number, y: number, z: number}} point World anchor impact position
   * @param {THREE.Vector3|{x: number, y: number, z: number}} [normal] Surface contact normal
   * @param {number} [hookColor] Channel color (HOOK_LEFT 0xff0044 or HOOK_RIGHT 0x00aaff)
   * @returns {object|null} The active burst slot object
   */
  spawnImpactDust(point, normal, hookColor) {
    if (!point || !this.impactBursts || this.impactBursts.length === 0) return null;

    // Pick next available or oldest active burst slot (highest timer)
    let burst = this.impactBursts.find((b) => !b.active);
    if (!burst) {
      burst = this.impactBursts.reduce((oldest, b) => (b.timer > oldest.timer ? b : oldest), this.impactBursts[0]);
    }

    burst.active = true;
    burst.timer = 0;

    // Ensure normal is normalized (fallback to (0, 1, 0) if missing or degenerate)
    const norm = this._scratchImpactNormal;
    if (normal && typeof normal.x === 'number' && Number.isFinite(normal.x) &&
        typeof normal.y === 'number' && Number.isFinite(normal.y) &&
        typeof normal.z === 'number' && Number.isFinite(normal.z)) {
      norm.set(normal.x, normal.y, normal.z);
      if (norm.lengthSq() < 1e-6) {
        norm.copy(this._defaultNormal);
      } else {
        norm.normalize();
      }
    } else {
      norm.copy(this._defaultNormal);
    }

    const sparkWhite = this.config.COLORS?.SPARK_WHITE ?? 0xd8f8ff;
    const resolvedColor = (typeof hookColor === 'number') ? hookColor : (this.config.COLORS?.HOOK_LEFT ?? 0xff0044);
    const randDir = this._scratchRandDir;

    const px = (typeof point.x === 'number' && Number.isFinite(point.x)) ? point.x : 0;
    const py = (typeof point.y === 'number' && Number.isFinite(point.y)) ? point.y : 0;
    const pz = (typeof point.z === 'number' && Number.isFinite(point.z)) ? point.z : 0;

    for (let i = 0; i < burst.particles.length; i++) {
      const p = burst.particles[i];
      p.mesh.visible = true;
      p.mesh.scale.setScalar(1.0);
      p.mesh.rotation.set(0, 0, 0);

      // Color even particles (i % 2 === 0) with hookColor and odd particles with sparkWhite
      if (i % 2 === 0) {
        p.mesh.material.color.setHex(resolvedColor);
        if (p.mesh.material.emissive) p.mesh.material.emissive.setHex(resolvedColor);
      } else {
        p.mesh.material.color.setHex(sparkWhite);
        if (p.mesh.material.emissive) p.mesh.material.emissive.setHex(sparkWhite);
      }

      // Position at point + normal * 0.08
      p.mesh.position.set(
        px + norm.x * 0.08,
        py + norm.y * 0.08,
        pz + norm.z * 0.08
      );

      // Generate random unit vector randDir (uniform sphere surface sampling)
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const sinPhi = Math.sin(phi);
      randDir.set(
        sinPhi * Math.cos(theta),
        sinPhi * Math.sin(theta),
        Math.cos(phi)
      );

      // If randDir.dot(normal) < 0, reflect it so all particles burst outward into the hemisphere facing away from the wall
      const dot = randDir.dot(norm);
      if (dot < 0) {
        randDir.addScaledVector(norm, -2.0 * dot);
      }

      // Compute speed spd = 4.0 + Math.random() * 10.0
      const spd = 4.0 + Math.random() * 10.0;

      // Set velocity: normal * 3.5 + randDir * spd
      p.velocity.copy(norm).multiplyScalar(3.5).addScaledVector(randDir, spd);

      // Set rotation speed: ((Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*15)
      p.rotSpeed.set(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15
      );
    }

    return burst;
  }

  /**
   * Attempts to fire a hook along the specified side ('left' or 'right').
   * Finds the best target point against grappleableMeshes, anchors the hook,
   * activates the tether, spawns the pooled impact dust burst, and invokes onSuccessCallback(side).
   *
   * @param {'left'|'right'} side Hook channel side
   * @param {Array<THREE.Mesh>|{ grappleableMeshes: Array<THREE.Mesh> }} grappleableMeshes
   * @param {(side: 'left'|'right') => void} [onSuccessCallback] Optional callback invoked on successful attachment
   * @returns {boolean} True if hook successfully anchored, false otherwise
   */
  tryFireHook(side, grappleableMeshes, onSuccessCallback = null) {
    if (side !== 'left' && side !== 'right') return false;

    // Evaluate target point
    const target = this.findTargetPoint(grappleableMeshes);

    if (target && target.hit && target.point) {
      this.physics.fireHook(side, target.point, target.normal, onSuccessCallback);

      const color = side === 'left'
        ? (this.config.COLORS?.HOOK_LEFT ?? 0xff0044)
        : (this.config.COLORS?.HOOK_RIGHT ?? 0x00aaff);
      this.spawnImpactDust(target.point, target.normal, color);

      return true;
    }

    return false;
  }

  /**
   * Releases an active hook on the specified side ('left' or 'right').
   * Immediately detaches tether and hides visual rope/claw meshes.
   * 100% of player velocity is conserved (no damping or clamping applied).
   *
   * @param {'left'|'right'} side Hook channel side
   */
  releaseHook(side) {
    if (this.physics) {
      this.physics.releaseHook(side);
    }
  }

  /**
   * Releases all active hooks simultaneously.
   * Conserves 100% of player velocity.
   * Active impact dust bursts are left to finish fading naturally.
   */
  releaseAll() {
    if (this.physics) {
      this.physics.releaseAll();
    }
  }

  /**
   * Fixed physics sub-step update for grapple forces.
   * Calculates pull acceleration (single vs dual), proximity softening, and
   * slack/fall cancellation force opposing negative radial velocity.
   *
   * @param {number} [dt] Physics timestep in seconds
   */
  fixedUpdate(dt = CONFIG.PHYSICS.TIMESTEP) {
    if (this.physics) {
      this.physics.fixedUpdate(dt);
    }
  }

  /**
   * Updates all active impact bursts, advancing particle positions, gravity, rotations,
   * and linear scale decay until duration expires.
   *
   * @param {number} [dt=1/60] Delta time in seconds
   */
  updateImpactBursts(dt = 1 / 60) {
    if (!this.impactBursts) return;

    const stepDt = (typeof dt === 'number' && Number.isFinite(dt)) ? dt : (1 / 60);
    if (stepDt <= 0) return;

    const duration = this.config.FX?.IMPACT_DURATION ?? 0.38;

    for (let i = 0; i < this.impactBursts.length; i++) {
      const burst = this.impactBursts[i];
      if (!burst.active) continue;

      burst.timer += stepDt;

      if (burst.timer >= duration) {
        burst.active = false;
        for (let j = 0; j < burst.particles.length; j++) {
          burst.particles[j].mesh.visible = false;
        }
      } else {
        const scale = Math.max(0.001, 1.0 - (burst.timer / duration));
        for (let j = 0; j < burst.particles.length; j++) {
          const p = burst.particles[j];
          p.mesh.position.addScaledVector(p.velocity, stepDt);
          p.velocity.y -= 9.8 * stepDt;
          p.mesh.rotation.x += p.rotSpeed.x * stepDt;
          p.mesh.rotation.y += p.rotSpeed.y * stepDt;
          p.mesh.rotation.z += p.rotSpeed.z * stepDt;
          p.mesh.scale.setScalar(scale);
        }
      }
    }
  }

  /**
   * Visual update step called every animation frame.
   * Updates targetInfo, positions and aligns the surface preview ring with +0.06m normal offset,
   * updates 3D rope cylinder and claw transforms, and simulates active impact bursts.
   *
   * @param {Array<THREE.Mesh>|{ grappleableMeshes: Array<THREE.Mesh> }} grappleableMeshes
   * @param {number} [dt=1/60] Frame delta time in seconds
   */
  updateVisuals(grappleableMeshes = [], dt = 1 / 60) {
    // 1. Live reticle raycasting
    this.targetInfo = this.findTargetPoint(grappleableMeshes);

    // 2. Update visual preview ring and active rope/claw meshes
    if (this.physics) {
      this.physics.updateVisuals(this.targetInfo);
    }

    // 3. Surface Preview Ring Z-Fighting Fix:
    // Always offset position along surface normal by +0.06 meters
    if (this.previewRing) {
      if (this.targetInfo && this.targetInfo.hit && this.targetInfo.point) {
        this.previewRing.visible = true;
        const norm = (this.targetInfo.normal && typeof this.targetInfo.normal.x === 'number')
          ? this.targetInfo.normal
          : this._defaultNormal;
        this.previewRing.position.copy(this.targetInfo.point).addScaledVector(norm, 0.06);
      } else {
        this.previewRing.visible = false;
      }
    }

    // 4. Update impact dust bursts
    this.updateImpactBursts(dt);
  }

  /**
   * Checks whether a specific hook is currently active.
   * @param {'left'|'right'} side
   * @returns {boolean}
   */
  isHookActive(side) {
    return Boolean(this.hooks?.[side]?.active);
  }

  /**
   * Returns total count of currently active hooks (0, 1, or 2).
   * @returns {number}
   */
  getActiveHookCount() {
    let count = 0;
    if (this.hooks?.left?.active) count++;
    if (this.hooks?.right?.active) count++;
    return count;
  }

  /**
   * Resets all hooks, hiding visual meshes, resetting targeting telemetry,
   * and deactivating/hiding all impact bursts on full course reset.
   */
  reset() {
    this.releaseAll();
    if (this.previewRing) {
      this.previewRing.visible = false;
    }
    this.targetInfo.hit = false;
    this.targetInfo.point = null;
    this.targetInfo.normal = null;
    this.targetInfo.assisted = false;
    this.targetInfo.distance = null;

    // Reset and hide all impact bursts on full course reset
    if (this.impactBursts) {
      for (const burst of this.impactBursts) {
        burst.active = false;
        burst.timer = 0;
        for (const p of burst.particles) {
          p.mesh.visible = false;
        }
      }
    }
  }

  /**
   * Disposes of visual meshes, materials, geometries, and removes event listeners.
   */
  dispose() {
    if (typeof window !== 'undefined' && this._contextMenuHandler) {
      window.removeEventListener('contextmenu', this._contextMenuHandler);
    }

    this.reset();

    // Dispose impact bursts
    if (this.impactBursts) {
      for (const burst of this.impactBursts) {
        for (const p of burst.particles) {
          if (this.scene && p.mesh) {
            this.scene.remove(p.mesh);
          }
          if (p.mesh?.parent) {
            p.mesh.parent.remove(p.mesh);
          }
          if (p.mesh?.material) {
            p.mesh.material.dispose();
          }
          p.mesh = null;
        }
        burst.particles = [];
      }
      this.impactBursts = [];
    }

    if (this.impactBoxGeo) {
      this.impactBoxGeo.dispose();
      this.impactBoxGeo = null;
    }

    if (this.physics) {
      this.physics.dispose();
    }
  }
}

// Named exports for both subsystems and convenience
export { GrappleRaycaster, GrapplePhysics };
export default GrappleSystem;
