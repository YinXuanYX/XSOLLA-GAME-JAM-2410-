import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

/**
 * ============================================================================
 * SUB-AGENT 2A-1: PRNG, Core Level Infrastructure, Abyss, Start Pad, Finish Gate
 * ============================================================================
 */

/**
 * Mulberry32 is a fast, high-quality, 32-bit deterministic PRNG with 2^32 period.
 * Produces identical floating-point sequences in [0, 1) across all browsers.
 *
 * @param {number} seed 32-bit unsigned integer seed
 * @returns {() => number} Random number generator function
 */
export function mulberry32(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    let t = (s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * LevelGenerator manages procedural course construction, brutalist low-poly
 * level geometry, matching Cannon-es static physics colliders, the animated lava abyss,
 * course preset switching, and endless chunk streaming/recycling.
 */
export class LevelGenerator {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./PhysicsWorld.js').PhysicsWorld|{ world: CANNON.World, addBody: Function, removeBody: Function, worldMaterial?: CANNON.Material }} physicsWorld
   */
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    // Raycast target array for GrappleSystem and CameraController
    this.grappleableMeshes = [];

    // Active course chunks queue: [{ id, index, archetype, meshes: [], bodies: [], startZ, endZ }]
    this.activeChunks = [];

    // Red emissive collision bodies that trigger instant death on player contact
    this.hazardBodies = [];

    // Finish Gate target descriptor
    this.finishGate = {
      z: -1000,
      y: 0,
      x: 0,
      radius: 18,
      mesh: null,
    };

    // Start Pad tracking
    this.startPad = {
      meshes: [],
      bodies: [],
    };

    // Course state
    this.currentPresetId = 1;
    this.currentSeed = 1042;
    this.rng = mulberry32(this.currentSeed);
    this.cursor = { x: 0, y: 0, z: 0 };
    this.farthestZ = 0;
    this.chunkCounter = 0;

    // Shared reusable materials for performance & aesthetics
    this.materials = {
      stonePrimary: new THREE.MeshStandardMaterial({
        color: CONFIG.COLORS.STONE_PRIMARY,
        roughness: 0.85,
        metalness: 0.12,
        flatShading: true,
      }),
      stoneSecondary: new THREE.MeshStandardMaterial({
        color: CONFIG.COLORS.STONE_SECONDARY,
        roughness: 0.88,
        metalness: 0.18,
        flatShading: true,
      }),
      hazard: new THREE.MeshStandardMaterial({
        color: CONFIG.COLORS.HAZARD_LAVA,
        emissive: CONFIG.COLORS.HAZARD_LAVA,
        emissiveIntensity: 1.5,
        roughness: 0.25,
        metalness: 0.1,
        flatShading: true,
      }),
      startPadBase: new THREE.MeshStandardMaterial({
        color: CONFIG.COLORS.STONE_SECONDARY,
        roughness: 0.9,
        metalness: 0.1,
        flatShading: true,
      }),
      startPadTrim: new THREE.MeshStandardMaterial({
        color: CONFIG.COLORS.START_PAD,
        emissive: CONFIG.COLORS.START_PAD,
        emissiveIntensity: 0.8,
        roughness: 0.3,
        metalness: 0.4,
        flatShading: true,
      }),
      finishRing: new THREE.MeshStandardMaterial({
        color: CONFIG.COLORS.FINISH_GATE,
        emissive: CONFIG.COLORS.FINISH_GATE,
        emissiveIntensity: 0.95,
        roughness: 0.2,
        metalness: 0.85,
        flatShading: true,
      }),
      finishTrigger: new THREE.MeshBasicMaterial({
        color: CONFIG.COLORS.FINISH_GATE,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      abyssSolid: new THREE.MeshStandardMaterial({
        color: 0x140306,
        roughness: 0.95,
        metalness: 0.1,
        flatShading: true,
      }),
      abyssWire: new THREE.MeshBasicMaterial({
        color: CONFIG.COLORS.HAZARD_LAVA,
        wireframe: true,
        transparent: true,
        opacity: 0.42,
      }),
    };

    // Build persistent animated low-poly lava abyss plane
    this.initAbyssPlane();
  }

  /**
   * Spawns a flat-shaded Box mesh and matching CANNON.Box static collider.
   *
   * @param {Object} options
   * @param {number} options.x Center X
   * @param {number} options.y Center Y
   * @param {number} options.z Center Z
   * @param {number} options.w Width (along X)
   * @param {number} options.h Height (along Y)
   * @param {number} options.d Depth (along Z)
   * @param {number} [options.rx=0] Rotation X in radians
   * @param {number} [options.ry=0] Rotation Y in radians
   * @param {number} [options.rz=0] Rotation Z in radians
   * @param {number} [options.color] Hex color (defaults to STONE_PRIMARY)
   * @param {boolean} [options.isHazard=false] If true, kills on contact, cannot be grappled
   * @param {boolean} [options.isStartPad=false] If true, tagged as START_PAD
   * @param {Object} [options.chunk] Optional chunk object to register mesh & body with
   * @returns {{ mesh: THREE.Mesh, body: CANNON.Body }}
   */
  spawnBlock({
    x,
    y,
    z,
    w,
    h,
    d,
    rx = 0,
    ry = 0,
    rz = 0,
    color,
    isHazard = false,
    isStartPad = false,
    chunk = null,
  }) {
    // 1. Three.js Box Geometry & Material
    const geometry = new THREE.BoxGeometry(w, h, d);
    let material;
    if (isHazard) {
      material = this.materials.hazard;
    } else if (color === CONFIG.COLORS.STONE_SECONDARY) {
      material = this.materials.stoneSecondary;
    } else if (color && color !== CONFIG.COLORS.STONE_PRIMARY) {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0.12,
        flatShading: true,
      });
    } else {
      material = this.materials.stonePrimary;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // 2. Cannon.js Box Static Body
    const halfExtents = new CANNON.Vec3(w / 2, h / 2, d / 2);
    const shape = new CANNON.Box(halfExtents);
    const body = new CANNON.Body({
      mass: 0, // static mass
      shape,
      position: new CANNON.Vec3(x, y, z),
      material: this.physicsWorld.worldMaterial || undefined,
    });

    if (rx !== 0 || ry !== 0 || rz !== 0) {
      const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(euler);
      body.quaternion.set(q.x, q.y, q.z, q.w);
    }

    // 3. UserData tagging & collection routing
    if (isHazard) {
      body.userData = { type: 'HAZARD' };
      mesh.userData = { type: 'HAZARD', isGrappleable: false };
      this.hazardBodies.push(body);
    } else if (isStartPad) {
      body.userData = { type: 'START_PAD' };
      mesh.userData = { type: 'START_PAD', isGrappleable: true };
      this.grappleableMeshes.push(mesh);
    } else {
      body.userData = { type: 'GRAPPLEABLE' };
      mesh.userData = { type: 'GRAPPLEABLE', isGrappleable: true };
      this.grappleableMeshes.push(mesh);
    }

    // 4. Add to scene & physics world
    this.scene.add(mesh);
    this.physicsWorld.addBody(body);

    // 5. Register with chunk if provided
    if (chunk) {
      chunk.meshes.push(mesh);
      chunk.bodies.push(body);
    }

    return { mesh, body };
  }

  /**
   * Builds the persistent animated low-poly abyss plane at Y = CONFIG.LEVEL.ABYSS_VISUAL_Y (-35m).
   * Overlaid with a glowing lava wireframe grid that smoothly translates with player Z.
   */
  initAbyssPlane() {
    this.abyssGroup = new THREE.Group();
    this.abyssGroup.position.set(0, CONFIG.LEVEL.ABYSS_VISUAL_Y, 0);

    const width = 450;
    const depth = 550;
    const segX = 26;
    const segZ = 34;

    const planeGeo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    planeGeo.rotateX(-Math.PI / 2);

    // Randomize low-poly vertex heights for jagged crust appearance
    const pos = planeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const distFromCenter = Math.hypot(vx, vz);
      // Gentle trough in center corridor, more volcanic crests at perimeter
      const crest = Math.sin(vx * 0.04) * Math.cos(vz * 0.03) * 3.5;
      const noise = (Math.random() - 0.5) * 2.2;
      pos.setY(i, crest + noise - Math.min(distFromCenter * 0.02, 6.0));
    }
    planeGeo.computeVertexNormals();

    // Solid dark crust mesh
    this.abyssSolidMesh = new THREE.Mesh(planeGeo, this.materials.abyssSolid);
    this.abyssSolidMesh.receiveShadow = true;
    this.abyssGroup.add(this.abyssSolidMesh);

    // Wireframe glowing grid overlay
    const wireGeo = planeGeo.clone();
    this.abyssWireMesh = new THREE.Mesh(wireGeo, this.materials.abyssWire);
    this.abyssWireMesh.position.y += 0.35;
    this.abyssGroup.add(this.abyssWireMesh);

    this.scene.add(this.abyssGroup);
  }

  /**
   * Updates the abyss plane position and lava pulse animation.
   *
   * @param {number} playerZ Player's current Z coordinate
   * @param {number} time Elapsed time in seconds
   */
  updateAbyss(playerZ, time = 0) {
    if (!this.abyssGroup) return;

    // Follow player along Z so the abyss spans beneath them at any distance
    this.abyssGroup.position.z = playerZ;

    // Gentle breathing emissive/opacity pulse for the lava wireframe
    if (this.abyssWireMesh && this.abyssWireMesh.material) {
      const pulse = 0.38 + 0.15 * Math.sin(time * 2.4);
      this.abyssWireMesh.material.opacity = pulse;
    }
  }

  /**
   * Spawns the emerald-trimmed octagonal Start Pad at (0, 0, 0).
   * Platform is 14m wide with a stable CANNON static collider at Y = 0.
   */
  spawnStartPad() {
    this.clearStartPad();

    const radius = 7.0; // 14m diameter
    const height = 3.0; // 3m thick platform
    const topY = 0.0;
    const centerY = topY - height / 2; // -1.5m

    // 1. Octagonal stone base cylinder
    const baseGeo = new THREE.CylinderGeometry(radius, radius * 1.05, height, 8);
    const baseMesh = new THREE.Mesh(baseGeo, this.materials.startPadBase);
    baseMesh.position.set(0, centerY, 0);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;

    // 2. Emerald trim ring at top edge
    const trimGeo = new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.4, 8);
    const trimMesh = new THREE.Mesh(trimGeo, this.materials.startPadTrim);
    trimMesh.position.set(0, topY - 0.2, 0);

    // 3. Center launch glyph ring on top surface
    const glyphGeo = new THREE.RingGeometry(2.0, 2.8, 8);
    glyphGeo.rotateX(-Math.PI / 2);
    const glyphMesh = new THREE.Mesh(glyphGeo, this.materials.startPadTrim);
    glyphMesh.position.set(0, topY + 0.02, 0);

    // Group visual components
    const padGroup = new THREE.Group();
    padGroup.add(baseMesh);
    padGroup.add(trimMesh);
    padGroup.add(glyphMesh);
    padGroup.userData = { type: 'START_PAD', isGrappleable: true };

    this.scene.add(padGroup);
    this.grappleableMeshes.push(baseMesh);
    this.startPad.meshes.push(padGroup, baseMesh, trimMesh, glyphMesh);

    // 4. Stable flat physics collider (Box 13m x 3m x 13m covering the 14m octagon)
    const boxShape = new CANNON.Box(new CANNON.Vec3(radius * 0.92, height / 2, radius * 0.92));
    const padBody = new CANNON.Body({
      mass: 0,
      shape: boxShape,
      position: new CANNON.Vec3(0, centerY, 0),
      material: this.physicsWorld.worldMaterial || undefined,
    });
    padBody.userData = { type: 'START_PAD' };

    this.physicsWorld.addBody(padBody);
    this.startPad.bodies.push(padBody);

    return { padGroup, padBody };
  }

  /**
   * Cleans up Start Pad meshes and collision bodies.
   */
  clearStartPad() {
    for (const body of this.startPad.bodies) {
      this.physicsWorld.removeBody(body);
    }
    for (const mesh of this.startPad.meshes) {
      this.scene.remove(mesh);
      const idx = this.grappleableMeshes.indexOf(mesh);
      if (idx !== -1) this.grappleableMeshes.splice(idx, 1);
      if (mesh.geometry) mesh.geometry.dispose();
    }
    this.startPad.meshes = [];
    this.startPad.bodies = [];
  }

  /**
   * Spawns the Finish Gate Ring at the specified coordinates.
   * Giant glowing gold brutalist octagonal ring with a translucent inner trigger plane.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  spawnFinishGate(x, y, z) {
    this.clearFinishGate();

    const radius = 16.0;
    const tubeRadius = 1.6;

    const gateGroup = new THREE.Group();
    gateGroup.position.set(x, y, z);

    // 1. Octagonal Torus Ring (8 radial segments)
    const ringGeo = new THREE.TorusGeometry(radius, tubeRadius, 8, 8);
    const ringMesh = new THREE.Mesh(ringGeo, this.materials.finishRing);
    ringMesh.castShadow = true;
    gateGroup.add(ringMesh);

    // 2. Translucent Additive Inner Trigger Disc
    const triggerGeo = new THREE.CircleGeometry(radius - tubeRadius * 0.8, 16);
    const triggerMesh = new THREE.Mesh(triggerGeo, this.materials.finishTrigger);
    gateGroup.add(triggerMesh);

    // 3. Grounding Pylons (supporting twin stone monolith pillars)
    const pylonGeo = new THREE.BoxGeometry(4.0, 32.0, 4.0);
    const leftPylon = new THREE.Mesh(pylonGeo, this.materials.stoneSecondary);
    leftPylon.position.set(-radius - 1.5, -14.0, 0);
    leftPylon.rotation.z = -0.08;
    gateGroup.add(leftPylon);

    const rightPylon = new THREE.Mesh(pylonGeo, this.materials.stoneSecondary);
    rightPylon.position.set(radius + 1.5, -14.0, 0);
    rightPylon.rotation.z = 0.08;
    gateGroup.add(rightPylon);

    // Add pylons to grappleable surfaces
    this.grappleableMeshes.push(leftPylon, rightPylon, ringMesh);

    this.scene.add(gateGroup);

    this.finishGate = {
      x,
      y,
      z,
      radius,
      mesh: gateGroup,
      ringMesh,
      triggerMesh,
      pylons: [leftPylon, rightPylon],
    };

    return this.finishGate;
  }

  /**
   * Clears existing Finish Gate objects.
   */
  clearFinishGate() {
    if (this.finishGate && this.finishGate.mesh) {
      this.scene.remove(this.finishGate.mesh);
      if (this.finishGate.pylons) {
        for (const p of this.finishGate.pylons) {
          const idx = this.grappleableMeshes.indexOf(p);
          if (idx !== -1) this.grappleableMeshes.splice(idx, 1);
          if (p.geometry) p.geometry.dispose();
        }
      }
      if (this.finishGate.ringMesh) {
        const idx = this.grappleableMeshes.indexOf(this.finishGate.ringMesh);
        if (idx !== -1) this.grappleableMeshes.splice(idx, 1);
        if (this.finishGate.ringMesh.geometry) this.finishGate.ringMesh.geometry.dispose();
      }
      if (this.finishGate.triggerMesh && this.finishGate.triggerMesh.geometry) {
        this.finishGate.triggerMesh.geometry.dispose();
      }
    }
    this.finishGate = {
      z: -1000,
      y: 0,
      x: 0,
      radius: 18,
      mesh: null,
    };
  }

  /**
   * Animates the Finish Gate visual state (pulsing ring glow, subtle rotating shimmer).
   * @param {number} time
   */
  updateFinishGate(time) {
    if (!this.finishGate || !this.finishGate.mesh) return;

    if (this.finishGate.ringMesh) {
      // Subtle breathing emissive intensity
      const intensity = 0.85 + 0.25 * Math.sin(time * 3.2);
      this.materials.finishRing.emissiveIntensity = intensity;
    }

    if (this.finishGate.triggerMesh) {
      // Gentle rotating shimmer
      this.finishGate.triggerMesh.rotation.z = time * 0.4;
    }
  }

  /**
   * ============================================================================
   * SUB-AGENT 2A-2: The 6 Handcrafted Procedural Chunk Builders & Endless Recycler
   * ============================================================================
   */

  /**
   * Chunk 1 — The Twin Spires (Cadence Corridor, Length 150m)
   * Spawns 6 alternating pairs of tall brutalist monoliths (14x65x16m) at X = ±(18 to 26m)
   * every 25m along -Z, with floating crossbar beams at Y + 28m for high-line swings.
   *
   * @param {{ x: number, y: number, z: number }} cursor
   * @param {() => number} rng
   * @param {Object} chunk
   * @returns {{ x: number, y: number, z: number }} Exit cursor for next chunk
   */
  buildChunk1_TwinSpires(cursor, rng, chunk) {
    const chunkLength = 150;
    const pairCount = 6;
    const stepZ = chunkLength / pairCount; // 25m

    for (let i = 0; i < pairCount; i++) {
      const z = cursor.z - (i + 0.5) * stepZ;
      const yVariation = (rng() - 0.5) * 5.0;
      const y = cursor.y + yVariation;
      const xDist = 19.0 + rng() * 6.0;

      // Left Spire Monolith (14m wide, 65m tall, 16m deep)
      this.spawnBlock({
        x: cursor.x - xDist,
        y: y + 20.0,
        z,
        w: 14.0,
        h: 65.0,
        d: 16.0,
        color: i % 2 === 0 ? CONFIG.COLORS.STONE_PRIMARY : CONFIG.COLORS.STONE_SECONDARY,
        chunk,
      });

      // Right Spire Monolith
      this.spawnBlock({
        x: cursor.x + xDist,
        y: y + 20.0,
        z,
        w: 14.0,
        h: 65.0,
        d: 16.0,
        color: i % 2 === 1 ? CONFIG.COLORS.STONE_PRIMARY : CONFIG.COLORS.STONE_SECONDARY,
        chunk,
      });

      // Horizontal high crossbar beam on select pairs for high-line traversal
      if (i % 2 === 1 || rng() > 0.4) {
        this.spawnBlock({
          x: cursor.x,
          y: cursor.y + 28.0,
          z,
          w: xDist * 2.0 + 8.0,
          h: 4.0,
          d: 6.0,
          color: CONFIG.COLORS.STONE_SECONDARY,
          chunk,
        });
      }
    }

    return {
      x: cursor.x,
      y: cursor.y,
      z: cursor.z - chunkLength,
    };
  }

  /**
   * Chunk 2 — The Under-Bridge Dive (Vertical High-Low Transfer, Length 160m)
   * Spawns a massive ceiling barrier (70x40x20m) blocking the upper path, with a 16m-tall
   * grappleable stalactite underside at Y - 8m, a red HAZARD laser bar across the top,
   * and a high floating recovery citadel platform at Y + 22m.
   *
   * @param {{ x: number, y: number, z: number }} cursor
   * @param {() => number} rng
   * @param {Object} chunk
   * @returns {{ x: number, y: number, z: number }}
   */
  buildChunk2_UnderBridgeDive(cursor, rng, chunk) {
    const chunkLength = 160;
    const bridgeZ = cursor.z - 65.0;

    // 1. Massive ceiling barrier wall blocking high trajectory
    this.spawnBlock({
      x: cursor.x,
      y: cursor.y + 26.0,
      z: bridgeZ,
      w: 70.0,
      h: 40.0,
      d: 20.0,
      color: CONFIG.COLORS.STONE_PRIMARY,
      chunk,
    });

    // 2. Red HAZARD laser bar across the very top (players must dive under)
    this.spawnBlock({
      x: cursor.x,
      y: cursor.y + 47.0,
      z: bridgeZ,
      w: 72.0,
      h: 3.5,
      d: 22.0,
      color: CONFIG.COLORS.HAZARD_LAVA,
      isHazard: true,
      chunk,
    });

    // 3. Central 16m-tall grappleable stalactite underside hanging beneath the bridge
    this.spawnBlock({
      x: cursor.x,
      y: cursor.y + 2.0,
      z: bridgeZ,
      w: 12.0,
      h: 16.0,
      d: 14.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });

    // Flanking stalactite teeth for wider swing lines
    this.spawnBlock({
      x: cursor.x - 14.0,
      y: cursor.y + 4.0,
      z: bridgeZ,
      w: 8.0,
      h: 12.0,
      d: 10.0,
      color: CONFIG.COLORS.STONE_PRIMARY,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x + 14.0,
      y: cursor.y + 4.0,
      z: bridgeZ,
      w: 8.0,
      h: 12.0,
      d: 10.0,
      color: CONFIG.COLORS.STONE_PRIMARY,
      chunk,
    });

    // 4. Approach flanking towers (lateral swing anchors before the dive)
    this.spawnBlock({
      x: cursor.x - 30.0,
      y: cursor.y + 12.0,
      z: cursor.z - 28.0,
      w: 10.0,
      h: 48.0,
      d: 12.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x + 30.0,
      y: cursor.y + 12.0,
      z: cursor.z - 28.0,
      w: 10.0,
      h: 48.0,
      d: 12.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });

    // 5. High floating recovery citadel platform at Y + 22m (target of upward dive-swing)
    this.spawnBlock({
      x: cursor.x,
      y: cursor.y + 22.0,
      z: cursor.z - 135.0,
      w: 24.0,
      h: 6.0,
      d: 20.0,
      color: CONFIG.COLORS.STONE_PRIMARY,
      chunk,
    });

    // Twin catch monoliths flanking the recovery platform
    this.spawnBlock({
      x: cursor.x - 18.0,
      y: cursor.y + 32.0,
      z: cursor.z - 135.0,
      w: 6.0,
      h: 28.0,
      d: 6.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x + 18.0,
      y: cursor.y + 32.0,
      z: cursor.z - 135.0,
      w: 6.0,
      h: 28.0,
      d: 6.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });

    return {
      x: cursor.x,
      y: cursor.y + 10.0, // Exit elevation shift
      z: cursor.z - chunkLength,
    };
  }

  /**
   * Chunk 3 — The Threading Octagon Rings (Precision Momentum, Length 165m)
   * Spawns 3 giant hollow octagonal stone rings (outerRadius: 22m, innerHole: 13m, depth: 8m)
   * constructed from 8 rotated box segments each, spaced 55m apart with vertical offsets (±12m).
   *
   * @param {{ x: number, y: number, z: number }} cursor
   * @param {() => number} rng
   * @param {Object} chunk
   * @returns {{ x: number, y: number, z: number }}
   */
  buildChunk3_ThreadingRings(cursor, rng, chunk) {
    const chunkLength = 165;
    const ringSpacing = 55.0;
    const verticalOffsets = [6.0, -8.0, 8.0];
    const ringRadius = 17.5; // Mid-radius of the 8 segments
    const segmentLength = 14.5;
    const segmentThickness = 9.0;
    const segmentDepth = 8.0;

    for (let r = 0; r < 3; r++) {
      const ringZ = cursor.z - (r + 0.5) * ringSpacing;
      const ringY = cursor.y + verticalOffsets[r];
      const ringX = cursor.x + (rng() - 0.5) * 4.0;

      // Construct 8 rotated box segments forming the hollow octagonal ring
      for (let s = 0; s < 8; s++) {
        const theta = s * (Math.PI / 4); // 45 degrees
        const sx = ringX + ringRadius * Math.cos(theta);
        const sy = ringY + ringRadius * Math.sin(theta);
        const rz = theta + Math.PI / 2;

        this.spawnBlock({
          x: sx,
          y: sy,
          z: ringZ,
          w: segmentLength,
          h: segmentThickness,
          d: segmentDepth,
          rz,
          color: s % 2 === 0 ? CONFIG.COLORS.STONE_PRIMARY : CONFIG.COLORS.STONE_SECONDARY,
          chunk,
        });
      }

      // Exterior anchor horns on top corners for high-orbit swingers
      this.spawnBlock({
        x: ringX - 22.0,
        y: ringY + 16.0,
        z: ringZ,
        w: 5.0,
        h: 12.0,
        d: 5.0,
        color: CONFIG.COLORS.STONE_SECONDARY,
        chunk,
      });
      this.spawnBlock({
        x: ringX + 22.0,
        y: ringY + 16.0,
        z: ringZ,
        w: 5.0,
        h: 12.0,
        d: 5.0,
        color: CONFIG.COLORS.STONE_SECONDARY,
        chunk,
      });
    }

    return {
      x: cursor.x,
      y: cursor.y,
      z: cursor.z - chunkLength,
    };
  }

  /**
   * Chunk 4 — The Split Canyon & Hazard Pillar (Risk/Reward Route, Length 155m)
   * Central red emissive HAZARD obelisk in the lane flanked by angled canyon walls for whip turns,
   * plus a high overhead bridge for players threading the narrow ceiling slot.
   *
   * @param {{ x: number, y: number, z: number }} cursor
   * @param {() => number} rng
   * @param {Object} chunk
   * @returns {{ x: number, y: number, z: number }}
   */
  buildChunk4_SplitCanyon(cursor, rng, chunk) {
    const chunkLength = 155;
    const midZ = cursor.z - 75.0;

    // 1. Central Red HAZARD Obelisk (12x36x46m) — Instant death on contact
    this.spawnBlock({
      x: cursor.x,
      y: cursor.y + 6.0,
      z: midZ,
      w: 12.0,
      h: 36.0,
      d: 46.0,
      color: CONFIG.COLORS.HAZARD_LAVA,
      isHazard: true,
      chunk,
    });

    // 2. Angled Outer Canyon Walls (4 massive slabs per side for whip turns)
    const wallSegments = 4;
    const wallSpan = 120.0;
    const stepZ = wallSpan / wallSegments;

    for (let w = 0; w < wallSegments; w++) {
      const wz = cursor.z - 18.0 - w * stepZ;
      const progress = w / (wallSegments - 1);
      // Pinch in slightly near the middle obelisk, flare out at entrance/exit
      const flare = Math.sin(progress * Math.PI) * 4.0;
      const leftX = cursor.x - (28.0 - flare);
      const rightX = cursor.x + (28.0 - flare);
      const wallY = cursor.y + 12.0;

      // Left canyon wall slab
      this.spawnBlock({
        x: leftX,
        y: wallY,
        z: wz,
        w: 10.0,
        h: 52.0,
        d: 28.0,
        ry: -0.09 + progress * 0.18,
        color: CONFIG.COLORS.STONE_PRIMARY,
        chunk,
      });

      // Right canyon wall slab
      this.spawnBlock({
        x: rightX,
        y: wallY,
        z: wz,
        w: 10.0,
        h: 52.0,
        d: 28.0,
        ry: 0.09 - progress * 0.18,
        color: CONFIG.COLORS.STONE_PRIMARY,
        chunk,
      });
    }

    // 3. High-Speed Overhead Sky Bridge directly above the hazard obelisk
    this.spawnBlock({
      x: cursor.x,
      y: cursor.y + 32.0,
      z: midZ,
      w: 14.0,
      h: 4.0,
      d: 42.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });

    return {
      x: cursor.x,
      y: cursor.y,
      z: cursor.z - chunkLength,
    };
  }

  /**
   * Chunk 5 — The Sky Stepping Stones (Sparse Long-Range Gap, Length 175m)
   * 5 suspended polyhedral blocks (8x12x8m) spaced 35m apart at varying heights,
   * surmounted by high grapple crystal spires. Requires precise aim and release.
   *
   * @param {{ x: number, y: number, z: number }} cursor
   * @param {() => number} rng
   * @param {Object} chunk
   * @returns {{ x: number, y: number, z: number }}
   */
  buildChunk5_SteppingStones(cursor, rng, chunk) {
    const chunkLength = 175;
    const stoneCount = 5;
    const spacingZ = 35.0;

    for (let k = 0; k < stoneCount; k++) {
      const z = cursor.z - 18.0 - k * spacingZ;
      const sideSign = k % 2 === 0 ? -1 : 1;
      const x = cursor.x + sideSign * (10.0 + rng() * 7.0);
      const y = cursor.y + k * 2.5 + (rng() - 0.5) * 6.0;

      // Suspended stepping stone island block
      this.spawnBlock({
        x,
        y,
        z,
        w: 9.0,
        h: 14.0,
        d: 9.0,
        rx: 0.08,
        ry: rng() * 0.6,
        rz: -0.08 * sideSign,
        color: CONFIG.COLORS.STONE_PRIMARY,
        chunk,
      });

      // High-altitude Grapple Crystal Spire above the stone
      this.spawnBlock({
        x: x + (rng() - 0.5) * 3.0,
        y: y + 18.0,
        z,
        w: 5.0,
        h: 8.0,
        d: 5.0,
        rx: 0.78,
        rz: 0.78,
        color: CONFIG.COLORS.STONE_SECONDARY,
        chunk,
      });
    }

    return {
      x: cursor.x,
      y: cursor.y + 10.0,
      z: cursor.z - chunkLength,
    };
  }

  /**
   * Chunk 6 — The Slingshot Catapult Finale (Length 140m)
   * Two monumental twin obelisks (16x80x16m) positioned symmetrically at X = ±20m,
   * 60m ahead of the Finish Gate, inviting a dual-hook Left+Right slingshot boost.
   *
   * @param {{ x: number, y: number, z: number }} cursor
   * @param {() => number} rng
   * @param {Object} chunk
   * @returns {{ x: number, y: number, z: number }}
   */
  buildChunk6_SlingshotFinale(cursor, rng, chunk) {
    const chunkLength = 140;
    const obeliskZ = cursor.z - 65.0;
    const obeliskHeight = 80.0;
    const obeliskWidth = 16.0;

    // 1. Entrance guide pillars
    this.spawnBlock({
      x: cursor.x - 16.0,
      y: cursor.y + 12.0,
      z: cursor.z - 22.0,
      w: 8.0,
      h: 42.0,
      d: 8.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x + 16.0,
      y: cursor.y + 12.0,
      z: cursor.z - 22.0,
      w: 8.0,
      h: 42.0,
      d: 8.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });

    // 2. Twin Monumental Slingshot Obelisks at X = ±20m
    this.spawnBlock({
      x: cursor.x - 20.0,
      y: cursor.y + 25.0,
      z: obeliskZ,
      w: obeliskWidth,
      h: obeliskHeight,
      d: obeliskWidth,
      color: CONFIG.COLORS.STONE_PRIMARY,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x + 20.0,
      y: cursor.y + 25.0,
      z: obeliskZ,
      w: obeliskWidth,
      h: obeliskHeight,
      d: obeliskWidth,
      color: CONFIG.COLORS.STONE_PRIMARY,
      chunk,
    });

    // 3. Overhead brutalist arch linking the twin obelisks
    this.spawnBlock({
      x: cursor.x,
      y: cursor.y + 55.0,
      z: obeliskZ,
      w: 48.0,
      h: 6.0,
      d: 10.0,
      color: CONFIG.COLORS.STONE_SECONDARY,
      chunk,
    });

    return {
      x: cursor.x,
      y: cursor.y,
      z: cursor.z - chunkLength,
    };
  }

  /**
   * Dispatches generation to the appropriate chunk archetype builder.
   *
   * @param {number} archetype 1 to 6
   * @param {{ x: number, y: number, z: number }} cursor
   * @param {() => number} rng
   * @param {Object} chunk
   * @returns {{ x: number, y: number, z: number }} Exit cursor
   */
  dispatchChunkBuilder(archetype, cursor, rng, chunk) {
    switch (archetype) {
      case 1:
        return this.buildChunk1_TwinSpires(cursor, rng, chunk);
      case 2:
        return this.buildChunk2_UnderBridgeDive(cursor, rng, chunk);
      case 3:
        return this.buildChunk3_ThreadingRings(cursor, rng, chunk);
      case 4:
        return this.buildChunk4_SplitCanyon(cursor, rng, chunk);
      case 5:
        return this.buildChunk5_SteppingStones(cursor, rng, chunk);
      case 6:
        return this.buildChunk6_SlingshotFinale(cursor, rng, chunk);
      default:
        return this.buildChunk1_TwinSpires(cursor, rng, chunk);
    }
  }

  /**
   * Spawns a single chunk of the specified archetype at the current cursor position.
   *
   * @param {number} archetype Integer 1 to 6
   * @returns {Object} The created chunk object
   */
  spawnChunk(archetype) {
    const chunk = {
      id: ++this.chunkCounter,
      index: this.activeChunks.length,
      archetype,
      meshes: [],
      bodies: [],
      startZ: this.cursor.z,
      endZ: 0,
    };

    const nextCursor = this.dispatchChunkBuilder(archetype, this.cursor, this.rng, chunk);
    chunk.endZ = nextCursor.z;
    this.cursor = nextCursor;
    this.farthestZ = this.cursor.z;

    this.activeChunks.push(chunk);
    return chunk;
  }

  /**
   * Completely tears down and frees all resources associated with a chunk:
   * removes meshes from scene and grappleable list, removes bodies from physics world
   * and hazard list, and disposes geometries.
   *
   * @param {Object} chunk
   */
  disposeChunk(chunk) {
    if (!chunk) return;

    // 1. Remove and dispose meshes
    for (const mesh of chunk.meshes) {
      this.scene.remove(mesh);
      const gIdx = this.grappleableMeshes.indexOf(mesh);
      if (gIdx !== -1) {
        this.grappleableMeshes.splice(gIdx, 1);
      }
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      // Note: Materials are shared in this.materials, do not dispose shared instances
    }

    // 2. Remove physics bodies
    for (const body of chunk.bodies) {
      this.physicsWorld.removeBody(body);
      const hIdx = this.hazardBodies.indexOf(body);
      if (hIdx !== -1) {
        this.hazardBodies.splice(hIdx, 1);
      }
    }

    chunk.meshes = [];
    chunk.bodies = [];
  }

  /**
   * Clears all existing active chunks, collision bodies, grappleable meshes,
   * start pad, and finish gate from the world.
   */
  clearAllCourseObjects() {
    // Clear all chunks
    while (this.activeChunks.length > 0) {
      const chunk = this.activeChunks.pop();
      this.disposeChunk(chunk);
    }

    this.grappleableMeshes = [];
    this.hazardBodies = [];

    this.clearStartPad();
    this.clearFinishGate();

    this.cursor = { x: 0, y: 0, z: 0 };
    this.farthestZ = 0;
  }

  /**
   * Loads a complete course preset by ID (1: Sprint, 2: Citadel, 3: Gauntlet, 4: Endless).
   * Seeds the deterministic PRNG, clears previous geometry, creates the Start Pad,
   * constructs the sequence of procedural chunks, and positions the Finish Gate.
   *
   * @param {number} presetId Course preset identifier (1, 2, 3, or 4)
   */
  loadCourse(presetId = 1) {
    this.currentPresetId = presetId;
    this.clearAllCourseObjects();

    const courseConfig = CONFIG.COURSES[presetId] || CONFIG.COURSES[1];
    const isEndless = presetId === 4 || !!courseConfig.isEndless;

    // Seed PRNG: deterministic for time-trial courses, clock-seeded for endless
    this.currentSeed = isEndless ? Date.now() : courseConfig.seed;
    this.rng = mulberry32(this.currentSeed);

    // 1. Build Start Pad at (0, 0, 0)
    this.spawnStartPad();

    // 2. Initial cursor just past the start platform
    this.cursor = { x: 0, y: 0, z: -10.0 };
    this.farthestZ = this.cursor.z;

    if (isEndless) {
      // 3A. Endless Mode: Spawn initial window of chunks
      const initialChunkCount = CONFIG.LEVEL.ENDLESS_ACTIVE_CHUNKS || 5;
      for (let i = 0; i < initialChunkCount; i++) {
        const randomArchetype = 1 + Math.floor(this.rng() * 6);
        this.spawnChunk(randomArchetype);
      }
      // Finish gate placed indefinitely far in Endless
      this.finishGate = {
        z: -999999,
        y: 0,
        x: 0,
        radius: 18,
        mesh: null,
      };
    } else {
      // 3B. Standard Time-Trial Mode: Build authored chunk sequence
      const chunkSequence = courseConfig.chunks || [1, 2, 3, 4, 5, 6];
      for (const archetype of chunkSequence) {
        this.spawnChunk(archetype);
      }

      // 4. Place Finish Gate at the end of the course
      const finishZ = this.cursor.z - 25.0;
      const finishY = this.cursor.y + 6.0;
      const finishX = this.cursor.x;
      this.spawnFinishGate(finishX, finishY, finishZ);
    }

    return {
      presetId,
      chunkCount: this.activeChunks.length,
      farthestZ: this.farthestZ,
      finishGateZ: this.finishGate.z,
    };
  }

  /**
   * Endless mode chunk streamer and recycler.
   * When playerZ approaches within 350m of farthestZ, spawns a new random chunk ahead.
   * When a chunk falls > 180m behind playerZ, it is safely disposed.
   *
   * @param {number} playerZ Player's current world-space Z coordinate
   */
  updateEndless(playerZ) {
    if (this.currentPresetId !== 4) return;

    // 1. Spawn ahead: playerZ is negative, moving forward means smaller/more negative numbers
    // Distance to edge = playerZ - farthestZ. If distance < 350m, spawn new chunk!
    if (playerZ < this.farthestZ + 350.0) {
      const nextArchetype = 1 + Math.floor(this.rng() * 6);
      this.spawnChunk(nextArchetype);
    }

    // 2. Recycle behind: chunk.endZ is behind player if chunk.endZ > playerZ + 180m
    const retainChunks = [];
    for (const chunk of this.activeChunks) {
      if (chunk.endZ > playerZ + 180.0) {
        // Chunk is safely behind player, dispose it
        this.disposeChunk(chunk);
      } else {
        retainChunks.push(chunk);
      }
    }
    this.activeChunks = retainChunks;
  }

  /**
   * Master update hook called each animation frame.
   * Updates lava abyss position & shaders, endless chunk streaming, and finish gate FX.
   *
   * @param {number} dt Delta time in seconds
   * @param {THREE.Vector3|{ x: number, y: number, z: number }} [playerPosition]
   * @param {number} [time=0] Elapsed time in seconds
   */
  update(dt, playerPosition, time = 0) {
    const playerZ = playerPosition ? playerPosition.z : 0;

    // Update animated lava abyss floor
    this.updateAbyss(playerZ, time);

    // Update endless chunk streaming if active
    if (this.currentPresetId === 4) {
      this.updateEndless(playerZ);
    }

    // Update finish gate ring glow & rotation
    this.updateFinishGate(time);
  }
}

export default LevelGenerator;
