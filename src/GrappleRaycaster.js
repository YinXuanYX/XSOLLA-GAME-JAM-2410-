import * as THREE from 'three';
import { CONFIG } from './config.js';

/**
 * GrappleRaycaster implements the hybrid center-screen direct raycast
 * and multi-ring magnetism cone targeting fallback for AERO-HOOK.
 *
 * It uses reusable scratchpad vectors and raycasters to ensure zero GC
 * allocation in steady state.
 */
export class GrappleRaycaster {
  /**
   * @param {typeof CONFIG} [config=CONFIG] Configuration object containing GRAPPLE and CAMERA constants
   */
  constructor(config = CONFIG) {
    this.config = config || CONFIG;
    this.maxRange = this.config.GRAPPLE?.MAX_RANGE ?? 85.0;
    this.armDistance = this.config.CAMERA?.ARM_DISTANCE ?? 6.5;
    this.rayFar = this.maxRange + this.armDistance; // 91.5m baseline

    // Main reusable Three.js raycaster
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.rayFar;
    this.raycaster.near = 0.01;

    // Reusable scratchpad vectors to avoid per-frame GC allocations
    this._forward = new THREE.Vector3();
    this._rayOrigin = new THREE.Vector3();
    this._playerPos = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._ringOffset = new THREE.Vector3();
    this._tempVec = new THREE.Vector3();
    this._bestPoint = new THREE.Vector3();
    this._bestNormal = new THREE.Vector3();
    this._scratchNormal = new THREE.Vector3();

    // Scratch array for wrapping bare Mesh or Object3D inputs without allocation
    this._singleMeshArray = [null];

    // Reusable array target for intersectObjects to avoid array allocations
    this._intersects = [];

    // Precompute magnetism cone sample rays
    this._initConeSamples();
  }

  /**
   * Precomputes cone angles, trigonometric values, and radial distribution
   * for the magnetism cone rays (grouped by concentric ring).
   * @private
   */
  _initConeSamples() {
    this._coneSamples = [];
    this._coneRings = [];

    const rawAngles = this.config?.GRAPPLE?.MAGNETISM_ANGLES_DEG || [1.5, 3.0];
    // Sort rings ascending so the smallest cone angle is evaluated first
    const anglesDeg = [...rawAngles].sort((a, b) => a - b);
    const raysPerRing = this.config?.GRAPPLE?.MAGNETISM_RAYS_PER_RING || 8;

    for (let r = 0; r < anglesDeg.length; r++) {
      const angleDeg = anglesDeg[r];
      const alpha = (angleDeg * Math.PI) / 180;
      const tanAlpha = Math.tan(alpha);
      const ringSamples = [];

      for (let k = 0; k < raysPerRing; k++) {
        // Uniform radial distribution: k * (2 * Math.PI / raysPerRing)
        const phi = k * ((2 * Math.PI) / raysPerRing);
        const sample = {
          ringIndex: r,
          angleDeg,
          alpha,
          tanAlpha,
          k,
          phi,
          cosPhi: Math.cos(phi),
          sinPhi: Math.sin(phi),
        };
        ringSamples.push(sample);
        this._coneSamples.push(sample);
      }

      this._coneRings.push({
        ringIndex: r,
        angleDeg,
        alpha,
        tanAlpha,
        samples: ringSamples,
      });
    }
  }

  /**
   * Reads player world position into this._playerPos without allocation.
   * Prioritizes body physics position or world coordinates from hierarchy.
   * @private
   */
  _getPlayerPos(player) {
    if (!player) {
      return this._playerPos.set(0, 0, 0);
    }
    // 1. CANNON-style physics body position
    if (player.body && player.body.position) {
      return this._playerPos.set(player.body.position.x, player.body.position.y, player.body.position.z);
    }
    // 2. Three.js mesh with world hierarchy support
    if (player.mesh) {
      if (typeof player.mesh.getWorldPosition === 'function') {
        return player.mesh.getWorldPosition(this._playerPos);
      }
      if (player.mesh.position) {
        return this._playerPos.copy(player.mesh.position);
      }
    }
    // 3. Object3D world position
    if (typeof player.getWorldPosition === 'function') {
      return player.getWorldPosition(this._playerPos);
    }
    // 4. Vector3 or plain position object
    if (player.position) {
      return this._playerPos.copy(player.position);
    }
    if (typeof player.x === 'number' && typeof player.y === 'number' && typeof player.z === 'number') {
      return this._playerPos.set(player.x, player.y, player.z);
    }
    return this._playerPos.set(0, 0, 0);
  }

  /**
   * Reads camera world position into this._rayOrigin without allocation.
   * Prioritizes getWorldPosition to account for parent transforms/rigs.
   * @private
   */
  _getRayOrigin(camera) {
    if (!camera) {
      return this._rayOrigin.set(0, 0, 0);
    }
    // Prioritize world position in case camera is attached to a parent rig or pivot
    if (typeof camera.getWorldPosition === 'function') {
      return camera.getWorldPosition(this._rayOrigin);
    }
    if (camera.position) {
      return this._rayOrigin.copy(camera.position);
    }
    if (typeof camera.x === 'number' && typeof camera.y === 'number' && typeof camera.z === 'number') {
      return this._rayOrigin.set(camera.x, camera.y, camera.z);
    }
    return this._rayOrigin.set(0, 0, 0);
  }

  /**
   * Reads camera forward direction into this._forward (normalized) without allocation.
   * Defensively guards against zero vectors to prevent NaN generation.
   * @private
   */
  _getCameraForward(camera) {
    if (!camera) {
      return this._forward.set(0, 0, -1);
    }
    if (typeof camera.getWorldDirection === 'function') {
      camera.getWorldDirection(this._forward);
    } else if (camera.forward) {
      this._forward.copy(camera.forward);
    } else if (camera.quaternion) {
      this._forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    } else {
      this._forward.set(0, 0, -1);
    }

    if (this._forward.lengthSq() < 1e-6) {
      this._forward.set(0, 0, -1);
    } else {
      this._forward.normalize();
    }

    return this._forward;
  }

  /**
   * Extracts a mesh array from diverse container formats.
   * Handles arrays, objects with grappleableMeshes, Groups, and single Meshes.
   * @private
   */
  _extractMeshList(grappleableMeshes) {
    if (!grappleableMeshes) return null;
    if (Array.isArray(grappleableMeshes)) return grappleableMeshes;
    if (Array.isArray(grappleableMeshes.grappleableMeshes)) return grappleableMeshes.grappleableMeshes;

    // Single THREE.Mesh input
    if (grappleableMeshes.isMesh) {
      this._singleMeshArray[0] = grappleableMeshes;
      return this._singleMeshArray;
    }

    // THREE.Group or Scene with children
    if (Array.isArray(grappleableMeshes.children)) {
      if (grappleableMeshes.children.length > 0) {
        return grappleableMeshes.children;
      }
      if (grappleableMeshes.isObject3D) {
        this._singleMeshArray[0] = grappleableMeshes;
        return this._singleMeshArray;
      }
      return null;
    }

    // Bare Object3D
    if (grappleableMeshes.isObject3D) {
      this._singleMeshArray[0] = grappleableMeshes;
      return this._singleMeshArray;
    }

    return null;
  }

  /**
   * Extracts the world-space normal of a hit face into target vector without allocation.
   * @private
   * @param {THREE.Intersection} hit
   * @param {THREE.Vector3} [target=null] Scratchpad to avoid allocation
   * @returns {THREE.Vector3}
   */
  _extractWorldNormal(hit, target = null) {
    const out = target || (hit && hit.face && hit.face.normal ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0));
    if (hit && hit.face && hit.face.normal) {
      out.copy(hit.face.normal);
      if (hit.object && hit.object.matrixWorld) {
        out.transformDirection(hit.object.matrixWorld).normalize();
      } else {
        out.normalize();
      }
      return out;
    }
    return out.set(0, 1, 0);
  }

  /**
   * Finds the best grapple target point using center-screen direct raycast
   * with a magnetism cone fallback.
   *
   * @param {THREE.Camera|object} camera Current active camera
   * @param {object} player PlayerController, mesh, body, or position
   * @param {Array<THREE.Mesh>|object} grappleableMeshes Valid grapple surfaces
   * @param {object|null} [outResult=null] Optional preallocated result object to avoid allocation
   * @returns {{ hit: boolean, point: THREE.Vector3|null, normal: THREE.Vector3|null, assisted: boolean, distance: number|null }}
   */
  findTargetPoint(camera, player, grappleableMeshes, outResult = null) {
    const meshList = this._extractMeshList(grappleableMeshes);
    if (!meshList || meshList.length === 0 || !camera) {
      return this._formatMiss(outResult);
    }

    // 1. Setup ray origin, forward direction, and player anchor reference position
    this._getRayOrigin(camera);
    this._getCameraForward(camera);
    this._getPlayerPos(player);

    // Compute camera-to-player distance to guarantee ray reaches full player maxRange
    const camToPlayerDist = this._rayOrigin.distanceTo(this._playerPos);
    this.raycaster.far = Math.max(this.rayFar, camToPlayerDist + this.maxRange);

    // 2. Center-Screen Direct Raycast
    this.raycaster.set(this._rayOrigin, this._forward);
    this._intersects.length = 0;
    this.raycaster.intersectObjects(meshList, true, this._intersects);

    if (this._intersects.length > 0) {
      const centerHit = this._intersects[0];
      const distToPlayer = centerHit.point.distanceTo(this._playerPos);

      // Verify distance from player position to hit.point is <= MAX_RANGE (85.0m)
      if (distToPlayer <= this.maxRange) {
        const normal = this._extractWorldNormal(centerHit, this._scratchNormal);
        return this._formatHit(
          outResult,
          centerHit.point,
          normal,
          false,
          distToPlayer
        );
      }
    }

    // 3. Magnetism Cone Fallback (if Center Ray misses or is > 85m from player)
    // Construct two orthogonal unit vectors u, v perpendicular to forward
    if (Math.abs(this._forward.y) > 0.99) {
      this._up.set(0, 0, 1);
    } else {
      this._up.set(0, 1, 0);
    }
    this._u.crossVectors(this._forward, this._up).normalize();
    this._v.crossVectors(this._u, this._forward).normalize();

    let hasBest = false;
    let bestDist = Infinity;

    // Evaluate concentric rings starting from smallest angle (e.g. 1.5° then 3.0°)
    for (let r = 0; r < this._coneRings.length; r++) {
      const ring = this._coneRings[r];
      let ringHit = false;

      for (let k = 0; k < ring.samples.length; k++) {
        const sample = ring.samples[k];

        // dir = (forward + tan(alpha) * (cos(phi)*u + sin(phi)*v)).normalize()
        this._ringOffset
          .copy(this._u)
          .multiplyScalar(sample.cosPhi)
          .addScaledVector(this._v, sample.sinPhi);

        this._dir
          .copy(this._forward)
          .addScaledVector(this._ringOffset, sample.tanAlpha)
          .normalize();

        this.raycaster.set(this._rayOrigin, this._dir);
        this._intersects.length = 0;
        this.raycaster.intersectObjects(meshList, true, this._intersects);

        if (this._intersects.length > 0) {
          const candidateHit = this._intersects[0];
          const distToPlayer = candidateHit.point.distanceTo(this._playerPos);

          if (distToPlayer <= this.maxRange) {
            // For hits on the same ring (same angular deviation), pick the one closer to player
            if (!ringHit || distToPlayer < bestDist) {
              bestDist = distToPlayer;
              this._bestPoint.copy(candidateHit.point);
              this._extractWorldNormal(candidateHit, this._bestNormal);
              ringHit = true;
              hasBest = true;
            }
          }
        }
      }

      // If this ring found valid hits, we don't evaluate wider rings because
      // any hit in subsequent rings would have a strictly larger angular deviation!
      if (ringHit) {
        break;
      }
    }

    if (hasBest) {
      return this._formatHit(
        outResult,
        this._bestPoint,
        this._bestNormal,
        true,
        bestDist
      );
    }

    // 4. Miss
    return this._formatMiss(outResult);
  }

  /**
   * Helper to format a hit result object.
   * Preserves preallocated scratchpad vectors in outResult to guarantee zero steady-state GC allocations.
   * @private
   */
  _formatHit(outResult, point, normal, assisted, distance) {
    if (outResult) {
      outResult.hit = true;

      // Restore or copy point vector without GC allocation
      const p = outResult.point || outResult._scratchPoint;
      if (p && typeof p.copy === 'function') {
        p.copy(point);
        outResult.point = p;
      } else {
        outResult.point = point.clone();
        outResult._scratchPoint = outResult.point;
      }

      // Restore or copy normal vector without GC allocation
      const n = outResult.normal || outResult._scratchNormal;
      if (n && typeof n.copy === 'function') {
        n.copy(normal);
        outResult.normal = n;
      } else {
        outResult.normal = normal.clone();
        outResult._scratchNormal = outResult.normal;
      }

      outResult.assisted = assisted;
      outResult.distance = distance;
      return outResult;
    }

    return {
      hit: true,
      point: point.clone(),
      normal: normal.clone(),
      assisted,
      distance,
    };
  }

  /**
   * Helper to format a miss result object.
   * Stashes preallocated vectors into _scratchPoint/_scratchNormal before nulling point/normal.
   * @private
   */
  _formatMiss(outResult) {
    if (outResult) {
      outResult.hit = false;
      if (outResult.point) {
        outResult._scratchPoint = outResult.point;
      }
      if (outResult.normal) {
        outResult._scratchNormal = outResult.normal;
      }
      outResult.point = null;
      outResult.normal = null;
      outResult.assisted = false;
      outResult.distance = null;
      return outResult;
    }

    return {
      hit: false,
      point: null,
      normal: null,
      assisted: false,
      distance: null,
    };
  }
}

// Default instance and helper export for convenience
const defaultRaycaster = new GrappleRaycaster();
export function findTargetPoint(camera, player, grappleableMeshes, outResult = null) {
  return defaultRaycaster.findTargetPoint(camera, player, grappleableMeshes, outResult);
}

export default GrappleRaycaster;
