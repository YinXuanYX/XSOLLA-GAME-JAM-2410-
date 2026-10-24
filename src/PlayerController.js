import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

/**
 * PlayerController manages the player's Cannon-es physics body,
 * the procedural 3rd-person low-poly character avatar, air-strafe vector
 * mechanics, banking/pitch visual animations, and high-speed ribbon trail.
 */
export class PlayerController {
  /**
   * @param {THREE.Scene} [scene] Optional Three.js scene to add visual mesh & trail
   * @param {import('./PhysicsWorld.js').PhysicsWorld|{ world: CANNON.World, addBody: Function, playerMaterial?: CANNON.Material }} [physicsWorld]
   */
  constructor(scene, physicsWorld) {
    this.scene = scene || null;
    this.physicsWorld = physicsWorld || null;

    // 1. Cannon.js Physics Body
    const playerMat = physicsWorld?.playerMaterial || physicsWorld?.world?.playerMaterial || undefined;
    this.body = new CANNON.Body({
      mass: CONFIG.PHYSICS.PLAYER_MASS,
      shape: new CANNON.Sphere(CONFIG.PHYSICS.PLAYER_RADIUS),
      material: playerMat,
      fixedRotation: true,
      linearDamping: CONFIG.PHYSICS.LINEAR_DAMPING,
    });
    this.body.userData = { type: 'PLAYER' };

    if (physicsWorld) {
      if (typeof physicsWorld.addBody === 'function') {
        physicsWorld.addBody(this.body);
      } else if (physicsWorld.world && typeof physicsWorld.world.addBody === 'function') {
        physicsWorld.world.addBody(this.body);
      }
    }

    // 2. Procedural Low-Poly Character Mesh Hierarchy
    this.mesh = new THREE.Group();
    this.mesh.name = 'PlayerAvatar';

    // Pivot group inside mesh for forward pitch and lateral banking (roll)
    this.pivotGroup = new THREE.Group();
    this.pivotGroup.name = 'PlayerPivot';
    this.mesh.add(this.pivotGroup);

    // A. Core Torso: Inverted ConeGeometry(0.45, 1.1, 6)
    const torsoGeo = new THREE.ConeGeometry(0.45, 1.1, 6);
    torsoGeo.rotateZ(Math.PI); // Invert cone: apex points down (-Y), wide shoulders at top (+Y)
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x2e3440,
      flatShading: true,
      roughness: 0.6,
    });
    this.torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    this.torsoMesh.castShadow = true;
    this.torsoMesh.receiveShadow = true;
    this.pivotGroup.add(this.torsoMesh);

    // B. Head & Visor
    const headGeo = new THREE.OctahedronGeometry(0.28, 1);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x4c566a,
      flatShading: true,
      roughness: 0.5,
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.set(0, 0.75, 0);
    this.headMesh.castShadow = true;
    this.pivotGroup.add(this.headMesh);

    const visorGeo = new THREE.BoxGeometry(0.36, 0.1, 0.25);
    const visorMat = new THREE.MeshBasicMaterial({
      color: CONFIG.COLORS.HOOK_LEFT,
    });
    this.visorMesh = new THREE.Mesh(visorGeo, visorMat);
    this.visorMesh.position.set(0, 0.75, -0.18);
    this.pivotGroup.add(this.visorMesh);

    // C. Hip ODM Launchers
    const podGeo = new THREE.BoxGeometry(0.18, 0.22, 0.45);
    const podMat = new THREE.MeshStandardMaterial({
      color: 0x3b4252,
      flatShading: true,
      roughness: 0.5,
    });

    this.leftPod = new THREE.Mesh(podGeo, podMat);
    this.leftPod.position.set(-0.42, -0.1, 0);
    this.leftPod.castShadow = true;

    this.rightPod = new THREE.Mesh(podGeo.clone(), podMat);
    this.rightPod.position.set(0.42, -0.1, 0);
    this.rightPod.castShadow = true;

    // Grapple hook rope attachment muzzle nodes
    this.leftMuzzle = new THREE.Object3D();
    this.leftMuzzle.position.set(0, 0, -0.25);
    this.leftPod.add(this.leftMuzzle);

    this.rightMuzzle = new THREE.Object3D();
    this.rightMuzzle.position.set(0, 0, -0.25);
    this.rightPod.add(this.rightMuzzle);

    this.pivotGroup.add(this.leftPod);
    this.pivotGroup.add(this.rightPod);

    // 3. Dynamic Ribbon Trail (24-vertex BufferGeometry)
    this.maxTrailPoints = 24;
    this.trailBuffer = [];
    this.trailHistory = this.trailBuffer; // Ergonomic alias
    this.trailPoints = this.trailBuffer;  // Ergonomic alias

    const vertexCount = 24;
    this.trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(vertexCount * 3);
    const trailColors = new Float32Array(vertexCount * 4);
    const trailAlphas = new Float32Array(vertexCount);

    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 4));
    this.trailGeometry.setAttribute('alpha', new THREE.BufferAttribute(trailAlphas, 1));

    // Construct quad indices connecting 12 segments (24 vertices)
    const indices = [];
    for (let k = 0; k < 11; k++) {
      const i0 = 2 * k;
      const i1 = 2 * k + 1;
      const i2 = 2 * (k + 1);
      const i3 = 2 * (k + 1) + 1;
      indices.push(i0, i1, i2);
      indices.push(i1, i3, i2);
    }
    this.trailGeometry.setIndex(indices);

    this.trailMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.trailMesh = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
    this.trailMesh.name = 'PlayerRibbonTrail';
    this.trailMesh.frustumCulled = false;
    this.trailMesh.visible = false;

    // Add to scene if provided
    if (this.scene) {
      this.scene.add(this.mesh);
      this.scene.add(this.trailMesh);
    }

    // Reusable vector scratchpad to avoid GC churn in animation frames
    this._vBackWorld = new THREE.Vector3();
    this._vDiff = new THREE.Vector3();
    this._vSide = new THREE.Vector3();
    this._vUp = new THREE.Vector3(0, 1, 0);
    this._upAlt = new THREE.Vector3(1, 0, 0);
    this._cyanColor = new THREE.Color(CONFIG.COLORS.HOOK_LEFT);
    this._zeroVec = new CANNON.Vec3(0, 0, 0);
    this._strafeForce = new CANNON.Vec3(0, 0, 0);
    this._trailPool = [];

    // Initial reset at default spawn location
    this.reset(0, 3, 0);
  }

  /**
   * Reset player physics body and visual state back to initial or specified position.
   * Zeroes velocity, forces, and torque, clears the ribbon trail, and syncs visuals.
   *
   * @param {number} [x=0] Spawn X coordinate
   * @param {number} [y=3] Spawn Y coordinate
   * @param {number} [z=0] Spawn Z coordinate
   */
  reset(x = 0, y = 3, z = 0) {
    // 1. Zero Cannon.js velocities, forces, torques, and integration history
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.force.set(0, 0, 0);
    this.body.torque.set(0, 0, 0);
    this.body.position.set(x, y, z);

    if (this.body.previousPosition) this.body.previousPosition.set(x, y, z);
    if (this.body.interpolatedPosition) this.body.interpolatedPosition.set(x, y, z);
    if (this.body.initPosition) this.body.initPosition.set(x, y, z);
    if (this.body.initVelocity) this.body.initVelocity.set(0, 0, 0);
    if (this.body.initAngularVelocity) this.body.initAngularVelocity.set(0, 0, 0);
    if (this.body.quaternion) this.body.quaternion.set(0, 0, 0, 1);
    if (this.body.initQuaternion) this.body.initQuaternion.set(0, 0, 0, 1);
    if (this.body.previousQuaternion) this.body.previousQuaternion.set(0, 0, 0, 1);
    if (this.body.interpolatedQuaternion) this.body.interpolatedQuaternion.set(0, 0, 0, 1);

    // 2. Clear ribbon trail buffer, recycle points into pool, and zero out attributes
    if (this._trailPool) {
      while (this.trailBuffer.length > 0) {
        this._trailPool.push(this.trailBuffer.pop());
      }
    } else {
      this.trailBuffer.length = 0;
    }

    if (this.trailGeometry) {
      this.trailGeometry.attributes.position.array.fill(0);
      this.trailGeometry.attributes.color.array.fill(0);
      this.trailGeometry.attributes.alpha.array.fill(0);
      this.trailGeometry.attributes.position.needsUpdate = true;
      this.trailGeometry.attributes.color.needsUpdate = true;
      this.trailGeometry.attributes.alpha.needsUpdate = true;
    }
    if (this.trailMesh) {
      this.trailMesh.visible = false;
    }

    // 3. Sync visual mesh transform
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, 0, 0);
    this.pivotGroup.rotation.set(0, 0, 0);
    this.mesh.updateMatrixWorld(true);
  }

  /**
   * Returns the player's total current velocity scalar in m/s.
   * @returns {number}
   */
  getSpeed() {
    return this.body.velocity.length();
  }

  /**
   * Fixed physics update step for air-strafing and speed limits.
   * Implements Section 4.3.A of PRD.md:
   * Computes desired horizontal wish direction from WASD and cameraYaw,
   * projects current velocity onto wish direction, and applies air strafe force
   * if current directional speed is below AIR_STRAFE_MAX_SPEED (20.0 m/s).
   * Hard clamps velocity vector to CONFIG.PHYSICS.MAX_SPEED (75.0 m/s).
   *
   * @param {number} [dt] Substep delta time in seconds
   * @param {Object} [keys={}] Key state map (keys.KeyW, keys.KeyS, keys.KeyA, keys.KeyD)
   * @param {number} [cameraYaw=0] Camera yaw angle in radians
   */
  fixedUpdate(dt = CONFIG.PHYSICS.TIMESTEP, keys = {}, cameraYaw = 0) {
    // 1. Sanitize velocity against NaN / Infinity
    if (!Number.isFinite(this.body.velocity.x) || !Number.isFinite(this.body.velocity.y) || !Number.isFinite(this.body.velocity.z)) {
      this.body.velocity.set(0, 0, 0);
    }

    // 2. Air-strafe directional input from WASD / Arrow keys (NO JUMP on Space)
    const isW = Boolean(keys?.KeyW || keys?.keyW || keys?.w || keys?.W || keys?.ArrowUp);
    const isS = Boolean(keys?.KeyS || keys?.keyS || keys?.s || keys?.S || keys?.ArrowDown);
    const isA = Boolean(keys?.KeyA || keys?.keyA || keys?.a || keys?.A || keys?.ArrowLeft);
    const isD = Boolean(keys?.KeyD || keys?.keyD || keys?.d || keys?.D || keys?.ArrowRight);

    const inputZ = (isW ? 1 : 0) - (isS ? 1 : 0);
    const inputX = (isD ? 1 : 0) - (isA ? 1 : 0);

    if (inputZ !== 0 || inputX !== 0) {
      const theta = (typeof cameraYaw === 'number' && Number.isFinite(cameraYaw)) ? cameraYaw : 0;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      // Unit forward f_hat = (-sinT, 0, -cosT), unit right r_hat = (cosT, 0, -sinT)
      const wishX = inputZ * (-sinT) + inputX * cosT;
      const wishZ = inputZ * (-cosT) + inputX * (-sinT);
      const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ);

      if (wishLen > 1e-6) {
        const dWishX = wishX / wishLen;
        const dWishZ = wishZ / wishLen;

        // Project current horizontal velocity onto wish direction
        const vx = this.body.velocity.x;
        const vz = this.body.velocity.z;
        const vProj = vx * dWishX + vz * dWishZ;

        // Apply force if directional speed is below maximum air-strafe speed
        if (vProj < CONFIG.MOVEMENT.AIR_STRAFE_MAX_SPEED) {
          const forceMagnitude = CONFIG.PHYSICS.PLAYER_MASS * CONFIG.MOVEMENT.AIR_STRAFE_ACCEL;
          const fx = forceMagnitude * dWishX;
          const fz = forceMagnitude * dWishZ;
          this._strafeForce.set(fx, 0, fz);
          this.body.applyForce(this._strafeForce, this._zeroVec);
        }
      }
    }

    // 3. Enforce hard MAX_SPEED (75.0 m/s)
    const speed = this.body.velocity.length();
    if (!Number.isFinite(speed)) {
      this.body.velocity.set(0, 0, 0);
    } else if (speed > CONFIG.PHYSICS.MAX_SPEED) {
      const scale = CONFIG.PHYSICS.MAX_SPEED / speed;
      this.body.velocity.x *= scale;
      this.body.velocity.y *= scale;
      this.body.velocity.z *= scale;
    }
  }

  /**
   * Per-frame visual update for position sync, banking/pitch animations,
   * and high-speed ribbon trail geometry.
   *
   * @param {number} [dt=1/60] Delta time in seconds since last visual frame
   * @param {number} [cameraYaw=0] Camera yaw angle in radians
   */
  updateVisuals(dt = 1 / 60, cameraYaw = 0) {
    const safeDt = (typeof dt === 'number' && Number.isFinite(dt) && dt > 0) ? dt : 1 / 60;

    // 1. Sync mesh position to Cannon physics body
    this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);

    // 2. Velocity decomposition
    const vx = this.body.velocity.x;
    const vz = this.body.velocity.z;
    const hSpeed = Math.sqrt(vx * vx + vz * vz);
    const totalSpeed = this.body.velocity.length();

    // 3. Yaw alignment: toward horizontal velocity vector when hSpeed > 2.5 m/s, else cameraYaw
    const safeYaw = (typeof cameraYaw === 'number' && Number.isFinite(cameraYaw)) ? cameraYaw : 0;
    let targetYaw = safeYaw;
    if (hSpeed > 2.5) {
      targetYaw = Math.atan2(-vx, -vz);
    }

    // Angular delta wrapped to (-PI, PI] in O(1) time without looping
    const diff = Math.atan2(Math.sin(targetYaw - this.mesh.rotation.y), Math.cos(targetYaw - this.mesh.rotation.y));

    // Smooth yaw slerp
    const yawLerp = Math.min(1.0, 10.0 * safeDt);
    this.mesh.rotation.y += diff * yawLerp;
    this.mesh.rotation.y = Math.atan2(Math.sin(this.mesh.rotation.y), Math.cos(this.mesh.rotation.y));

    // 4. Tilt pivotGroup.rotation.x forward proportional to horizontal speed (up to 0.65 rad)
    const speedRatio = Math.min(1.0, hSpeed / CONFIG.PHYSICS.MAX_SPEED);
    const targetPitch = speedRatio * 0.65;
    this.pivotGroup.rotation.x = targetPitch;

    // 5. Bank pivotGroup.rotation.z proportional to angular yaw delta
    // PRD: roll = clamp(-angularTurnRate * 0.4, -0.55, 0.55)
    // Using actual character turn rate (-diff * yawLerp / safeDt) ensures smooth, frame-rate independent roll into turns
    const angularTurnRate = - (diff * yawLerp) / safeDt;
    const roll = Math.max(-0.55, Math.min(0.55, -angularTurnRate * 0.4));
    this.pivotGroup.rotation.z = roll;

    // Update character hierarchy world matrices for muzzles and trail emitter
    this.mesh.updateMatrixWorld(true);

    // 6. Update 24-vertex ribbon trail geometry
    this.updateRibbonTrail(safeDt, totalSpeed);
  }

  /**
   * Updates the 24-vertex dynamic ribbon trail behind the player when speed > 25 m/s.
   * Maintained via a 24-point ring buffer of recent world positions of the player's back.
   *
   * @param {number} dt Frame delta time
   * @param {number} totalSpeed Current scalar velocity
   */
  updateRibbonTrail(dt, totalSpeed) {
    if (!this.trailGeometry || !this.trailMesh) return;

    // Ensure trail mesh is in the scene hierarchy
    if (!this.trailMesh.parent) {
      if (this.scene) {
        this.scene.add(this.trailMesh);
      } else if (this.mesh.parent) {
        this.mesh.parent.add(this.trailMesh);
      }
    }

    // Emit points when speed > 25 m/s
    if (totalSpeed > 25.0) {
      // Local back of player avatar
      this._vBackWorld.set(0, 0.2, 0.4).applyMatrix4(this.mesh.matrixWorld);
      const pt = (this._trailPool && this._trailPool.pop()) || new THREE.Vector3();
      pt.copy(this._vBackWorld);
      this.trailBuffer.push(pt);

      if (this.trailBuffer.length > this.maxTrailPoints) {
        const oldest = this.trailBuffer.shift();
        if (this._trailPool) this._trailPool.push(oldest);
      }
    } else {
      // Smoothly dissipate trail when below speed threshold
      if (this.trailBuffer.length > 0) {
        const shifted = this.trailBuffer.shift();
        if (this._trailPool) this._trailPool.push(shifted);
      }
    }

    const n = this.trailBuffer.length;
    // Hide mesh and clear buffer if fewer than 2 points (cannot form a ribbon segment)
    if (n < 2) {
      this.trailMesh.visible = false;
      this.trailGeometry.attributes.alpha.array.fill(0);
      this.trailGeometry.attributes.color.array.fill(0);
      this.trailGeometry.attributes.alpha.needsUpdate = true;
      this.trailGeometry.attributes.color.needsUpdate = true;
      return;
    }

    this.trailMesh.visible = true;

    const posAttr = this.trailGeometry.attributes.position;
    const colAttr = this.trailGeometry.attributes.color;
    const alphaAttr = this.trailGeometry.attributes.alpha;
    const halfWidth = 0.18; // 36cm ribbon width

    // Sample 12 ribbon segments along the trail buffer (producing 24 vertices)
    const segmentCount = 12;
    for (let k = 0; k < segmentCount; k++) {
      const t = k / (segmentCount - 1); // 0 (oldest tail) to 1 (newest head at player)
      const bufferIdx = t * (n - 1);
      const i0 = Math.floor(bufferIdx);
      const i1 = Math.min(n - 1, i0 + 1);
      const frac = bufferIdx - i0;

      const p0 = this.trailBuffer[i0];
      const p1 = this.trailBuffer[i1];

      // Interpolated position along trail spine
      const px = p0.x + (p1.x - p0.x) * frac;
      const py = p0.y + (p1.y - p0.y) * frac;
      const pz = p0.z + (p1.z - p0.z) * frac;

      // Compute continuous tangent along trail spine (guarantees pB !== pA at newest point)
      const pA = (i0 < n - 1) ? this.trailBuffer[i0] : this.trailBuffer[n - 2];
      const pB = (i0 < n - 1) ? this.trailBuffer[i0 + 1] : this.trailBuffer[n - 1];
      this._vDiff.subVectors(pB, pA);
      if (this._vDiff.lengthSq() < 1e-6) {
        this._vDiff.set(0, 0, -1);
      } else {
        this._vDiff.normalize();
      }

      // Compute perpendicular ribbon side vector (T x Up)
      this._vSide.crossVectors(this._vDiff, this._vUp);
      if (this._vSide.lengthSq() < 1e-4) {
        this._vSide.crossVectors(this._vDiff, this._upAlt);
      }
      this._vSide.normalize().multiplyScalar(halfWidth);

      // Alpha fades from 0.0 (tail) to 0.8 (head)
      const alpha = 0.8 * t;

      // Vertex 2*k: Left
      const vLeft = 2 * k;
      posAttr.setXYZ(vLeft, px - this._vSide.x, py - this._vSide.y, pz - this._vSide.z);
      colAttr.setXYZW(vLeft, this._cyanColor.r, this._cyanColor.g, this._cyanColor.b, alpha);
      alphaAttr.setX(vLeft, alpha);

      // Vertex 2*k + 1: Right
      const vRight = 2 * k + 1;
      posAttr.setXYZ(vRight, px + this._vSide.x, py + this._vSide.y, pz + this._vSide.z);
      colAttr.setXYZW(vRight, this._cyanColor.r, this._cyanColor.g, this._cyanColor.b, alpha);
      alphaAttr.setX(vRight, alpha);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  /**
   * Returns world position of left hook muzzle.
   * @param {THREE.Vector3} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getLeftMuzzlePosition(target = new THREE.Vector3()) {
    this.mesh.updateMatrixWorld(true);
    return this.leftMuzzle.getWorldPosition(target);
  }

  /**
   * Returns world position of right hook muzzle.
   * @param {THREE.Vector3} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getRightMuzzlePosition(target = new THREE.Vector3()) {
    this.mesh.updateMatrixWorld(true);
    return this.rightMuzzle.getWorldPosition(target);
  }

  /**
   * Returns world position of left or right hook muzzle.
   * @param {'left'|'right'} [side='left']
   * @param {THREE.Vector3} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getMuzzlePosition(side = 'left', target = new THREE.Vector3()) {
    return side === 'right' ? this.getRightMuzzlePosition(target) : this.getLeftMuzzlePosition(target);
  }

  /**
   * Cleanup and dispose visual geometries, materials, and physics body.
   */
  dispose() {
    if (this.physicsWorld) {
      if (typeof this.physicsWorld.removeBody === 'function') {
        this.physicsWorld.removeBody(this.body);
      } else if (this.physicsWorld.world?.removeBody) {
        this.physicsWorld.world.removeBody(this.body);
      }
    }

    if (this.scene) {
      this.scene.remove(this.mesh);
      this.scene.remove(this.trailMesh);
    } else {
      if (this.mesh && this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
      if (this.trailMesh && this.trailMesh.parent) {
        this.trailMesh.parent.remove(this.trailMesh);
      }
    }

    if (this.trailGeometry) this.trailGeometry.dispose();
    if (this.trailMaterial) this.trailMaterial.dispose();

    if (this.mesh) {
      this.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
    }

    this.trailBuffer.length = 0;
    if (this._trailPool) this._trailPool.length = 0;
  }
}

export default PlayerController;
