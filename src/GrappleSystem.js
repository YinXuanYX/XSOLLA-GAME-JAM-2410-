import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GrappleRaycaster } from './GrappleRaycaster.js';
import { GrapplePhysics } from './GrapplePhysics.js';

/**
 * GrappleSystem is the unified dual-hook system for AERO-HOOK.
 *
 * Merges:
 * - Sub-Agent 1C-1: Hybrid Center Raycast + 2-Ring Magnetism Cone Targeting (src/GrappleRaycaster.js)
 * - Sub-Agent 1C-2: Dual-Hook State, 3D Rope/Claw/Preview Visuals & Slack-Cancellation Physics (src/GrapplePhysics.js)
 *
 * Implements PRD Section 4.4:
 * - Independent Left (Mouse0, cyan #00f0ff) and Right (Mouse2, orange #ff6b00) channels
 * - Single hook pull: 58.0 m/s^2, Dual hook pull: 37.7 m/s^2 per hook (1.3x combined)
 * - Proximity softening (< 2.5m)
 * - Slack / Fall Cancellation Force (F_tension = m * (-v_radial * 8.5) * u_i)
 * - 100% velocity conservation on release
 * - Procedural 3D cylinder rope meshes (+Z aligned), octahedron claws, and surface preview ring
 */
export class GrappleSystem {
  /**
   * @param {THREE.Scene} [scene] Three.js scene for 3D rope/claw and preview meshes
   * @param {THREE.Camera} [camera] Player camera for raycasting direction and position
   * @param {import('./PlayerController.js').PlayerController|{ body: any, mesh: any }} [player] Player controller instance
   * @param {typeof CONFIG} [config=CONFIG] Game configuration
   */
  constructor(scene = null, camera = null, player = null, config = CONFIG) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.config = config || CONFIG;

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
   * Binds or updates the scene reference.
   * @param {THREE.Scene} scene
   */
  setScene(scene) {
    this.scene = scene;
    if (this.physics) {
      this.physics.setScene(scene);
      this.previewRing = this.physics.previewRing;
      this.hooks = this.physics.hooks;
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
   * Attempts to fire a hook along the specified side ('left' or 'right').
   * Finds the best target point against grappleableMeshes, anchors the hook,
   * activates the tether, and invokes onSuccessCallback(side).
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
   * Visual update step called every animation frame.
   * Updates targetInfo, positions and aligns the surface preview ring,
   * and updates 3D rope cylinder and claw transforms between player muzzles and anchors.
   *
   * @param {Array<THREE.Mesh>|{ grappleableMeshes: Array<THREE.Mesh> }} grappleableMeshes
   */
  updateVisuals(grappleableMeshes = []) {
    // 1. Live reticle raycasting
    this.targetInfo = this.findTargetPoint(grappleableMeshes);

    // 2. Update visual preview ring and active rope/claw meshes
    if (this.physics) {
      this.physics.updateVisuals(this.targetInfo);
    }
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
   * Resets all hooks, hiding visual meshes and resetting targeting telemetry.
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
  }

  /**
   * Disposes of visual meshes, materials, geometries, and removes event listeners.
   */
  dispose() {
    if (typeof window !== 'undefined' && this._contextMenuHandler) {
      window.removeEventListener('contextmenu', this._contextMenuHandler);
    }

    this.reset();

    if (this.physics) {
      this.physics.dispose();
    }
  }
}

// Named exports for both subsystems and convenience
export { GrappleRaycaster, GrapplePhysics };
export default GrappleSystem;
