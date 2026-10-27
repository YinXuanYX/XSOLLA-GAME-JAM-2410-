import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * CameraController implements a 3rd-person spring-arm orbital camera with:
 * - PointerLock mouse control (yaw and pitch clamping)
 * - Shoulder offset for crosshair visibility
 * - Wall anti-clip raycasting with bumper padding against grappleable meshes
 * - Dynamic speed-based FOV dilation with exponential lerp
 * - 'YXZ' Euler orientation ordering matching aeronautical / FPS standards
 */
export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement|Element|string|null} [domElement=null] DOM element or selector for pointer lock targeting
   */
  constructor(camera, domElement = null) {
    this.camera = camera;

    // Resolve domElement if a string selector was passed
    if (typeof domElement === 'string' && typeof document !== 'undefined') {
      this.domElement = document.querySelector(domElement) || null;
    } else {
      this.domElement = domElement || null;
    }

    // Initial camera orientation state
    this.yaw = 0;
    this.pitch = -0.15;
    this.isLocked = false;
    this.sensitivity = null;

    // Current spring arm distance behind pivot
    this.currentDistance = CONFIG.CAMERA.ARM_DISTANCE;

    // Wall-clip raycaster
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CONFIG.CAMERA.ARM_DISTANCE;
    this.raycaster.near = 0.05;

    // Reusable math scratch objects to prevent runtime garbage collection
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._quat = new THREE.Quaternion();
    this._pivot = new THREE.Vector3();
    this._right = new THREE.Vector3(1, 0, 0);
    this._backward = new THREE.Vector3(0, 0, 1);
    this._forward = new THREE.Vector3(0, 0, -1);

    // Initialize orientation vectors and camera rotation
    this._updateOrientation();

    // Ensure camera FOV is baseline
    if (this.camera) {
      this.camera.fov = CONFIG.CAMERA.BASE_FOV;
      if (typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.updateProjectionMatrix();
      }
    }

    // Bind event handlers
    this._onMouseMove = (e) => {
      this.isLocked = this._checkIsLocked();
      if (!this.isLocked) return;

      const dx = (e && typeof e.movementX === 'number' && Number.isFinite(e.movementX)) ? e.movementX : 0;
      const dy = (e && typeof e.movementY === 'number' && Number.isFinite(e.movementY)) ? e.movementY : 0;

      const sens = this.sensitivity ?? (CONFIG.CAMERA?.SENSITIVITY ?? 0.0022);
      this.yaw -= dx * sens;
      this.pitch -= dy * sens;

      const pitchMin = CONFIG.CAMERA?.PITCH_MIN ?? -Math.PI * 0.44;
      const pitchMax = CONFIG.CAMERA?.PITCH_MAX ?? Math.PI * 0.44;
      this.pitch = Math.max(pitchMin, Math.min(pitchMax, this.pitch));
    };

    this._onPointerLockChange = () => {
      this.isLocked = this._checkIsLocked();
    };

    this._onPointerLockError = () => {
      this.isLocked = false;
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('pointerlockchange', this._onPointerLockChange);
      document.addEventListener('pointerlockerror', this._onPointerLockError);
    }
  }

  /**
   * Internal helper to determine whether pointer lock is currently active on target element.
   * Accepts any active pointer lock if no specific domElement was assigned.
   * @private
   * @returns {boolean}
   */
  _checkIsLocked() {
    if (typeof document === 'undefined' || !document.pointerLockElement) {
      return false;
    }
    if (!this.domElement) {
      return true;
    }
    return (
      document.pointerLockElement === this.domElement ||
      (typeof this.domElement.contains === 'function' && this.domElement.contains(document.pointerLockElement)) ||
      (typeof document.pointerLockElement.contains === 'function' && document.pointerLockElement.contains(this.domElement))
    );
  }

  /**
   * Updates internal Euler, Quaternion, and directional basis vectors.
   * Synchronizes camera.quaternion if camera is attached.
   * @private
   */
  _updateOrientation() {
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this._quat.setFromEuler(this._euler);

    this._right.set(1, 0, 0).applyQuaternion(this._quat).normalize();
    this._backward.set(0, 0, 1).applyQuaternion(this._quat).normalize();
    this._forward.set(0, 0, -1).applyQuaternion(this._quat).normalize();

    if (this.camera && this.camera.quaternion && typeof this.camera.quaternion.copy === 'function') {
      this.camera.quaternion.copy(this._quat);
    }
  }

  /**
   * Requests pointer lock on target element or document.body.
   */
  requestPointerLock() {
    const el = this.domElement || (typeof document !== 'undefined' ? document.body : null);
    if (el && typeof el.requestPointerLock === 'function') {
      el.requestPointerLock();
    }
  }

  /**
   * Releases pointer lock if currently held.
   */
  exitPointerLock() {
    if (typeof document !== 'undefined' && typeof document.exitPointerLock === 'function') {
      document.exitPointerLock();
    }
  }

  /**
   * Resets camera angles and restores baseline FOV.
   *
   * @param {number} [yaw=0]
   * @param {number} [pitch=-0.12]
   */
  reset(yaw = 0, pitch = -0.12) {
    this.yaw = (typeof yaw === 'number' && Number.isFinite(yaw)) ? yaw : 0;
    const rawPitch = (typeof pitch === 'number' && Number.isFinite(pitch)) ? pitch : -0.12;

    const pitchMin = CONFIG.CAMERA?.PITCH_MIN ?? -Math.PI * 0.44;
    const pitchMax = CONFIG.CAMERA?.PITCH_MAX ?? Math.PI * 0.44;
    this.pitch = Math.max(pitchMin, Math.min(pitchMax, rawPitch));
    this.currentDistance = CONFIG.CAMERA.ARM_DISTANCE;

    this._updateOrientation();

    if (this.camera) {
      this.camera.fov = CONFIG.CAMERA.BASE_FOV;
      if (typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.updateProjectionMatrix();
      }
    }
  }

  /**
   * Updates spring-arm position, anti-clip raycast, camera orientation, and dynamic FOV.
   *
   * @param {number} dt Delta time in seconds
   * @param {THREE.Vector3|CANNON.Vec3|{x: number, y: number, z: number}} playerPos Current player position
   * @param {number|{length: Function}|{x: number, y: number, z: number}} playerSpeed Scalar player speed or velocity vector
   * @param {Array<THREE.Mesh>|{grappleableMeshes: Array<THREE.Mesh>}|{children: Array<THREE.Mesh>}} [grappleableMeshes=[]] Static meshes for anti-clip raycast
   */
  update(dt, playerPos, playerSpeed, grappleableMeshes) {
    // 1. Compute orientation quaternion using YXZ Euler order
    this._updateOrientation();

    // 2. Compute pivot = playerPos + (0, ARM_HEIGHT, 0) + rightVector * SHOULDER_OFFSET
    const px = (playerPos && typeof playerPos.x === 'number' && Number.isFinite(playerPos.x)) ? playerPos.x : 0;
    const py = (playerPos && typeof playerPos.y === 'number' && Number.isFinite(playerPos.y)) ? playerPos.y : 0;
    const pz = (playerPos && typeof playerPos.z === 'number' && Number.isFinite(playerPos.z)) ? playerPos.z : 0;

    const armHeight = CONFIG.CAMERA.ARM_HEIGHT; // 1.8m
    const shoulderOffset = CONFIG.CAMERA.SHOULDER_OFFSET; // 0.65m

    this._pivot.set(
      px + this._right.x * shoulderOffset,
      py + armHeight + this._right.y * shoulderOffset,
      pz + this._right.z * shoulderOffset
    );

    // 3. Wall anti-clip raycast from pivot along backward vector up to 6.5m
    const armDistance = CONFIG.CAMERA.ARM_DISTANCE; // 6.5m
    let dist = armDistance;

    const meshList = Array.isArray(grappleableMeshes)
      ? grappleableMeshes
      : (grappleableMeshes && Array.isArray(grappleableMeshes.grappleableMeshes)
        ? grappleableMeshes.grappleableMeshes
        : (grappleableMeshes && Array.isArray(grappleableMeshes.children)
          ? grappleableMeshes.children
          : null));

    if (meshList && meshList.length > 0) {
      this.raycaster.set(this._pivot, this._backward);
      this.raycaster.near = 0.05;
      this.raycaster.far = armDistance;
      const hits = this.raycaster.intersectObjects(meshList, true);
      const wallHit = hits.find((h) => !h.object?.userData?.noCameraClip);
      if (wallHit && Number.isFinite(wallHit.distance)) {
        const d_hit = wallHit.distance;
        dist = Math.min(armDistance, Math.max(1.2, d_hit - 0.35));
      }
    }
    this.currentDistance = dist;

    // 4. Position and orient camera
    if (this.camera) {
      if (this.camera.position && typeof this.camera.position.copy === 'function') {
        this.camera.position.copy(this._pivot).addScaledVector(this._backward, dist);
      }
      if (this.camera.quaternion && typeof this.camera.quaternion.copy === 'function') {
        this.camera.quaternion.copy(this._quat);
      }

      // 5. Dynamic Speed FOV lerp
      const baseFov = CONFIG.CAMERA.BASE_FOV; // 70
      const maxFov = CONFIG.CAMERA.MAX_FOV;   // 98
      const minSpeed = CONFIG.CAMERA.FOV_MIN_SPEED; // 15.0 m/s
      const maxSpeed = CONFIG.PHYSICS.MAX_SPEED;    // 75.0 m/s

      let speed = 0;
      if (typeof playerSpeed === 'number' && Number.isFinite(playerSpeed)) {
        speed = Math.abs(playerSpeed);
      } else if (playerSpeed && typeof playerSpeed.length === 'function') {
        const len = playerSpeed.length();
        if (typeof len === 'number' && Number.isFinite(len)) {
          speed = Math.abs(len);
        }
      } else if (
        playerSpeed &&
        typeof playerSpeed.x === 'number' &&
        typeof playerSpeed.y === 'number' &&
        typeof playerSpeed.z === 'number' &&
        Number.isFinite(playerSpeed.x) &&
        Number.isFinite(playerSpeed.y) &&
        Number.isFinite(playerSpeed.z)
      ) {
        speed = Math.hypot(playerSpeed.x, playerSpeed.y, playerSpeed.z);
      }

      const speedFactor = Math.max(0, Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed)));
      const targetFov = baseFov + speedFactor * (maxFov - baseFov);

      if (typeof this.camera.fov !== 'number' || isNaN(this.camera.fov)) {
        this.camera.fov = baseFov;
      }

      const stepDt = (typeof dt === 'number' && Number.isFinite(dt) && dt >= 0) ? dt : (dt === undefined ? 1 / 60 : 0);
      const lerpRate = CONFIG.CAMERA.FOV_LERP_SPEED || 8.0;
      const t = stepDt > 0 ? Math.min(1, Math.max(0, 1 - Math.exp(-lerpRate * stepDt))) : 0;

      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, t);

      if (typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.updateProjectionMatrix();
      }
    }
  }

  /**
   * Returns current camera yaw in radians.
   * @returns {number}
   */
  getYaw() {
    return this.yaw;
  }

  /**
   * Returns current camera pitch in radians.
   * @returns {number}
   */
  getPitch() {
    return this.pitch;
  }

  /**
   * Returns current arm distance in meters.
   * @returns {number}
   */
  getDistance() {
    return this.currentDistance;
  }

  /**
   * Copies current calculated pivot into target vector.
   * @param {THREE.Vector3|{copy: Function, x?: number, y?: number, z?: number}} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getPivot(target = new THREE.Vector3()) {
    if (target && typeof target.copy === 'function') {
      return target.copy(this._pivot);
    }
    if (target) {
      target.x = this._pivot.x;
      target.y = this._pivot.y;
      target.z = this._pivot.z;
      return target;
    }
    return this._pivot.clone();
  }

  /**
   * Copies current camera forward vector into target vector.
   * @param {THREE.Vector3|{copy: Function, x?: number, y?: number, z?: number}} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getForwardVector(target = new THREE.Vector3()) {
    if (target && typeof target.copy === 'function') {
      return target.copy(this._forward);
    }
    if (target) {
      target.x = this._forward.x;
      target.y = this._forward.y;
      target.z = this._forward.z;
      return target;
    }
    return this._forward.clone();
  }

  /**
   * Copies current camera backward vector into target vector.
   * @param {THREE.Vector3|{copy: Function, x?: number, y?: number, z?: number}} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getBackwardVector(target = new THREE.Vector3()) {
    if (target && typeof target.copy === 'function') {
      return target.copy(this._backward);
    }
    if (target) {
      target.x = this._backward.x;
      target.y = this._backward.y;
      target.z = this._backward.z;
      return target;
    }
    return this._backward.clone();
  }

  /**
   * Copies current camera right vector into target vector.
   * @param {THREE.Vector3|{copy: Function, x?: number, y?: number, z?: number}} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getRightVector(target = new THREE.Vector3()) {
    if (target && typeof target.copy === 'function') {
      return target.copy(this._right);
    }
    if (target) {
      target.x = this._right.x;
      target.y = this._right.y;
      target.z = this._right.z;
      return target;
    }
    return this._right.clone();
  }

  /**
   * Unbinds document event listeners.
   */
  dispose() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this._onMouseMove);
      document.removeEventListener('pointerlockchange', this._onPointerLockChange);
      document.removeEventListener('pointerlockerror', this._onPointerLockError);
    }
  }
}
