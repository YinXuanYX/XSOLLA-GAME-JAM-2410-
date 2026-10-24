import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

/**
 * ============================================================================
 * AERO-HOOK v3.0 // LEVEL GENERATOR
 * OBSIDIAN SLAB MONOLITHS, SCI-FI MEGACITY HORIZON, BLACK HOLE SINGULARITY FINALE
 * ============================================================================
 */

const NO_RAYCAST = () => {};

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

const BLACK_HOLE_COUNT = 48;
const IMPLODE_TIME = 0.35;
const EXPLODE_END = 1.35;
const CITY_COUNT = 64;
const CITY_SPAN = 900;
const CITY_AHEAD = 650;
const CITY_BEHIND = 250;

/**
 * Mulberry32 deterministic 32-bit PRNG.
 * @param {number} seed
 * @returns {() => number}
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

export class LevelGenerator {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./PhysicsWorld.js').PhysicsWorld|any} physicsWorld
   */
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    // Raycast target array for GrappleSystem and CameraController (ONLY solid base meshes!)
    this.grappleableMeshes = [];

    // Active course chunks queue: [{ id, index, archetype, meshes: [], bodies: [], startZ, endZ }]
    this.activeChunks = [];

    // Red/Orange lethal collision bodies that kill on player contact
    this.hazardBodies = [];

    // Finish Gate target descriptor
    this.finishGate = {
      z: -1000,
      y: 0,
      x: 0,
      radius: 18,
      mesh: null,
      exploding: false,
      explodeTimer: 0,
    };

    this.blackHoleGroup = null;
    this.bhCore = null;
    this.bhHalo = null;
    this.bhDisk1 = null;
    this.bhDisk2 = null;
    this.bhParticles = [];
    this.bhShockwave = null;
    this.bhCoreMaterial = null;
    this.bhParticleGeo = null;
    this.bhParticleMaterials = [];
    this.bhDetonated = false;

    this.blockCounter = 0;

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

    // Shared Materials with Fresnel Rim Glow and Emissive Neon Bloom (Version 4.0)
    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x0a0e18,
      roughness: 0.22,
      metalness: 0.88,
      emissive: 0x001830,
      emissiveIntensity: 0.12,
      flatShading: false,
    });
    obsidianMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         vec3 vDir = normalize(vViewPosition);
         float fres = pow(1.0 - abs(dot(vDir, normalize(vNormal))), 3.2);
         totalEmissiveRadiance += vec3(0.0, 0.42, 0.72) * fres * 0.55;`
      );
    };

    const blockBaseMat = new THREE.MeshStandardMaterial({
      color: CONFIG.COLORS.BLOCK_BASE ?? 0x10141f,
      roughness: 0.45,
      metalness: 0.35,
      emissive: 0x001830,
      emissiveIntensity: 0.12,
    });
    blockBaseMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         vec3 vDir = normalize(vViewPosition);
         float fres = pow(1.0 - abs(dot(vDir, normalize(vNormal))), 3.2);
         totalEmissiveRadiance += vec3(0.0, 0.42, 0.72) * fres * 0.55;`
      );
    };

    const emissiveCyanMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 2.8,
      roughness: 0.1,
      metalness: 0.0,
    });
    const emissiveBlueMat = new THREE.MeshStandardMaterial({
      color: 0x00aaff,
      emissive: 0x00aaff,
      emissiveIntensity: 2.8,
      roughness: 0.1,
      metalness: 0.0,
    });
    const emissiveRedMat = new THREE.MeshStandardMaterial({
      color: 0xff0044,
      emissive: 0xff0044,
      emissiveIntensity: 2.8,
      roughness: 0.1,
      metalness: 0.0,
    });
    const hazardEmissiveMat = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xff3300,
      emissiveIntensity: 2.2,
      roughness: 0.15,
      metalness: 0.0,
    });
    const hazardApproachMat = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      emissive: 0xff5500,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });

    this.materials = {
      obsidian: obsidianMat,
      blockBase: blockBaseMat,
      stripes: [emissiveCyanMat, emissiveBlueMat, emissiveRedMat],
      emissiveCyan: emissiveCyanMat,
      emissiveBlue: emissiveBlueMat,
      emissiveRed: emissiveRedMat,
      hazardBase: new THREE.MeshStandardMaterial({
        color: 0x1f0500,
        emissive: 0x401000,
        emissiveIntensity: 0.8,
        roughness: 0.35,
        metalness: 0.1,
      }),
      hazardStripes: [
        hazardEmissiveMat,
        new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 2.0 }),
      ],
      hazardEmissive: hazardEmissiveMat,
      hazardApproach: hazardApproachMat,
      safeApproach: emissiveCyanMat,
      startPadBase: new THREE.MeshStandardMaterial({
        color: CONFIG.COLORS.START_PAD_BASE ?? 0x10141f,
        roughness: 0.28,
        metalness: 0.82,
      }),
      startPadNeon: new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 2.8,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
      }),
    };

    // Pre-computed reusable prefab geometries (NEVER constructed inside spawnChunk)
    this.prefabGeos = {
      hexPortal: this._buildHexPortalGeo(12.0, 9.0, 6.0),
      triArch: this._buildTriArchGeo(28, 22, 8, 3.5),
      buttressPylon: this._buildButtressPylonGeo(6, 35, 8),
      citadelPlate: new THREE.BoxGeometry(24, 3, 20),
      spikeHazard: new THREE.ConeGeometry(1.2, 4.0, 4),
      channelStrip: new THREE.BoxGeometry(0.8, 1, 0.25),
      approachStrip: new THREE.BoxGeometry(1, 0.15, 0.08),
      edgeBevel: new THREE.BoxGeometry(0.3, 1, 0.3),
    };

    // Build persistent wave lava abyss & ember system
    this.initAbyssPlane();

    // Distant sci-fi megacity horizon
    this.initCityBackground();
  }

  /**
   * Pre-computes hexagonal portal frame geometry with hollow center.
   * @param {number} [R=12.0] Outer radius
   * @param {number} [r=9.0] Inner radius
   * @param {number} [depth=6.0] Frame extrusion depth
   * @returns {THREE.ExtrudeGeometry}
   */
  _buildHexPortalGeo(R = 12.0, r = 9.0, depth = 6.0) {
    const hexShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const method = i === 0 ? 'moveTo' : 'lineTo';
      hexShape[method](Math.cos(a) * R, Math.sin(a) * R);
    }
    hexShape.closePath();

    const hole = new THREE.Path();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const method = i === 0 ? 'moveTo' : 'lineTo';
      hole[method](Math.cos(a) * r, Math.sin(a) * r);
    }
    hole.closePath();
    hexShape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(hexShape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.3,
      bevelSize: 0.3,
      bevelSegments: 1,
    });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  /**
   * Pre-computes triangular arch geometry with hollow center.
   * @param {number} [baseWidth=28] Outer base width
   * @param {number} [height=22] Outer apex height
   * @param {number} [thickness=8] Extrusion thickness
   * @param {number} [wallThickness=3.5] Frame wall thickness
   * @returns {THREE.ExtrudeGeometry}
   */
  _buildTriArchGeo(baseWidth = 28, height = 22, thickness = 8, wallThickness = 3.5) {
    const outerShape = new THREE.Shape();
    outerShape.moveTo(-baseWidth / 2, 0);
    outerShape.lineTo(0, height);
    outerShape.lineTo(baseWidth / 2, 0);
    outerShape.closePath();

    const innerShape = new THREE.Path();
    const inset = wallThickness;
    innerShape.moveTo(-baseWidth / 2 + inset, inset);
    innerShape.lineTo(0, height - inset * 1.5);
    innerShape.lineTo(baseWidth / 2 - inset, inset);
    innerShape.closePath();
    outerShape.holes.push(innerShape);

    const geo = new THREE.ExtrudeGeometry(outerShape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: 0.4,
      bevelSize: 0.4,
      bevelSegments: 1,
    });
    geo.translate(0, 0, -thickness / 2);
    return geo;
  }

  /**
   * Pre-computes angled brutalist buttress pylon geometry tapering upward.
   * @param {number} [width=6] Base width
   * @param {number} [height=35] Height
   * @param {number} [depth=8] Depth
   * @returns {THREE.ExtrudeGeometry}
   */
  _buildButtressPylonGeo(width = 6, height = 35, depth = 8) {
    const pylonShape = new THREE.Shape();
    const hw = width / 2;
    pylonShape.moveTo(-hw, 0);
    pylonShape.lineTo(-hw * 1.35, height * 0.7);
    pylonShape.lineTo(-hw * 0.6, height);
    pylonShape.lineTo(hw * 0.6, height);
    pylonShape.lineTo(hw * 1.35, height * 0.7);
    pylonShape.lineTo(hw, 0);
    pylonShape.closePath();

    const geo = new THREE.ExtrudeGeometry(pylonShape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.4,
      bevelSize: 0.4,
      bevelSegments: 1,
    });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  get currentCourse() {
    return CONFIG.COURSES?.[this.currentPresetId] || CONFIG.COURSES?.[1];
  }

  /**
   * Spawns a Tron obsidian block or glowing orange lava tile with zero Z-fighting.
   *
   * @param {Object} options
   * @param {number} options.x Center X
   * @param {number} options.y Center Y
   * @param {number} options.z Center Z
   * @param {number} options.w Width
   * @param {number} options.h Height
   * @param {number} options.d Depth
   * @param {number} [options.rx=0]
   * @param {number} [options.ry=0]
   * @param {number} [options.rz=0]
   * @param {number} [options.color]
   * @param {boolean} [options.isHazard=false]
   * @param {boolean} [options.isStartPad=false]
   * @param {Object} [options.chunk=null]
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
    // 1. Base Solid Three.js Box Geometry
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    let baseMaterial;

    if (isHazard) {
      baseMaterial = this.materials.hazardBase;
    } else if (color && color !== CONFIG.COLORS.BLOCK_BASE && color !== CONFIG.COLORS.STONE_PRIMARY) {
      if (!this.customBaseMaterials) this.customBaseMaterials = new Map();
      baseMaterial = this.customBaseMaterials.get(color);
      if (!baseMaterial) {
        baseMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
        this.customBaseMaterials.set(color, baseMaterial);
      }
    } else {
      baseMaterial = this.materials.blockBase;
    }

    const mesh = new THREE.Mesh(boxGeo, baseMaterial);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // 2. Wide neon slab stripes (children of base mesh, proud of the surface so they never Z-fight)
    const blockIndex = this.blockCounter++;
    const addSlab = (geo, mat, px, py, pz) => {
      const slab = new THREE.Mesh(geo, mat);
      slab.position.set(px, py, pz);
      slab.raycast = NO_RAYCAST;
      mesh.add(slab);
    };

    if (isHazard) {
      const bandH = h < 4 ? h * 0.4 : 0.8;
      const bandGeo = new THREE.BoxGeometry(w + 0.12, bandH, d + 0.12);
      const hazMats = this.materials.hazardStripes;
      if (h < 12) {
        addSlab(bandGeo, hazMats[0], 0, 0, 0);
      } else {
        addSlab(bandGeo, hazMats[0], 0, -h * 0.3, 0);
        addSlab(bandGeo, hazMats[1], 0, 0, 0);
        addSlab(bandGeo, hazMats[0], 0, h * 0.3, 0);
      }
    } else {
      const stripeMat = this.materials.stripes[blockIndex % this.materials.stripes.length];

      if (h >= 8) {
        const stripeH = clampNum(h * 0.08, 0.9, 2.2);
        const bandGeo = new THREE.BoxGeometry(w + 0.12, stripeH, d + 0.12);
        addSlab(bandGeo, stripeMat, 0, h * 0.38, 0);
        if (h >= 14) addSlab(bandGeo, stripeMat, 0, -h * 0.38, 0);
        if (h >= 30) addSlab(bandGeo, stripeMat, 0, 0, 0);

        if (h >= 20) {
          const pilasterGeo = new THREE.BoxGeometry(1.4, h * 0.82, d + 0.14);
          const px = w / 2 - 0.7 + 0.09;
          addSlab(pilasterGeo, stripeMat, -px, 0, 0);
          addSlab(pilasterGeo, stripeMat, px, 0, 0);
        }
      } else {
        const bandH = Math.min(h * 0.3, 0.9);
        const bandGeo = new THREE.BoxGeometry(w + 0.12, bandH, d + 0.12);
        addSlab(bandGeo, stripeMat, 0, 0, 0);
      }
    }

    // Approach-facing emissive strip on -Z face (visual warning: cyan safe, orange hazard)
    const approachMat = isHazard ? this.materials.hazardApproach : this.materials.safeApproach;
    const approachGeo = new THREE.BoxGeometry(w * 0.8, 1.0, 0.08);
    const approachSlab = new THREE.Mesh(approachGeo, approachMat);
    approachSlab.position.set(0, 0, -d / 2 - 0.05);
    approachSlab.scale.set(1, 0.15, 1);
    approachSlab.raycast = NO_RAYCAST;
    mesh.add(approachSlab);

    // Beveled corner edge strips for tall monoliths to catch Fresnel rim glow
    if (h >= 20 && !isHazard) {
      const edgeGeo = new THREE.BoxGeometry(0.3, h * 0.85, 0.3);
      const edgeMat = this.materials.obsidian;
      const hw = w / 2;
      const hd = d / 2;
      const addBevel = (bx, bz) => {
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.set(bx, 0, bz);
        edge.rotation.y = Math.PI / 4;
        edge.raycast = NO_RAYCAST;
        mesh.add(edge);
      };
      addBevel(-hw, -hd);
      addBevel(hw, -hd);
      addBevel(-hw, hd);
      addBevel(hw, hd);
    }

    // 3. Cannon.js Matching Static Collider
    const halfExtents = new CANNON.Vec3(w / 2, h / 2, d / 2);
    const shape = new CANNON.Box(halfExtents);
    const body = new CANNON.Body({
      mass: 0,
      shape,
      position: new CANNON.Vec3(x, y, z),
      material: this.physicsWorld?.worldMaterial || undefined,
    });

    if (rx !== 0 || ry !== 0 || rz !== 0) {
      const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(euler);
      body.quaternion.set(q.x, q.y, q.z, q.w);
    }

    // 4. Tagging and Collection Routing
    // CRITICAL: Push ONLY the solid base THREE.Mesh to grappleableMeshes (never decorative slabs)
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

    // 5. Add to scene & physics world
    this.scene.add(mesh);
    this.physicsWorld.addBody(body);

    if (chunk) {
      chunk.meshes.push(mesh);
      chunk.bodies.push(body);
    }

    return { mesh, body };
  }

  /**
   * Spawns a monumental hexagonal portal with hollow center (v4.0 Architectural Prefab).
   */
  spawnHexPortal({ x, y, z, rx = 0, ry = 0, rz = 0, chunk = null }) {
    const geo = this.prefabGeos.hexPortal;
    const mesh = new THREE.Mesh(geo, this.materials.obsidian);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Approach-facing emissive warning strip on -Z face
    const approachMesh = new THREE.Mesh(
      new THREE.BoxGeometry(16.0, 0.25, 0.1),
      this.materials.safeApproach
    );
    approachMesh.position.set(0, -9.5, -3.05);
    approachMesh.raycast = NO_RAYCAST;
    mesh.add(approachMesh);

    // Inner glowing accent ring
    const innerTrim = new THREE.Mesh(
      new THREE.RingGeometry(8.8, 9.2, 6),
      this.materials.emissiveCyan
    );
    innerTrim.position.set(0, 0, 0);
    innerTrim.raycast = NO_RAYCAST;
    mesh.add(innerTrim);

    // Physics body: 4 CANNON.Box compound shapes forming the hollow frame (no center collision)
    const body = new CANNON.Body({
      mass: 0,
      material: this.physicsWorld?.worldMaterial || undefined,
    });
    body.position.set(x, y, z);

    // Top beam
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(10.5, 1.5, 3.0)),
      new CANNON.Vec3(0, 10.5, 0)
    );
    // Bottom beam
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(10.5, 1.5, 3.0)),
      new CANNON.Vec3(0, -10.5, 0)
    );
    // Left beam
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(1.5, 10.5, 3.0)),
      new CANNON.Vec3(-10.5, 0, 0)
    );
    // Right beam
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(1.5, 10.5, 3.0)),
      new CANNON.Vec3(10.5, 0, 0)
    );

    if (rx !== 0 || ry !== 0 || rz !== 0) {
      const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(euler);
      body.quaternion.set(q.x, q.y, q.z, q.w);
    }

    body.userData = { type: 'GRAPPLEABLE' };
    mesh.userData = { type: 'GRAPPLEABLE', isGrappleable: true };
    this.grappleableMeshes.push(mesh);

    this.scene.add(mesh);
    this.physicsWorld.addBody(body);

    if (chunk) {
      chunk.meshes.push(mesh);
      chunk.bodies.push(body);
    }

    return { mesh, body };
  }

  /**
   * Spawns a brutalist triangular arch with hollow center (v4.0 Architectural Prefab).
   */
  spawnTriArch({ x, y, z, rx = 0, ry = 0, rz = 0, chunk = null }) {
    const geo = this.prefabGeos.triArch;
    const mesh = new THREE.Mesh(geo, this.materials.obsidian);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Approach-facing emissive warning strip at base
    const approachMesh = new THREE.Mesh(
      new THREE.BoxGeometry(22.0, 0.25, 0.1),
      this.materials.safeApproach
    );
    approachMesh.position.set(0, 0.2, -4.05);
    approachMesh.raycast = NO_RAYCAST;
    mesh.add(approachMesh);

    // Physics body: compound left/right slanted pillars + apex cap
    const body = new CANNON.Body({
      mass: 0,
      material: this.physicsWorld?.worldMaterial || undefined,
    });
    body.position.set(x, y, z);

    // Left wall
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(2.5, 11.0, 4.0)),
      new CANNON.Vec3(-9.0, 10.0, 0)
    );
    // Right wall
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(2.5, 11.0, 4.0)),
      new CANNON.Vec3(9.0, 10.0, 0)
    );
    // Apex cap
    body.addShape(
      new CANNON.Box(new CANNON.Vec3(4.0, 2.0, 4.0)),
      new CANNON.Vec3(0, 20.0, 0)
    );

    if (rx !== 0 || ry !== 0 || rz !== 0) {
      const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(euler);
      body.quaternion.set(q.x, q.y, q.z, q.w);
    }

    body.userData = { type: 'GRAPPLEABLE' };
    mesh.userData = { type: 'GRAPPLEABLE', isGrappleable: true };
    this.grappleableMeshes.push(mesh);

    this.scene.add(mesh);
    this.physicsWorld.addBody(body);

    if (chunk) {
      chunk.meshes.push(mesh);
      chunk.bodies.push(body);
    }

    return { mesh, body };
  }

  /**
   * Spawns an angled brutalist buttress pylon (v4.0 Architectural Prefab).
   */
  spawnButtressPylon({ x, y, z, rx = 0, ry = 0, rz = 0, chunk = null }) {
    const geo = this.prefabGeos.buttressPylon;
    const mesh = new THREE.Mesh(geo, this.materials.obsidian);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Inset vertical emissive channel down center front face
    const channelMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 26.0, 0.25),
      this.materials.emissiveCyan
    );
    channelMesh.position.set(0, 17.5, 4.08);
    channelMesh.raycast = NO_RAYCAST;
    mesh.add(channelMesh);

    // Glowing approach strip at base on -Z face
    const approachMesh = new THREE.Mesh(
      new THREE.BoxGeometry(5.0, 0.25, 0.1),
      this.materials.safeApproach
    );
    approachMesh.position.set(0, 2.0, -4.08);
    approachMesh.raycast = NO_RAYCAST;
    mesh.add(approachMesh);

    // Physics body: bounding box centered at y + 17.5 (since geometry base is at y=0)
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(3.8, 17.5, 4.2)),
      position: new CANNON.Vec3(x, y + 17.5, z),
      material: this.physicsWorld?.worldMaterial || undefined,
    });

    if (rx !== 0 || ry !== 0 || rz !== 0) {
      const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(euler);
      body.quaternion.set(q.x, q.y, q.z, q.w);
    }

    body.userData = { type: 'GRAPPLEABLE' };
    mesh.userData = { type: 'GRAPPLEABLE', isGrappleable: true };
    this.grappleableMeshes.push(mesh);

    this.scene.add(mesh);
    this.physicsWorld.addBody(body);

    if (chunk) {
      chunk.meshes.push(mesh);
      chunk.bodies.push(body);
    }

    return { mesh, body };
  }

  /**
   * Spawns a floating citadel plate with underside glow & edge trims (v4.0 Architectural Prefab).
   */
  spawnCitadelPlate({ x, y, z, rx = 0, ry = 0, rz = 0, chunk = null }) {
    const geo = this.prefabGeos.citadelPlate;
    const mesh = new THREE.Mesh(geo, this.materials.obsidian);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Glowing underside panel strips
    for (let i = -2; i <= 2; i++) {
      const underStrip = new THREE.Mesh(
        new THREE.BoxGeometry(20.0, 0.08, 1.2),
        this.materials.emissiveBlue
      );
      underStrip.position.set(0, -1.54, i * 3.5);
      underStrip.raycast = NO_RAYCAST;
      mesh.add(underStrip);
    }

    // Glowing edge trims
    const trimMat = this.materials.emissiveCyan;
    const edgeTrimL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 20.1), trimMat);
    edgeTrimL.position.set(-12.02, 0, 0);
    edgeTrimL.raycast = NO_RAYCAST;
    mesh.add(edgeTrimL);

    const edgeTrimR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 20.1), trimMat);
    edgeTrimR.position.set(12.02, 0, 0);
    edgeTrimR.raycast = NO_RAYCAST;
    mesh.add(edgeTrimR);

    // Approach strip on -Z face
    const approachMesh = new THREE.Mesh(
      new THREE.BoxGeometry(20.0, 0.25, 0.1),
      this.materials.safeApproach
    );
    approachMesh.position.set(0, 0, -10.05);
    approachMesh.raycast = NO_RAYCAST;
    mesh.add(approachMesh);

    // Physics body
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(12.0, 1.5, 10.0)),
      position: new CANNON.Vec3(x, y, z),
      material: this.physicsWorld?.worldMaterial || undefined,
    });

    if (rx !== 0 || ry !== 0 || rz !== 0) {
      const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(euler);
      body.quaternion.set(q.x, q.y, q.z, q.w);
    }

    body.userData = { type: 'GRAPPLEABLE' };
    mesh.userData = { type: 'GRAPPLEABLE', isGrappleable: true };
    this.grappleableMeshes.push(mesh);

    this.scene.add(mesh);
    this.physicsWorld.addBody(body);

    if (chunk) {
      chunk.meshes.push(mesh);
      chunk.bodies.push(body);
    }

    return { mesh, body };
  }

  /**
   * Spawns a hazard spike array with angular warning silhouette (v4.0 Architectural Prefab).
   */
  spawnHazardSpikeArray({
    x,
    y,
    z,
    w = 12.0,
    h = 3.0,
    d = 12.0,
    rx = 0,
    ry = 0,
    rz = 0,
    chunk = null,
  }) {
    const baseGeo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(baseGeo, this.materials.hazardBase);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Glowing hazard stripe around base
    const stripeGeo = new THREE.BoxGeometry(w + 0.12, h * 0.4, d + 0.12);
    const stripeMesh = new THREE.Mesh(stripeGeo, this.materials.hazardEmissive);
    stripeMesh.raycast = NO_RAYCAST;
    mesh.add(stripeMesh);

    // Hazard approach warning strip on -Z face
    const approachMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.85, 0.2, 0.1),
      this.materials.hazardApproach
    );
    approachMesh.position.set(0, 0, -d / 2 - 0.05);
    approachMesh.raycast = NO_RAYCAST;
    mesh.add(approachMesh);

    // Radial hazard spikes protruding outward
    const spikeGeo = this.prefabGeos.spikeHazard;
    const spikeMat = this.materials.hazardEmissive;
    const numSpikes = Math.max(6, Math.floor((w + d) / 3));
    for (let i = 0; i < numSpikes; i++) {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      const angle = (i / numSpikes) * Math.PI * 2;
      const radiusX = (w / 2) * 0.85;
      const radiusZ = (d / 2) * 0.85;
      spike.position.set(Math.cos(angle) * radiusX, h / 2 + 1.2, Math.sin(angle) * radiusZ);
      spike.rotation.z = -Math.cos(angle) * 0.35;
      spike.rotation.x = Math.sin(angle) * 0.35;
      spike.raycast = NO_RAYCAST;
      mesh.add(spike);
    }

    // Static hazard collider
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(w / 2, (h + 3.0) / 2, d / 2)),
      position: new CANNON.Vec3(x, y + 1.0, z),
      material: this.physicsWorld?.worldMaterial || undefined,
    });

    if (rx !== 0 || ry !== 0 || rz !== 0) {
      const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(euler);
      body.quaternion.set(q.x, q.y, q.z, q.w);
    }

    body.userData = { type: 'HAZARD' };
    mesh.userData = { type: 'HAZARD', isGrappleable: false };
    this.hazardBodies.push(body);

    this.scene.add(mesh);
    this.physicsWorld.addBody(body);

    if (chunk) {
      chunk.meshes.push(mesh);
      chunk.bodies.push(body);
    }

    return { mesh, body };
  }

  /**
   * Spawns an architectural block, routing to the appropriate prefab method.
   */
  spawnArchitecturalBlock(options) {
    const { type, ...rest } = options;
    switch (type) {
      case 'hexPortal':
        return this.spawnHexPortal(rest);
      case 'triArch':
        return this.spawnTriArch(rest);
      case 'buttressPylon':
        return this.spawnButtressPylon(rest);
      case 'citadelPlate':
        return this.spawnCitadelPlate(rest);
      case 'hazardSpikes':
        return this.spawnHazardSpikeArray(rest);
      default:
        return this.spawnBlock(rest);
    }
  }

  /**
   * Fast collision test for player sphere against all hazard bodies.
   *
   * @param {THREE.Vector3|CANNON.Vec3|{x: number, y: number, z: number}} playerPos
   * @param {number} [radius=1.0]
   * @returns {boolean} True if player sphere intersects any hazard volume
   */
  checkHazardCollision(playerPos, radius = 1.0) {
    if (!playerPos) return false;
    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;
    const r2 = radius * radius;

    for (let i = 0; i < this.hazardBodies.length; i++) {
      const body = this.hazardBodies[i];
      const shape = body.shapes?.[0];
      if (shape && shape.halfExtents) {
        const hx = shape.halfExtents.x;
        const hy = shape.halfExtents.y;
        const hz = shape.halfExtents.z;
        const bx = body.position.x;
        const by = body.position.y;
        const bz = body.position.z;

        const dx = Math.max(0, Math.abs(px - bx) - hx);
        const dy = Math.max(0, Math.abs(py - by) - hy);
        const dz = Math.max(0, Math.abs(pz - bz) - hz);

        if (dx * dx + dy * dy + dz * dz <= r2) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Initializes the persistent Waving Lava Abyss Plane and 120 Rising Embers.
   */
  initAbyssPlane() {
    this.abyssGroup = new THREE.Group();
    this.abyssGroup.position.set(0, CONFIG.LEVEL.ABYSS_VISUAL_Y, 0);

    const size = 600;
    const segments = 56;

    // 1. Abyss Geometry with Vertex Wave Attributes
    this.abyssGeo = new THREE.PlaneGeometry(size, size, segments, segments);
    this.abyssGeo.rotateX(-Math.PI / 2);

    // Save baseline X, Z coords for deterministic wave calculation
    const count = this.abyssGeo.attributes.position.count;
    this.abyssBasePositions = new Float32Array(count * 3);
    this.abyssBasePositions.set(this.abyssGeo.attributes.position.array);

    // Dark Magma Core Mesh
    const magmaMat = new THREE.MeshStandardMaterial({
      color: 0x1a0300,
      emissive: 0x551100,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      flatShading: true,
    });
    this.abyssSolidMesh = new THREE.Mesh(this.abyssGeo, magmaMat);
    this.abyssSolidMesh.receiveShadow = true;
    this.abyssGroup.add(this.abyssSolidMesh);

    // Glowing Neon Orange Lava Wireframe (Raised y = +0.08m to eliminate self Z-fighting)
    this.abyssWireGeo = this.abyssGeo.clone();
    const wireMat = new THREE.MeshStandardMaterial({
      color: CONFIG.COLORS.HAZARD_LAVA ?? 0xff5500,
      wireframe: true,
      emissive: 0xff5500,
      emissiveIntensity: 1.8,
      transparent: true,
      opacity: 0.85,
    });
    this.abyssWireMesh = new THREE.Mesh(this.abyssWireGeo, wireMat);
    this.abyssWireMesh.position.y = 0.08;
    this.abyssGroup.add(this.abyssWireMesh);

    // 2. Rising Lava Ember Particle System (120 particles)
    this.emberCount = 120;
    this.emberGeo = new THREE.BufferGeometry();
    this.emberPositions = new Float32Array(this.emberCount * 3);
    this.embers = [];

    for (let i = 0; i < this.emberCount; i++) {
      const rx = (Math.random() - 0.5) * 280;
      const rz = (Math.random() - 0.5) * 280;
      const y = -35.0 + Math.random() * 31.0;
      const speedY = 3.5 + Math.random() * 5.0; // 3.5 to 8.5 m/s
      const phase = Math.random() * Math.PI * 2;

      this.embers.push({ rx, y, rz, speedY, phase });
      this.emberPositions[i * 3] = rx;
      this.emberPositions[i * 3 + 1] = y;
      this.emberPositions[i * 3 + 2] = rz;
    }

    this.emberGeo.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));
    this.emberMat = new THREE.PointsMaterial({
      color: CONFIG.COLORS.HAZARD_GRID ?? 0xffaa00,
      size: 1.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.emberPoints = new THREE.Points(this.emberGeo, this.emberMat);
    this.scene.add(this.emberPoints);

    this.scene.add(this.abyssGroup);
  }

  /**
   * Updates wave vertex heights on the lava abyss and animates rising embers.
   * Supports both V2 (dt, elapsedTime, playerPos) and legacy (playerZ, time) signatures.
   *
   * @param {number|Object} [arg1=1/60] dt or playerZ or playerPos
   * @param {number} [arg2=0] elapsedTime or time
   * @param {THREE.Vector3|{x: number, y: number, z: number}} [arg3=null] playerPos
   */
  updateAbyss(arg1 = 1 / 60, arg2 = 0, arg3 = null) {
    if (!this.abyssGroup) return;

    let dt = 1 / 60;
    let elapsedTime = 0;
    let px = 0;
    let py = 0;
    let pz = 0;

    if (arg3 !== null && typeof arg3 === 'object') {
      // V2 signature: updateAbyss(dt, elapsedTime, playerPos)
      dt = typeof arg1 === 'number' ? arg1 : 1 / 60;
      elapsedTime = typeof arg2 === 'number' ? arg2 : 0;
      px = arg3.x ?? 0;
      py = arg3.y ?? 0;
      pz = arg3.z ?? 0;
    } else if (typeof arg1 === 'object' && arg1 !== null) {
      // Object signature: updateAbyss(playerPos, dt, elapsedTime)
      px = arg1.x ?? 0;
      py = arg1.y ?? 0;
      pz = arg1.z ?? 0;
      dt = typeof arg2 === 'number' ? arg2 : 1 / 60;
      elapsedTime = typeof arg3 === 'number' ? arg3 : 0;
    } else {
      // Legacy signature: updateAbyss(playerZ, time)
      pz = typeof arg1 === 'number' ? arg1 : 0;
      elapsedTime = typeof arg2 === 'number' ? arg2 : 0;
      dt = 1 / 60;
    }

    // Snap horizontally in 10m grid increments so the wave patterns don't slide unnaturally
    const snapX = Math.round(px / 10.0) * 10.0;
    const snapZ = Math.round(pz / 10.0) * 10.0;
    this.abyssGroup.position.set(snapX, CONFIG.LEVEL.ABYSS_VISUAL_Y, snapZ);

    this.updateCityBackground({ x: px, y: py, z: pz });
    this.updateBlackHole(dt, elapsedTime);

    // 1. Dynamic Vertex Wave Displacement
    if (this.abyssGeo && this.abyssBasePositions) {
      const pos = this.abyssGeo.attributes.position;
      const wirePos = this.abyssWireGeo?.attributes.position;
      const base = this.abyssBasePositions;
      const count = pos.count;

      for (let i = 0; i < count; i++) {
        const bx = base[i * 3];
        const bz = base[i * 3 + 2];
        const wx = bx + snapX;
        const wz = bz + snapZ;

        // Wave formula specified in Sub-Agent 2-V2A requirements
        const height =
          Math.sin(wx * 0.065 + elapsedTime * 2.4) * 1.45 +
          Math.cos(wz * 0.055 + elapsedTime * 1.9) * 1.45;

        pos.setY(i, height);
        if (wirePos) wirePos.setY(i, height);
      }

      pos.needsUpdate = true;
      if (wirePos) wirePos.needsUpdate = true;
      this.abyssGeo.computeVertexNormals();
    }

    // 2. Rising Lava Ember Physics & Re-cycling
    if (this.emberGeo && this.embers) {
      for (let i = 0; i < this.emberCount; i++) {
        const ember = this.embers[i];
        ember.y += ember.speedY * dt;

        // Reset if reached near-surface threshold
        if (ember.y > -4.0) {
          ember.y = -35.0;
          ember.rx = (Math.random() - 0.5) * 260; // [-130, +130] around player
          ember.rz = (Math.random() - 0.5) * 260;
        }

        // Exact world position: (playerPos.x + ember.rx + sin(...) * 2.0, ember.y, playerPos.z + ember.rz)
        const wx = px + ember.rx + Math.sin(elapsedTime * 2.0 + ember.phase) * 2.0;
        const wy = ember.y;
        const wz = pz + ember.rz;

        this.emberPositions[i * 3] = wx;
        this.emberPositions[i * 3 + 1] = wy;
        this.emberPositions[i * 3 + 2] = wz;
      }

      this.emberGeo.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Spawns Start Pad with strict Z-fighting elimination.
   * Base cylinder centered at (0, -1.0, 0) with top face at y = 0.0.
   * Top neon trim physically offset at y = +0.05m.
   */
  spawnStartPad() {
    this.clearStartPad();

    const topRadius = 7.5;
    const botRadius = 8.5;
    const height = 2.0;
    const centerY = -1.0; // Top is at exactly y = 0.0

    // 1. Octagonal Dark Obsidian Base Cylinder
    const baseGeo = new THREE.CylinderGeometry(topRadius, botRadius, height, 8);
    const baseMesh = new THREE.Mesh(baseGeo, this.materials.startPadBase);
    baseMesh.position.set(0, centerY, 0);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;

    // Edge wireframe in cyber teal
    const edgeLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(baseGeo),
      new THREE.LineBasicMaterial({ color: CONFIG.COLORS.START_PAD_NEON ?? 0x00ffcc })
    );
    edgeLines.raycast = NO_RAYCAST;
    baseMesh.add(edgeLines);
    this.startPad.edgeLines = edgeLines;

    // 2. Separate Top Neon Ring at y = +0.05m (5cm above top face to eliminate Z-fighting!)
    const trimGeo = new THREE.RingGeometry(5.8, 6.8, 8);
    trimGeo.rotateX(-Math.PI / 2);
    const trimMesh = new THREE.Mesh(trimGeo, this.materials.startPadNeon);
    trimMesh.position.set(0, 0.05, 0);

    // Center chevron ring marker at y = +0.05m
    const markerGeo = new THREE.RingGeometry(1.8, 2.6, 8);
    markerGeo.rotateX(-Math.PI / 2);
    const markerMesh = new THREE.Mesh(markerGeo, this.materials.startPadNeon);
    markerMesh.position.set(0, 0.05, 0);

    const padGroup = new THREE.Group();
    padGroup.add(baseMesh);
    padGroup.add(trimMesh);
    padGroup.add(markerMesh);
    padGroup.userData = { type: 'START_PAD', isGrappleable: true };

    this.scene.add(padGroup);
    this.grappleableMeshes.push(baseMesh);
    this.startPad.meshes.push(padGroup, baseMesh, trimMesh, markerMesh);

    // Physics Collider
    const padBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(7.2, 1.0, 7.2)),
      position: new CANNON.Vec3(0, centerY, 0),
      material: this.physicsWorld?.worldMaterial || undefined,
    });
    padBody.userData = { type: 'START_PAD' };

    this.physicsWorld.addBody(padBody);
    this.startPad.bodies.push(padBody);

    return { padGroup, padBody };
  }

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
    if (this.startPad.edgeLines) {
      this.startPad.edgeLines.geometry.dispose();
      this.startPad.edgeLines.material.dispose();
      this.startPad.edgeLines = null;
    }
    this.startPad.meshes = [];
    this.startPad.bodies = [];
  }

  /**
   * Builds the distant sci-fi megacity: 64 dark megastructures with neon light slits.
   * Rendered using 2 InstancedMesh draw calls (bodies + window slits) for optimal performance.
   * Purely decorative: never added to grappleableMeshes and excluded from raycasts.
   */
  initCityBackground() {
    this.cityGroup = new THREE.Group();
    this.cityTowers = [];

    const rng = mulberry32(7331);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x060913,
      emissive: 0x000d1a,
      emissiveIntensity: 0.06,
      metalness: 0.9,
      roughness: 0.3,
    });
    const slitMat = this.materials.emissiveCyan;
    const baseY = -180;

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.cityTowerMesh = new THREE.InstancedMesh(unitBox, bodyMat, CITY_COUNT);
    this.cityTowerMesh.raycast = NO_RAYCAST;
    this.cityGroup.add(this.cityTowerMesh);

    this.citySlitMesh = new THREE.InstancedMesh(unitBox, slitMat, CITY_COUNT * 2);
    this.citySlitMesh.raycast = NO_RAYCAST;
    this.cityGroup.add(this.citySlitMesh);

    this.cityTowerData = [];
    let slitIdx = 0;

    for (let i = 0; i < CITY_COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (160 + rng() * 220);
      const z0 = (rng() - 0.5) * CITY_SPAN;
      const h = 140 + rng() * 280;
      const w = 24 + rng() * 41;
      const d = 24 + rng() * 41;

      const tower = new THREE.Group();
      tower.position.set(x, baseY, z0);
      this.cityGroup.add(tower);

      const towerSlits = [];
      const slitCount = 1 + Math.floor(rng() * 2);
      for (let s = 0; s < slitCount; s++) {
        const slitW = 1.5 + rng() * 1.5;
        const vertical = rng() < 0.5;
        const slitLen = vertical ? h * (0.55 + rng() * 0.35) : (s === 0 ? d : w) * 0.8;
        const slitY = vertical ? h * 0.5 : h * (0.25 + rng() * 0.6);

        let sw, sh, sd, relX, relY, relZ;
        if (s === 0) {
          sw = 0.6;
          sh = vertical ? slitLen : slitW;
          sd = vertical ? slitW : slitLen;
          relX = -side * (w / 2 + 0.15);
          relY = slitY;
          relZ = 0;
        } else {
          sw = vertical ? slitW : slitLen;
          sh = vertical ? slitLen : slitW;
          sd = 0.6;
          relX = 0;
          relY = slitY;
          relZ = d / 2 + 0.15;
        }

        towerSlits.push({
          slitIdx,
          relX,
          relY,
          relZ,
          w: sw,
          h: sh,
          d: sd,
        });
        slitIdx++;
      }

      this.cityTowerData.push({
        x,
        baseY,
        w,
        h,
        d,
        slits: towerSlits,
      });

      this.cityTowers.push({ group: tower, z0 });
    }

    this.citySlitMesh.count = slitIdx;

    this.scene.add(this.cityGroup);
    this.updateCityBackground({ x: 0, y: 0, z: 0 });
  }

  /**
   * Wraps every tower into the window [playerZ - 650, playerZ + 250] so the skyline is endless.
   * Updates InstancedMesh instance matrices for single-draw-call rendering.
   *
   * @param {{x: number, y: number, z: number}} playerPos
   */
  updateCityBackground(playerPos) {
    if (!this.cityTowers || !playerPos) return;
    const minZ = playerPos.z - CITY_AHEAD;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.cityTowers.length; i++) {
      const t = this.cityTowers[i];
      const rel = (((t.z0 - minZ) % CITY_SPAN) + CITY_SPAN) % CITY_SPAN;
      const targetZ = minZ + rel;
      t.group.position.z = targetZ;

      if (this.cityTowerData && this.cityTowerMesh) {
        const data = this.cityTowerData[i];
        dummy.position.set(data.x, data.baseY + data.h / 2, targetZ);
        dummy.scale.set(data.w, data.h, data.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        this.cityTowerMesh.setMatrixAt(i, dummy.matrix);

        if (this.citySlitMesh && data.slits) {
          for (let s = 0; s < data.slits.length; s++) {
            const slit = data.slits[s];
            dummy.position.set(data.x + slit.relX, data.baseY + slit.relY, targetZ + slit.relZ);
            dummy.scale.set(slit.w, slit.h, slit.d);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            this.citySlitMesh.setMatrixAt(slit.slitIdx, dummy.matrix);
          }
        }
      }
    }

    if (this.cityTowerMesh) this.cityTowerMesh.instanceMatrix.needsUpdate = true;
    if (this.citySlitMesh) this.citySlitMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Spawns the 3D Black Hole Singularity finish gate.
   */
  spawnFinishGate(x, y, z) {
    this.clearFinishGate();

    const radius = 18;
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Event horizon: pitch-black singularity core
    this.bhCore = new THREE.Mesh(
      new THREE.SphereGeometry(7.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false })
    );
    group.add(this.bhCore);

    // Gravitational photon shell
    this.bhHalo = new THREE.Mesh(
      new THREE.SphereGeometry(8.1, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(this.bhHalo);

    // Primary accretion disk with angular brightness variation so its spin reads visually
    const diskGeo = new THREE.RingGeometry(9.5, 19.5, 32, 4);
    const diskPos = diskGeo.attributes.position;
    const diskColors = new Float32Array(diskPos.count * 3);
    for (let i = 0; i < diskPos.count; i++) {
      const vx = diskPos.getX(i);
      const vy = diskPos.getY(i);
      const ang = Math.atan2(vy, vx);
      const rad = Math.hypot(vx, vy);
      const swirl = Math.pow(0.5 + 0.5 * Math.cos(ang * 3.0 + rad * 0.35), 1.5);
      const radial = 1.0 - 0.65 * ((rad - 9.5) / 10.0);
      const b = (0.25 + 0.75 * swirl) * radial;
      diskColors[i * 3] = b;
      diskColors[i * 3 + 1] = b;
      diskColors[i * 3 + 2] = b;
    }
    diskGeo.setAttribute('color', new THREE.BufferAttribute(diskColors, 3));
    this.bhDisk1 = new THREE.Mesh(
      diskGeo,
      new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        vertexColors: true,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.bhDisk1.rotation.set(Math.PI * 0.32, 0.2, 0);
    group.add(this.bhDisk1);

    // Secondary relativistic jet ring
    this.bhDisk2 = new THREE.Mesh(
      new THREE.TorusGeometry(11.5, 0.9, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff0044,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.bhDisk2.rotation.set(-Math.PI * 0.25, 0, Math.PI * 0.4);
    group.add(this.bhDisk2);

    // Swirling vortex particles
    const shardGeo = new THREE.OctahedronGeometry(0.7, 0);
    const shardMats = [0x00f0ff, 0xffffff, 0xff0044].map(
      (c) =>
        new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
    );
    this.bhParticles = [];
    for (let i = 0; i < BLACK_HOLE_COUNT; i++) {
      const mesh = new THREE.Mesh(shardGeo, shardMats[i % shardMats.length]);
      const p = {
        mesh,
        orbitR: 11 + Math.random() * 13,
        angle: Math.random() * Math.PI * 2,
        angVel: (1.2 + Math.random() * 1.6) * (Math.random() < 0.5 ? 1 : -1),
        yOff: (Math.random() - 0.5) * 8,
        wobble: Math.random() * Math.PI * 2,
        vel: new THREE.Vector3(),
      };
      this.placeParticleOnOrbit(p, 1.0, 0);
      group.add(mesh);
      this.bhParticles.push(p);
    }

    this.bhShockwave = null;
    this.bhDetonated = false;
    this.bhFinished = false;
    this.blackHoleGroup = group;
    this.scene.add(group);

    this.finishGate = {
      x,
      y,
      z,
      radius,
      mesh: group,
      exploding: false,
      explodeTimer: 0,
    };

    return this.finishGate;
  }

  placeParticleOnOrbit(p, radiusScale, elapsedTime) {
    const r = p.orbitR * radiusScale;
    p.mesh.position.set(
      Math.cos(p.angle) * r,
      p.yOff * radiusScale + Math.sin(elapsedTime * 1.7 + p.wobble) * 1.2,
      Math.sin(p.angle) * r
    );
  }

  /**
   * Starts the 1.35s gravitational implosion followed by the supernova detonation.
   */
  triggerBlackHoleExplosion() {
    const gate = this.finishGate;
    if (!gate || !gate.mesh || gate.exploding || !this.bhCore) return;

    gate.exploding = true;
    gate.explodeTimer = 0;
    this.bhDetonated = false;
    this.bhFinished = false;

    for (const p of this.bhParticles) {
      const cz = Math.random() * 2 - 1;
      const ca = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - cz * cz);
      const speed = 28 + Math.random() * 37;
      p.vel.set(Math.cos(ca) * s * speed, cz * speed, Math.sin(ca) * s * speed);
    }

    this.bhShockwave = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0xbff8ff,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.bhShockwave.visible = false;
    this.blackHoleGroup.add(this.bhShockwave);
  }

  /**
   * Restores the black hole to its pristine idle state.
   */
  resetBlackHole() {
    const gate = this.finishGate;
    if (!gate || !gate.mesh || !this.bhCore) return;

    gate.exploding = false;
    gate.explodeTimer = 0;
    this.bhDetonated = false;
    this.bhFinished = false;

    this.blackHoleGroup.visible = true;
    for (const m of [this.bhCore, this.bhHalo, this.bhDisk1, this.bhDisk2]) {
      m.visible = true;
      m.scale.setScalar(1);
    }
    this.bhCore.material.color.setHex(0x000000);
    this.bhDisk1.rotation.set(Math.PI * 0.32, 0.2, 0);
    this.bhDisk2.rotation.set(-Math.PI * 0.25, 0, Math.PI * 0.4);

    if (this.bhShockwave) {
      this.blackHoleGroup.remove(this.bhShockwave);
      this.bhShockwave.geometry.dispose();
      this.bhShockwave.material.dispose();
      this.bhShockwave = null;
    }

    for (const p of this.bhParticles) {
      p.mesh.visible = true;
      p.mesh.scale.setScalar(1);
      this.placeParticleOnOrbit(p, 1.0, 0);
    }
  }

  /**
   * Animates the black hole idle spin and the implosion / supernova sequence.
   */
  updateBlackHole(dt, elapsedTime) {
    const gate = this.finishGate;
    if (!gate || !gate.mesh || !this.bhCore) return;

    if (!gate.exploding) {
      this.bhDisk1.rotation.z += dt * 2.8;
      this.bhDisk2.rotation.y -= dt * 3.4;
      this.bhHalo.rotation.y += dt * 1.5;
      const pulse = 1.0 + Math.sin(elapsedTime * 5.0) * 0.05;
      this.bhCore.scale.setScalar(pulse);
      this.bhHalo.scale.setScalar(pulse);
      for (const p of this.bhParticles) {
        p.angle += p.angVel * dt;
        this.placeParticleOnOrbit(p, 1.0, elapsedTime);
        p.mesh.rotation.x += dt * 3.0;
        p.mesh.rotation.y += dt * 2.0;
      }
      return;
    }

    if (this.bhFinished) return;

    gate.explodeTimer += dt;
    const t = gate.explodeTimer;

    if (t >= EXPLODE_END) {
      this.bhFinished = true;
      this.bhCore.visible = false;
      this.bhHalo.visible = false;
      this.bhDisk1.visible = false;
      this.bhDisk2.visible = false;
      if (this.bhShockwave) this.bhShockwave.visible = false;
      for (const p of this.bhParticles) p.mesh.visible = false;
      return;
    }

    if (t < IMPLODE_TIME) {
      const k = t / IMPLODE_TIME;
      const s = 1.0 - (1.0 - 0.08) * k * k;
      this.bhCore.scale.setScalar(s);
      this.bhHalo.scale.setScalar(s);
      this.bhDisk1.scale.setScalar(s);
      this.bhDisk2.scale.setScalar(s);
      this.bhDisk1.rotation.z += dt * 2.8 * 4.0;
      this.bhDisk2.rotation.y -= dt * 3.4 * 4.0;
      this.bhHalo.rotation.y += dt * 1.5 * 4.0;
      const radiusScale = 1.0 - 0.85 * k * k;
      for (const p of this.bhParticles) {
        p.angle += p.angVel * dt * 4.0;
        this.placeParticleOnOrbit(p, radiusScale, elapsedTime);
        p.mesh.rotation.x += dt * 8.0;
      }
      return;
    }

    const u = Math.min(1, (t - IMPLODE_TIME) / (EXPLODE_END - IMPLODE_TIME));

    if (!this.bhDetonated) {
      this.bhDetonated = true;
      this.bhCore.material.color.setHex(0xffffff);
      this.bhHalo.visible = false;
      this.bhDisk1.visible = false;
      this.bhDisk2.visible = false;
      if (this.bhShockwave) this.bhShockwave.visible = true;
    }

    this.bhCore.scale.setScalar(0.08 + 2.2 * Math.sin(Math.min(u * 3.0, 1.0) * Math.PI * 0.5) * (1.0 - u));

    if (this.bhShockwave) {
      const eased = 1.0 - Math.pow(1.0 - u, 3);
      this.bhShockwave.scale.setScalar(1.0 + 44.0 * eased);
      this.bhShockwave.material.opacity = 1.0 - u;
    }

    const shardScale = Math.max(0.0001, 1.6 * (1.0 - u));
    for (const p of this.bhParticles) {
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(shardScale);
      p.mesh.rotation.x += dt * 9.0;
      p.mesh.rotation.y += dt * 6.0;
    }
  }

  clearFinishGate() {
    if (this.blackHoleGroup) {
      this.scene.remove(this.blackHoleGroup);
      this.blackHoleGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.blackHoleGroup = null;
    this.bhCore = null;
    this.bhHalo = null;
    this.bhDisk1 = null;
    this.bhDisk2 = null;
    this.bhParticles = [];
    this.bhShockwave = null;
    this.bhDetonated = false;
    this.bhFinished = false;

    this.finishGate = {
      z: -1000,
      y: 0,
      x: 0,
      radius: 18,
      mesh: null,
      exploding: false,
      explodeTimer: 0,
    };
  }

  // ==========================================================================
  // PROCEDURAL CHUNK ARCHETYPES
  // ==========================================================================

  /**
   * Chunk 1 — The Twin Spires (Cadence Corridor, Length 150m)
   * 2x Buttress Pylons (left/right, ±5° random ry) + Hex Portal (crossbar) + approach strips
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

      const ryLeft = (rng() - 0.5) * 0.174; // ±5°
      const ryRight = (rng() - 0.5) * 0.174; // ±5°

      // Left Buttress Pylon
      this.spawnButtressPylon({
        x: cursor.x - xDist,
        y: y + 2.0,
        z,
        ry: ryLeft,
        chunk,
      });

      // Right Buttress Pylon
      this.spawnButtressPylon({
        x: cursor.x + xDist,
        y: y + 2.0,
        z,
        ry: ryRight,
        chunk,
      });

      // Overhead Hex Portal
      if (i % 2 === 1 || rng() > 0.4) {
        this.spawnHexPortal({
          x: cursor.x,
          y: cursor.y + 26.0,
          z,
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
   * Chunk 2 — The Under-Bridge Dive (Vertical Transfer, Length 160m)
   * 1x Floating Citadel Plate (ceiling) + 2x Inset-Channel Monoliths + Hazard Spike Array (top bar)
   */
  buildChunk2_UnderBridgeDive(cursor, rng, chunk) {
    const chunkLength = 160;
    const bridgeZ = cursor.z - 65.0;

    // 1. Massive ceiling barrier: Floating Citadel Plate
    this.spawnCitadelPlate({
      x: cursor.x,
      y: cursor.y + 36.0,
      z: bridgeZ,
      chunk,
    });

    // 2. Red/Orange Hazard Spike Array across the top
    this.spawnHazardSpikeArray({
      x: cursor.x,
      y: cursor.y + 44.0,
      z: bridgeZ,
      w: 68.0,
      h: 3.5,
      d: 18.0,
      chunk,
    });

    // 3. Central stalactite underside & flanking stalactites
    this.spawnBlock({
      x: cursor.x,
      y: cursor.y + 2.0,
      z: bridgeZ,
      w: 12.0,
      h: 16.0,
      d: 14.0,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x - 14.0,
      y: cursor.y + 4.0,
      z: bridgeZ,
      w: 8.0,
      h: 12.0,
      d: 10.0,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x + 14.0,
      y: cursor.y + 4.0,
      z: bridgeZ,
      w: 8.0,
      h: 12.0,
      d: 10.0,
      chunk,
    });

    // 4. Approach flanking towers (Inset-Channel Monoliths)
    this.spawnBlock({
      x: cursor.x - 30.0,
      y: cursor.y + 12.0,
      z: cursor.z - 28.0,
      w: 10.0,
      h: 48.0,
      d: 12.0,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x + 30.0,
      y: cursor.y + 12.0,
      z: cursor.z - 28.0,
      w: 10.0,
      h: 48.0,
      d: 12.0,
      chunk,
    });

    // 5. High floating recovery platform: Floating Citadel Plate
    this.spawnCitadelPlate({
      x: cursor.x,
      y: cursor.y + 22.0,
      z: cursor.z - 135.0,
      chunk,
    });

    return {
      x: cursor.x,
      y: cursor.y + 10.0,
      z: cursor.z - chunkLength,
    };
  }

  /**
   * Chunk 3 — The Threading Octagon Rings (Precision Momentum, Length 165m)
   * 3x Hex Portals + Anchor horns as Buttress Pylons
   */
  buildChunk3_ThreadingRings(cursor, rng, chunk) {
    const chunkLength = 165;
    const ringSpacing = 55.0;
    const verticalOffsets = [6.0, -8.0, 8.0];

    for (let r = 0; r < 3; r++) {
      const ringZ = cursor.z - (r + 0.5) * ringSpacing;
      const ringY = cursor.y + verticalOffsets[r];
      const ringX = cursor.x + (rng() - 0.5) * 4.0;

      // Hexagonal Portal Ring (players fly through hollow frame)
      this.spawnHexPortal({
        x: ringX,
        y: ringY,
        z: ringZ,
        chunk,
      });

      // Exterior anchor horns as Buttress Pylons
      this.spawnButtressPylon({
        x: ringX - 22.0,
        y: ringY - 10.0,
        z: ringZ,
        ry: 0.15,
        chunk,
      });
      this.spawnButtressPylon({
        x: ringX + 22.0,
        y: ringY - 10.0,
        z: ringZ,
        ry: -0.15,
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
   * Chunk 4 — The Split Canyon & Hazard Pillar (Length 155m)
   * 1x Hazard Spike Array + 4 pairs Inset-Channel Monolith walls + 1x Floating Citadel Plate
   */
  buildChunk4_SplitCanyon(cursor, rng, chunk) {
    const chunkLength = 155;
    const midZ = cursor.z - 75.0;

    // 1. Central Hazard Spike Array
    this.spawnHazardSpikeArray({
      x: cursor.x,
      y: cursor.y + 6.0,
      z: midZ,
      w: 12.0,
      h: 30.0,
      d: 46.0,
      chunk,
    });

    // 2. Angled Outer Canyon Walls
    const wallSegments = 4;
    const wallSpan = 120.0;
    const stepZ = wallSpan / wallSegments;

    for (let w = 0; w < wallSegments; w++) {
      const wz = cursor.z - 18.0 - w * stepZ;
      const progress = w / (wallSegments - 1);
      const flare = Math.sin(progress * Math.PI) * 4.0;
      const leftX = cursor.x - (28.0 - flare);
      const rightX = cursor.x + (28.0 - flare);
      const wallY = cursor.y + 12.0;

      this.spawnBlock({
        x: leftX,
        y: wallY,
        z: wz,
        w: 10.0,
        h: 52.0,
        d: 28.0,
        ry: -0.09 + progress * 0.18,
        chunk,
      });

      this.spawnBlock({
        x: rightX,
        y: wallY,
        z: wz,
        w: 10.0,
        h: 52.0,
        d: 28.0,
        ry: 0.09 - progress * 0.18,
        chunk,
      });
    }

    // 3. High-Speed Overhead Sky Bridge: Floating Citadel Plate
    this.spawnCitadelPlate({
      x: cursor.x,
      y: cursor.y + 32.0,
      z: midZ,
      chunk,
    });

    return {
      x: cursor.x,
      y: cursor.y,
      z: cursor.z - chunkLength,
    };
  }

  /**
   * Chunk 5 — The Sky Stepping Stones (Length 175m)
   * 5x Floating Citadel Plates (stepping stones) + 5x Buttress Pylons (crystal spires)
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

      // Suspended stepping stone: Floating Citadel Plate
      this.spawnCitadelPlate({
        x,
        y,
        z,
        ry: rng() * 0.4,
        chunk,
      });

      // High-altitude Grapple Crystal Spire: Buttress Pylon above stone
      this.spawnButtressPylon({
        x: x + (rng() - 0.5) * 3.0,
        y: y + 10.0,
        z,
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
   * 2x Buttress Pylons (guide pillars) + 2x Inset-Channel Monoliths + 1x Triangular Arch
   */
  buildChunk6_SlingshotFinale(cursor, rng, chunk) {
    const chunkLength = 140;
    const obeliskZ = cursor.z - 65.0;
    const obeliskHeight = 80.0;
    const obeliskWidth = 16.0;

    // Entrance guide pillars: Buttress Pylons
    this.spawnButtressPylon({
      x: cursor.x - 16.0,
      y: cursor.y + 2.0,
      z: cursor.z - 22.0,
      chunk,
    });
    this.spawnButtressPylon({
      x: cursor.x + 16.0,
      y: cursor.y + 2.0,
      z: cursor.z - 22.0,
      chunk,
    });

    // Twin Monumental Slingshot Obelisks at X = ±20m
    this.spawnBlock({
      x: cursor.x - 20.0,
      y: cursor.y + 25.0,
      z: obeliskZ,
      w: obeliskWidth,
      h: obeliskHeight,
      d: obeliskWidth,
      chunk,
    });
    this.spawnBlock({
      x: cursor.x + 20.0,
      y: cursor.y + 25.0,
      z: obeliskZ,
      w: obeliskWidth,
      h: obeliskHeight,
      d: obeliskWidth,
      chunk,
    });

    // Overhead brutalist arch: Triangular Arch
    this.spawnTriArch({
      x: cursor.x,
      y: cursor.y + 45.0,
      z: obeliskZ,
      chunk,
    });

    return {
      x: cursor.x,
      y: cursor.y,
      z: cursor.z - chunkLength,
    };
  }

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

  disposeChunk(chunk) {
    if (!chunk) return;

    const isSharedGeo = (geo) => {
      if (!geo) return false;
      return Object.values(this.prefabGeos).includes(geo);
    };

    for (const mesh of chunk.meshes) {
      this.scene.remove(mesh);
      const gIdx = this.grappleableMeshes.indexOf(mesh);
      if (gIdx !== -1) {
        this.grappleableMeshes.splice(gIdx, 1);
      }
      if (mesh.geometry && !isSharedGeo(mesh.geometry)) {
        mesh.geometry.dispose();
      }
      mesh.traverse((child) => {
        if (child.geometry && !isSharedGeo(child.geometry)) {
          child.geometry.dispose();
        }
      });
    }

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

  clearAllCourseObjects() {
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

  loadCourse(presetId = 1) {
    this.currentPresetId = presetId;
    this.clearAllCourseObjects();

    const courseConfig = CONFIG.COURSES?.[presetId] || CONFIG.COURSES?.[1];
    const isEndless = presetId === 4 || !!courseConfig?.isEndless;

    this.currentSeed = isEndless ? Date.now() : (courseConfig?.seed ?? 1042);
    this.rng = mulberry32(this.currentSeed);

    this.spawnStartPad();

    this.cursor = { x: 0, y: 0, z: -10.0 };
    this.farthestZ = this.cursor.z;

    if (isEndless) {
      const initialChunkCount = CONFIG.LEVEL.ENDLESS_ACTIVE_CHUNKS || 5;
      for (let i = 0; i < initialChunkCount; i++) {
        const randomArchetype = 1 + Math.floor(this.rng() * 6);
        this.spawnChunk(randomArchetype);
      }
      this.finishGate = {
        z: -999999,
        y: 0,
        x: 0,
        radius: 18,
        mesh: null,
        exploding: false,
        explodeTimer: 0,
      };
    } else {
      const chunkSequence = courseConfig?.chunks || [1, 2, 3, 4, 5, 6];
      for (const archetype of chunkSequence) {
        this.spawnChunk(archetype);
      }

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

  updateEndless(playerZ) {
    if (this.currentPresetId !== 4) return;

    if (playerZ < this.farthestZ + 350.0) {
      const nextArchetype = 1 + Math.floor(this.rng() * 6);
      this.spawnChunk(nextArchetype);
    }

    const retainChunks = [];
    for (const chunk of this.activeChunks) {
      if (chunk.endZ > playerZ + 180.0) {
        this.disposeChunk(chunk);
      } else {
        retainChunks.push(chunk);
      }
    }
    this.activeChunks = retainChunks;
  }

  update(dt, playerPosition, time = 0) {
    const playerZ = playerPosition ? playerPosition.z : 0;

    this.updateAbyss(dt, time, playerPosition);

    if (this.currentPresetId === 4) {
      this.updateEndless(playerZ);
    }
  }
}

export default LevelGenerator;
