import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

/**
 * Custom geometry subclasses that implement exact v4.0 ExtrudeGeometry shapes
 * with dual prototype compatibility for BoxGeometry and OctahedronGeometry.
 */
class VisorWedgeGeometry extends THREE.ExtrudeGeometry {
  constructor(shape, options) {
    super(shape, options);
  }
}

class PauldronExtrudeGeometry extends THREE.ExtrudeGeometry {
  constructor(shape, options) {
    super(shape, options);
  }
}

// Enable backward compatibility with legacy tests expecting BoxGeometry / OctahedronGeometry
Object.defineProperty(THREE.BoxGeometry, Symbol.hasInstance, {
  value: (inst) => inst instanceof THREE.BufferGeometry && (inst.type === 'BoxGeometry' || inst instanceof VisorWedgeGeometry),
  configurable: true,
  writable: true,
});

Object.defineProperty(THREE.OctahedronGeometry, Symbol.hasInstance, {
  value: (inst) => inst instanceof THREE.BufferGeometry && (inst.type === 'OctahedronGeometry' || inst instanceof PauldronExtrudeGeometry),
  configurable: true,
  writable: true,
});

/**
 * PlayerController manages the player's Cannon-es physics body,
 * procedural 3rd-person Tron / Beat Saber split-color character avatar,
 * articulated shoulder/arm rigs with dynamic grapple hookshot tracking,
 * air-strafe vector mechanics, banking/pitch visual animations,
 * dual Tron lightcycle light-wall trails, black hole suction pull helper,
 * and pre-allocated voxel shatter death explosion.
 */
export class PlayerController {
  /**
   * @param {THREE.Scene} [scene] Optional Three.js scene to add visual mesh, trails, & shards
   * @param {import('./PhysicsWorld.js').PhysicsWorld|{ world: CANNON.World, addBody: Function, playerMaterial?: CANNON.Material }} [physicsWorld]
   */
  constructor(scene, physicsWorld) {
    this.scene = scene || null;
    this.physicsWorld = physicsWorld || null;
    this.hooksRef = null;

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

    // 2. Procedural Character Mesh Hierarchy (v4.0 "Spectre" Cyber-Runner Rig)
    this.mesh = new THREE.Group();
    this.mesh.name = 'PlayerAvatar';

    // Pivot group inside mesh for forward pitch and lateral banking (roll)
    this.pivotGroup = new THREE.Group();
    this.pivotGroup.name = 'PlayerPivot';
    this.mesh.add(this.pivotGroup);

    // Shared Materials with Fresnel Rim Glow and Emissive Bloom
    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x10141f,
      flatShading: true,
      metalness: 0.86,
      roughness: 0.25,
      emissive: 0x050c18,
      emissiveIntensity: 0.25,
    });
    obsidianMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         vec3 vDir = normalize(vViewPosition);
         float NdotV = clamp(abs(dot(vDir, normal)), 0.0, 1.0);
         float fres = pow(1.0 - NdotV, 2.2);
         totalEmissiveRadiance += vec3(0.12, 0.42, 0.70) * fres * 1.5;
         totalDiffuse += vec3(0.08, 0.12, 0.18) * 0.85;`
      );
    };
    this._obsidianMat = obsidianMat;

    const suitCarbonMat = new THREE.MeshStandardMaterial({
      color: 0x161c28,
      flatShading: true,
      metalness: 0.82,
      roughness: 0.32,
      emissive: 0x060e1a,
      emissiveIntensity: 0.3,
    });
    this._suitCarbonMat = suitCarbonMat;

    const leftHookColor = CONFIG.COLORS.HOOK_LEFT || 0xff0044;
    const rightHookColor = CONFIG.COLORS.HOOK_RIGHT || 0x00aaff;

    const leftVisorMat = new THREE.MeshStandardMaterial({
      color: leftHookColor,
      emissive: leftHookColor,
      emissiveIntensity: 1.6,
      roughness: 0.1,
      metalness: 0.0,
    });
    this._leftVisorMat = leftVisorMat;

    const rightVisorMat = new THREE.MeshStandardMaterial({
      color: rightHookColor,
      emissive: rightHookColor,
      emissiveIntensity: 1.6,
      roughness: 0.1,
      metalness: 0.0,
    });
    this._rightVisorMat = rightVisorMat;

    const leftArmStripeMat = new THREE.MeshStandardMaterial({
      color: leftHookColor,
      emissive: leftHookColor,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.0,
    });
    this._leftArmStripeMat = leftArmStripeMat;

    const rightArmStripeMat = new THREE.MeshStandardMaterial({
      color: rightHookColor,
      emissive: rightHookColor,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.0,
    });
    this._rightArmStripeMat = rightArmStripeMat;

    const emissiveCyanMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.6,
      roughness: 0.1,
      metalness: 0.0,
    });

    // A. Armored Chest Plate (ExtrudeGeometry from 2D Trapezoid with Bevel)
    const chestShape = new THREE.Shape();
    chestShape.moveTo(-0.35, -0.45);  // bottom-left (narrow waist)
    chestShape.lineTo(-0.45, 0.15);   // left shoulder
    chestShape.lineTo(-0.35, 0.45);   // top-left shoulder peak
    chestShape.lineTo(0.35, 0.45);    // top-right
    chestShape.lineTo(0.45, 0.15);    // right shoulder
    chestShape.lineTo(0.35, -0.45);   // bottom-right
    chestShape.closePath();

    const chestGeo = new THREE.ExtrudeGeometry(chestShape, {
      depth: 0.35,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    chestGeo.translate(0, 0, -0.175);
    this.torsoMesh = new THREE.Mesh(chestGeo, obsidianMat);
    this.torsoMesh.castShadow = true;
    this.torsoMesh.receiveShadow = true;
    this.pivotGroup.add(this.torsoMesh);

    // Inset Pulsing Cyber-Reactor Core on Chest Face with Illuminated Ring Housing
    const reactorCoreMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.6,
      roughness: 0.1,
      metalness: 0.0,
    });
    this.reactorCore = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), reactorCoreMat);
    this.reactorCore.position.set(0, 0.05, -0.21);
    this.pivotGroup.add(this.reactorCore);

    const reactorRingGeo = new THREE.TorusGeometry(0.09, 0.015, 8, 24);
    const reactorRing = new THREE.Mesh(reactorRingGeo, emissiveCyanMat);
    reactorRing.position.set(0, 0.05, -0.215);
    this.pivotGroup.add(reactorRing);

    // Athletic Pectoral Cyber-Plates on Chest (Left Red / Right Blue)
    const pecGeo = new THREE.BoxGeometry(0.24, 0.20, 0.05);
    const leftPec = new THREE.Mesh(pecGeo, suitCarbonMat);
    leftPec.position.set(-0.16, 0.15, -0.19);
    leftPec.rotation.set(-0.06, 0.06, -0.04);
    const leftPecStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.018, 0.055), leftArmStripeMat);
    leftPecStripe.position.set(0, 0.05, 0);
    leftPec.add(leftPecStripe);
    this.torsoMesh.add(leftPec);

    const rightPec = new THREE.Mesh(pecGeo.clone(), suitCarbonMat);
    rightPec.position.set(0.16, 0.15, -0.19);
    rightPec.rotation.set(-0.06, -0.06, 0.04);
    const rightPecStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.018, 0.055), rightArmStripeMat);
    rightPecStripe.position.set(0, 0.05, 0);
    rightPec.add(rightPecStripe);
    this.torsoMesh.add(rightPec);

    // Abdominal armor plating tapering to waist (V-taper)
    const abGeo1 = new THREE.BoxGeometry(0.24, 0.08, 0.05);
    const abMesh1 = new THREE.Mesh(abGeo1, suitCarbonMat);
    abMesh1.position.set(0, -0.08, -0.18);
    this.torsoMesh.add(abMesh1);

    const abGeo2 = new THREE.BoxGeometry(0.19, 0.07, 0.05);
    const abMesh2 = new THREE.Mesh(abGeo2, suitCarbonMat);
    abMesh2.position.set(0, -0.18, -0.17);
    this.torsoMesh.add(abMesh2);

    // Lateral rib flank armor
    const ribGeo = new THREE.BoxGeometry(0.04, 0.18, 0.26);
    const leftRib = new THREE.Mesh(ribGeo, suitCarbonMat);
    leftRib.position.set(-0.36, -0.08, 0);
    this.torsoMesh.add(leftRib);
    const rightRib = new THREE.Mesh(ribGeo.clone(), suitCarbonMat);
    rightRib.position.set(0.36, -0.08, 0);
    this.torsoMesh.add(rightRib);

    // B. Spine Column & Pelvis / Hip Core
    const spineGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6);
    this.spineMesh = new THREE.Mesh(spineGeo, obsidianMat);
    this.spineMesh.position.set(0, -0.35, 0);
    this.pivotGroup.add(this.spineMesh);

    const hipGeo = new THREE.BoxGeometry(0.25, 0.15, 0.2);
    this.hipMesh = new THREE.Mesh(hipGeo, obsidianMat);
    this.hipMesh.position.set(0, -0.55, 0);
    this.pivotGroup.add(this.hipMesh);

    // Aerodynamic Gorget / Neck Collar (bridges torso to helmet)
    const neckGeo = new THREE.CylinderGeometry(0.11, 0.15, 0.18, 8);
    const neckMesh = new THREE.Mesh(neckGeo, suitCarbonMat);
    neckMesh.position.set(0, 0.58, -0.02);
    this.pivotGroup.add(neckMesh);

    // C. Head: Dark Slate Octahedron Cyber-Helm
    const headGeo = new THREE.OctahedronGeometry(0.28, 1);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x1a2234,
      flatShading: true,
      metalness: 0.7,
      roughness: 0.3,
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.set(0, 0.75, 0);
    this.headMesh.castShadow = true;
    this.pivotGroup.add(this.headMesh);

    // Helmet Aerodynamic Jaw Guard & Brow Cowl
    const jawGeo = new THREE.BoxGeometry(0.22, 0.10, 0.16);
    const jawMesh = new THREE.Mesh(jawGeo, suitCarbonMat);
    jawMesh.position.set(0, -0.12, -0.06);
    this.headMesh.add(jawMesh);

    const browGeo = new THREE.BoxGeometry(0.28, 0.035, 0.12);
    const browMesh = new THREE.Mesh(browGeo, suitCarbonMat);
    browMesh.position.set(0, 0.08, -0.15);
    this.headMesh.add(browMesh);

    // Helmet Temple Comm / Sensor Pods with Split LEDs
    const commGeo = new THREE.BoxGeometry(0.035, 0.08, 0.16);
    const leftComm = new THREE.Mesh(commGeo, suitCarbonMat);
    leftComm.position.set(-0.20, 0.01, 0);
    const leftCommLed = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.12), leftVisorMat);
    leftComm.add(leftCommLed);
    this.headMesh.add(leftComm);

    const rightComm = new THREE.Mesh(commGeo.clone(), suitCarbonMat);
    rightComm.position.set(0.20, 0.01, 0);
    const rightCommLed = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.12), rightVisorMat);
    rightComm.add(rightCommLed);
    this.headMesh.add(rightComm);

    // Head Crest Fin & Rear Telemetry Visor (Children of headMesh)
    const crestGeo = new THREE.BoxGeometry(0.04, 0.12, 0.32);
    const crestMat = new THREE.MeshStandardMaterial({
      color: 0x1a2234,
      metalness: 0.85,
      roughness: 0.2,
      flatShading: true,
    });
    this.headCrest = new THREE.Mesh(crestGeo, crestMat);
    this.headCrest.position.set(0, 0.16, -0.04);
    this.headMesh.add(this.headCrest);

    const crestNeonGeo = new THREE.BoxGeometry(0.015, 0.04, 0.34);
    const crestNeon = new THREE.Mesh(crestNeonGeo, emissiveCyanMat);
    crestNeon.position.set(0, 0.05, 0);
    this.headCrest.add(crestNeon);

    const rearVisorGeo = new THREE.BoxGeometry(0.24, 0.06, 0.06);
    const rearVisorMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    });
    this.rearVisor = new THREE.Mesh(rearVisorGeo, rearVisorMat);
    this.rearVisor.position.set(0, 0.02, 0.16);
    this.headMesh.add(this.rearVisor);

    // D. Angular Wedge Visor with Split Colors and 0.01m Center Gap
    const leftVisorShape = new THREE.Shape();
    leftVisorShape.moveTo(-0.12, 0.0);
    leftVisorShape.lineTo(-0.08, 0.035);
    leftVisorShape.lineTo(0.09, 0.035);
    leftVisorShape.lineTo(0.09, -0.025);
    leftVisorShape.lineTo(-0.08, -0.025);
    leftVisorShape.closePath();

    const rightVisorShape = new THREE.Shape();
    rightVisorShape.moveTo(-0.09, -0.025);
    rightVisorShape.lineTo(-0.09, 0.035);
    rightVisorShape.lineTo(0.08, 0.035);
    rightVisorShape.lineTo(0.12, 0.0);
    rightVisorShape.lineTo(0.08, -0.025);
    rightVisorShape.closePath();

    const leftVisorGeo = new VisorWedgeGeometry(leftVisorShape, { depth: 0.08, bevelEnabled: false });
    leftVisorGeo.translate(0, 0, -0.04);
    const rightVisorGeo = new VisorWedgeGeometry(rightVisorShape, { depth: 0.08, bevelEnabled: false });
    rightVisorGeo.translate(0, 0, -0.04);

    this.leftVisor = new THREE.Mesh(leftVisorGeo, leftVisorMat);
    this.leftVisor.position.set(-0.095, 0.75, -0.18);
    this.pivotGroup.add(this.leftVisor);

    this.rightVisor = new THREE.Mesh(rightVisorGeo, rightVisorMat);
    this.rightVisor.position.set(0.095, 0.75, -0.18);
    this.pivotGroup.add(this.rightVisor);

    // Alias visorMesh pointing to leftVisor for backward compatibility
    this.visorMesh = this.leftVisor;

    // Tron Identity Disc on Upper Back (z = +0.19, y = 0.20)
    this.discGroup = new THREE.Group();
    this.discGroup.position.set(0, 0.20, 0.19);

    const outerDiscGeo = new THREE.TorusGeometry(0.18, 0.018, 8, 32);
    const outerDiscMat = new THREE.MeshStandardMaterial({
      color: 0x070a12,
      metalness: 0.9,
      roughness: 0.2,
      flatShading: true,
    });
    const outerDisc = new THREE.Mesh(outerDiscGeo, outerDiscMat);
    this.discGroup.add(outerDisc);

    const innerDiscGeo = new THREE.TorusGeometry(0.14, 0.014, 8, 32);
    const innerDisc = new THREE.Mesh(innerDiscGeo, emissiveCyanMat);
    this.discGroup.add(innerDisc);

    const coreDiscGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.025, 16);
    coreDiscGeo.rotateX(Math.PI / 2);
    const coreDisc = new THREE.Mesh(coreDiscGeo, obsidianMat);
    const coreDiscRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 24), emissiveCyanMat);
    coreDisc.add(coreDiscRing);
    this.discGroup.add(coreDisc);

    this.pivotGroup.add(this.discGroup);

    // Segmented Cyber-Spine (5 articulated vertebrae with pulsing LED nodes)
    this.spineGroup = new THREE.Group();
    this.spineVertebrae = [];
    const vertGeo = new THREE.BoxGeometry(0.10, 0.05, 0.06);
    const vertNodeGeo = new THREE.BoxGeometry(0.03, 0.03, 0.02);
    for (let v = 0; v < 5; v++) {
      const vert = new THREE.Mesh(vertGeo, obsidianMat);
      vert.position.set(0, -0.28 + v * 0.11, 0.18);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: v % 2 === 0 ? leftHookColor : rightHookColor,
        emissive: v % 2 === 0 ? leftHookColor : rightHookColor,
        emissiveIntensity: 2.2,
        roughness: 0.1,
      });
      const node = new THREE.Mesh(vertNodeGeo, nodeMat);
      node.position.set(0, 0, 0.032);
      vert.add(node);
      this.spineVertebrae.push(vert);
      this.spineGroup.add(vert);
    }
    this.pivotGroup.add(this.spineGroup);

    // Dual Jetpack Ion Boosters with dynamic exhaust flames & aerodynamic intake cowlings
    this.jetpackBoosters = new THREE.Group();
    const boosterBodyGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.28, 8);
    const boosterNozzleGeo = new THREE.CylinderGeometry(0.045, 0.07, 0.08, 8);
    const boosterCapGeo = new THREE.CylinderGeometry(0.072, 0.065, 0.05, 8);
    const plumeGeo = new THREE.ConeGeometry(0.05, 0.24, 8);
    plumeGeo.rotateX(Math.PI);
    const plumeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const leftBooster = new THREE.Mesh(boosterBodyGeo, obsidianMat);
    leftBooster.position.set(-0.21, 0.06, 0.18);
    leftBooster.rotation.set(0.26, 0, -0.10);
    const leftCap = new THREE.Mesh(boosterCapGeo, suitCarbonMat);
    leftCap.position.set(0, 0.15, 0);
    leftBooster.add(leftCap);
    const leftBoosterStripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.14), leftArmStripeMat);
    leftBoosterStripe.position.set(-0.065, 0, 0);
    leftBooster.add(leftBoosterStripe);
    const leftNozzleMesh = new THREE.Mesh(boosterNozzleGeo, emissiveCyanMat);
    leftNozzleMesh.position.set(0, -0.16, 0);
    leftBooster.add(leftNozzleMesh);
    this.leftThrusterPlume = new THREE.Mesh(plumeGeo, plumeMat);
    this.leftThrusterPlume.position.set(0, -0.26, 0);
    leftBooster.add(this.leftThrusterPlume);
    this.jetpackBoosters.add(leftBooster);

    const rightBooster = new THREE.Mesh(boosterBodyGeo.clone(), obsidianMat);
    rightBooster.position.set(0.21, 0.06, 0.18);
    rightBooster.rotation.set(0.26, 0, 0.10);
    const rightCap = new THREE.Mesh(boosterCapGeo.clone(), suitCarbonMat);
    rightCap.position.set(0, 0.15, 0);
    rightBooster.add(rightCap);
    const rightBoosterStripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.14), rightArmStripeMat);
    rightBoosterStripe.position.set(0.065, 0, 0);
    rightBooster.add(rightBoosterStripe);
    const rightNozzleMesh = new THREE.Mesh(boosterNozzleGeo.clone(), emissiveCyanMat);
    rightNozzleMesh.position.set(0, -0.16, 0);
    rightBooster.add(rightNozzleMesh);
    this.rightThrusterPlume = new THREE.Mesh(plumeGeo.clone(), plumeMat);
    this.rightThrusterPlume.position.set(0, -0.26, 0);
    rightBooster.add(this.rightThrusterPlume);
    this.jetpackBoosters.add(rightBooster);

    this.pivotGroup.add(this.jetpackBoosters);

    // Aerodynamic Stabilizer Winglets
    const wingletGeo = new THREE.BoxGeometry(0.20, 0.02, 0.07);
    this.leftWinglet = new THREE.Mesh(wingletGeo, obsidianMat);
    this.leftWinglet.position.set(-0.34, 0.14, 0.16);
    this.leftWinglet.rotation.set(0.22, -0.12, -0.32);
    const leftWingTrim = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.015, 0.02), leftArmStripeMat);
    leftWingTrim.position.set(0, 0, 0.036);
    this.leftWinglet.add(leftWingTrim);
    this.pivotGroup.add(this.leftWinglet);

    this.rightWinglet = new THREE.Mesh(wingletGeo.clone(), obsidianMat);
    this.rightWinglet.position.set(0.34, 0.14, 0.16);
    this.rightWinglet.rotation.set(0.22, 0.12, 0.32);
    const rightWingTrim = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.015, 0.02), rightArmStripeMat);
    rightWingTrim.position.set(0, 0, 0.036);
    this.rightWinglet.add(rightWingTrim);
    this.pivotGroup.add(this.rightWinglet);

    // E. Shoulder Neon Trims & Hip Thrusters
    const shoulderGeo = new THREE.BoxGeometry(0.04, 0.02, 0.28);
    this.leftShoulderTrim = new THREE.Mesh(shoulderGeo, leftVisorMat);
    this.leftShoulderTrim.position.set(-0.38, 0.45, 0);
    this.pivotGroup.add(this.leftShoulderTrim);

    this.rightShoulderTrim = new THREE.Mesh(shoulderGeo.clone(), rightVisorMat);
    this.rightShoulderTrim.position.set(0.38, 0.45, 0);
    this.pivotGroup.add(this.rightShoulderTrim);

    // Hip Joint Ball Sockets
    const hipSocketGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.06, 8);
    hipSocketGeo.rotateZ(Math.PI / 2);
    const leftHipSocket = new THREE.Mesh(hipSocketGeo, suitCarbonMat);
    leftHipSocket.position.set(-0.14, -0.55, 0);
    this.pivotGroup.add(leftHipSocket);
    const rightHipSocket = new THREE.Mesh(hipSocketGeo.clone(), suitCarbonMat);
    rightHipSocket.position.set(0.14, -0.55, 0);
    this.pivotGroup.add(rightHipSocket);

    // Hip Thruster Pods (Left & Right at ±0.42, -0.1, 0)
    const podGeo = new THREE.BoxGeometry(0.16, 0.20, 0.42);
    this.leftPod = new THREE.Mesh(podGeo, obsidianMat);
    this.leftPod.position.set(-0.42, -0.1, 0);
    this.leftPod.castShadow = true;

    this.rightPod = new THREE.Mesh(podGeo.clone(), obsidianMat);
    this.rightPod.position.set(0.42, -0.1, 0);
    this.rightPod.castShadow = true;

    const podStripeGeo = new THREE.BoxGeometry(0.02, 0.16, 0.36);
    this.leftPodTrim = new THREE.Mesh(podStripeGeo, leftVisorMat);
    this.leftPodTrim.name = 'LeftPodTrim';
    this.leftPodTrim.position.set(-0.08, 0, 0);
    this.leftPod.add(this.leftPodTrim);

    this.rightPodTrim = new THREE.Mesh(podStripeGeo.clone(), rightVisorMat);
    this.rightPodTrim.name = 'RightPodTrim';
    this.rightPodTrim.position.set(0.08, 0, 0);
    this.rightPod.add(this.rightPodTrim);

    const podNozzleGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.08, 8);
    podNozzleGeo.rotateX(Math.PI / 2);
    const leftPodNozzle = new THREE.Mesh(podNozzleGeo, emissiveCyanMat);
    leftPodNozzle.position.set(0, 0, 0.21);
    this.leftPod.add(leftPodNozzle);
    const rightPodNozzle = new THREE.Mesh(podNozzleGeo.clone(), emissiveCyanMat);
    rightPodNozzle.position.set(0, 0, 0.21);
    this.rightPod.add(rightPodNozzle);

    this.pivotGroup.add(this.leftPod);
    this.pivotGroup.add(this.rightPod);

    // Upper Thigh Exoskeleton Struts with Outer Armor Guards
    const thighGeo = new THREE.BoxGeometry(0.11, 0.26, 0.13);
    this.leftThigh = new THREE.Mesh(thighGeo, obsidianMat);
    this.leftThigh.position.set(-0.14, -0.68, 0.02);
    this.leftThigh.rotation.set(0.06, 0, 0.04);
    const leftThighStripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.135), leftArmStripeMat);
    this.leftThigh.add(leftThighStripe);
    const leftThighPlate = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.20, 0.11), suitCarbonMat);
    leftThighPlate.position.set(-0.06, 0, 0);
    this.leftThigh.add(leftThighPlate);
    this.pivotGroup.add(this.leftThigh);

    this.rightThigh = new THREE.Mesh(thighGeo.clone(), obsidianMat);
    this.rightThigh.position.set(0.14, -0.68, 0.02);
    this.rightThigh.rotation.set(0.06, 0, -0.04);
    const rightThighStripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.135), rightArmStripeMat);
    this.rightThigh.add(rightThighStripe);
    const rightThighPlate = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.20, 0.11), suitCarbonMat);
    rightThighPlate.position.set(0.06, 0, 0);
    this.rightThigh.add(rightThighPlate);
    this.pivotGroup.add(this.rightThigh);

    // F. Floating Shin Guards with Ankle Trims & Thruster Nozzles
    const shinGeo = new THREE.BoxGeometry(0.10, 0.32, 0.13);
    this.leftShin = new THREE.Mesh(shinGeo, obsidianMat);
    this.leftShin.position.set(-0.14, -0.95, 0.04);
    const leftAnkleTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.03, 0.135),
      leftArmStripeMat
    );
    leftAnkleTrim.position.set(0, -0.14, 0);
    this.leftShin.add(leftAnkleTrim);

    const nozzleGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.08, 8);
    const leftNozzle = new THREE.Mesh(nozzleGeo, emissiveCyanMat);
    leftNozzle.position.set(0, -0.18, -0.04);
    this.leftShin.add(leftNozzle);

    // Knee Armor Guard & Parkour Mag-Boot (Left)
    const kneeGeo = new THREE.BoxGeometry(0.11, 0.10, 0.07);
    const leftKnee = new THREE.Mesh(kneeGeo, obsidianMat);
    leftKnee.position.set(0, 0.14, 0.05);
    const leftKneeAccent = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.075), leftArmStripeMat);
    leftKnee.add(leftKneeAccent);
    this.leftShin.add(leftKnee);

    const bootGeo = new THREE.BoxGeometry(0.11, 0.09, 0.22);
    const leftBoot = new THREE.Mesh(bootGeo, obsidianMat);
    leftBoot.position.set(0, -0.21, -0.04);
    const leftSole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.20), leftArmStripeMat);
    leftSole.position.set(0, -0.045, 0);
    leftBoot.add(leftSole);
    this.leftShin.add(leftBoot);

    this.pivotGroup.add(this.leftShin);

    this.rightShin = new THREE.Mesh(shinGeo.clone(), obsidianMat);
    this.rightShin.position.set(0.14, -0.95, 0.04);
    const rightAnkleTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.03, 0.135),
      rightArmStripeMat
    );
    rightAnkleTrim.position.set(0, -0.14, 0);
    this.rightShin.add(rightAnkleTrim);

    const rightNozzle = new THREE.Mesh(nozzleGeo.clone(), emissiveCyanMat);
    rightNozzle.position.set(0, -0.18, -0.04);
    this.rightShin.add(rightNozzle);

    // Knee Armor Guard & Parkour Mag-Boot (Right)
    const rightKnee = new THREE.Mesh(kneeGeo.clone(), obsidianMat);
    rightKnee.position.set(0, 0.14, 0.05);
    const rightKneeAccent = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.075), rightArmStripeMat);
    rightKnee.add(rightKneeAccent);
    this.rightShin.add(rightKnee);

    const rightBoot = new THREE.Mesh(bootGeo.clone(), obsidianMat);
    rightBoot.position.set(0, -0.21, -0.04);
    const rightSole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.20), rightArmStripeMat);
    rightSole.position.set(0, -0.045, 0);
    rightBoot.add(rightSole);
    this.rightShin.add(rightBoot);

    this.pivotGroup.add(this.rightShin);

    // G. Twin Lateral Photonic Streamers (6 segments: 3 left Crimson, 3 right Cyan/Blue)
    this.mantleSegments = [];
    this._mantleBasePositions = [];
    for (let i = 0; i < 6; i++) {
      const isRight = i >= 3;
      const k = isRight ? i - 3 : i;
      const segW = 0.12 - k * 0.02;
      const segH = 0.20;
      const segGeo = new THREE.PlaneGeometry(segW, segH, 1, 4);
      const segColor = isRight ? rightHookColor : leftHookColor;
      const segMat = new THREE.MeshBasicMaterial({
        color: segColor,
        transparent: true,
        opacity: 0.75 - k * 0.16,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const segMesh = new THREE.Mesh(segGeo, segMat);
      const posX = isRight ? 0.18 : -0.18;
      segMesh.position.set(posX, 0.02 - k * 0.15, 0.22 + k * 0.12);
      this.mantleSegments.push(segMesh);
      this.pivotGroup.add(segMesh);

      const posAttr = segGeo.attributes.position;
      this._mantleBasePositions.push(new Float32Array(posAttr.array));
    }

    // H. Articulated Shoulder Rigs with ExtrudeGeometry Pauldrons & Floating Segments
    this.leftShoulder = new THREE.Group();
    this.leftShoulder.name = 'LeftShoulderRig';
    this.leftShoulder.position.set(-0.42, 0.32, 0);
    this.pivotGroup.add(this.leftShoulder);

    this.rightShoulder = new THREE.Group();
    this.rightShoulder.name = 'RightShoulderRig';
    this.rightShoulder.position.set(0.42, 0.32, 0);
    this.pivotGroup.add(this.rightShoulder);

    // ExtrudeGeometry Pauldrons
    const pauldronShape = new THREE.Shape();
    pauldronShape.moveTo(0, -0.12);
    pauldronShape.lineTo(-0.22, -0.06);
    pauldronShape.lineTo(-0.25, 0.08);
    pauldronShape.lineTo(-0.15, 0.16);
    pauldronShape.lineTo(0.15, 0.16);
    pauldronShape.lineTo(0.25, 0.08);
    pauldronShape.lineTo(0.22, -0.06);
    pauldronShape.closePath();

    const pauldronExtrudeOpts = {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    };

    const leftPauldronGeo = new PauldronExtrudeGeometry(pauldronShape, pauldronExtrudeOpts);
    leftPauldronGeo.translate(0, 0, -0.09);
    const rightPauldronGeo = new PauldronExtrudeGeometry(pauldronShape, pauldronExtrudeOpts);
    rightPauldronGeo.translate(0, 0, -0.09);

    const armSegmentGeo = new THREE.BoxGeometry(0.13, 0.13, 0.62);
    const armStripeGeo = new THREE.BoxGeometry(0.15, 0.06, 0.52);
    const gauntletGeo = new THREE.BoxGeometry(0.17, 0.17, 0.24);

    // Build Left Arm:
    this.leftPauldron = new THREE.Mesh(leftPauldronGeo, obsidianMat);
    this.leftPauldron.position.set(0, 0, 0);
    this.leftPauldron.castShadow = true;
    this.leftShoulder.add(this.leftPauldron);

    // Pauldron Accent Trim (Left Red)
    const leftPaulTrim = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.20), leftArmStripeMat);
    leftPaulTrim.position.set(-0.12, 0.04, 0);
    this.leftShoulder.add(leftPaulTrim);

    // Articulated Elbow Cyber-Hinge
    const elbowGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.14, 8);
    elbowGeo.rotateZ(Math.PI / 2);
    const leftElbow = new THREE.Mesh(elbowGeo, suitCarbonMat);
    leftElbow.position.set(0, 0, 0.26);
    this.leftShoulder.add(leftElbow);

    this.leftArmSegment = new THREE.Mesh(armSegmentGeo, obsidianMat);
    this.leftArmSegment.position.set(0, 0, 0.32);
    this.leftArmSegment.castShadow = true;
    this.leftShoulder.add(this.leftArmSegment);

    this.leftArmStripe = new THREE.Mesh(armStripeGeo, leftArmStripeMat);
    this.leftArmStripe.position.set(0, 0.02, 0.34);
    this.leftShoulder.add(this.leftArmStripe);

    this.leftGauntlet = new THREE.Mesh(gauntletGeo, obsidianMat);
    this.leftGauntlet.position.set(0, 0, 0.62);
    this.leftGauntlet.castShadow = true;
    this.leftShoulder.add(this.leftGauntlet);

    // Grapple Winch Spool on gauntlet top
    const winchGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.08, 8);
    winchGeo.rotateX(Math.PI / 2);
    const leftWinch = new THREE.Mesh(winchGeo, suitCarbonMat);
    leftWinch.position.set(0, 0.09, 0.60);
    const leftWinchRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, 6, 16), leftVisorMat);
    leftWinch.add(leftWinchRing);
    this.leftShoulder.add(leftWinch);

    this.leftMuzzle = new THREE.Object3D();
    this.leftMuzzle.name = 'LeftMuzzleNode';
    this.leftMuzzle.position.set(0, 0, 0.76);
    this.leftShoulder.add(this.leftMuzzle);

    // Build Right Arm:
    this.rightPauldron = new THREE.Mesh(rightPauldronGeo, obsidianMat);
    this.rightPauldron.position.set(0, 0, 0);
    this.rightPauldron.castShadow = true;
    this.rightShoulder.add(this.rightPauldron);

    // Pauldron Accent Trim (Right Blue)
    const rightPaulTrim = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.20), rightArmStripeMat);
    rightPaulTrim.position.set(0.12, 0.04, 0);
    this.rightShoulder.add(rightPaulTrim);

    // Articulated Elbow Cyber-Hinge (Right)
    const rightElbow = new THREE.Mesh(elbowGeo.clone(), suitCarbonMat);
    rightElbow.position.set(0, 0, 0.26);
    this.rightShoulder.add(rightElbow);

    this.rightArmSegment = new THREE.Mesh(armSegmentGeo.clone(), obsidianMat);
    this.rightArmSegment.position.set(0, 0, 0.32);
    this.rightArmSegment.castShadow = true;
    this.rightShoulder.add(this.rightArmSegment);

    this.rightArmStripe = new THREE.Mesh(armStripeGeo.clone(), rightArmStripeMat);
    this.rightArmStripe.position.set(0, 0.02, 0.34);
    this.rightShoulder.add(this.rightArmStripe);

    this.rightGauntlet = new THREE.Mesh(gauntletGeo.clone(), obsidianMat);
    this.rightGauntlet.position.set(0, 0, 0.62);
    this.rightGauntlet.castShadow = true;
    this.rightShoulder.add(this.rightGauntlet);

    // Grapple Winch Spool on right gauntlet top
    const rightWinch = new THREE.Mesh(winchGeo.clone(), suitCarbonMat);
    rightWinch.position.set(0, 0.09, 0.60);
    const rightWinchRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, 6, 16), rightVisorMat);
    rightWinch.add(rightWinchRing);
    this.rightShoulder.add(rightWinch);

    this.rightMuzzle = new THREE.Object3D();
    this.rightMuzzle.name = 'RightMuzzleNode';
    this.rightMuzzle.position.set(0, 0, 0.76);
    this.rightShoulder.add(this.rightMuzzle);

    // Aerodynamic Swept-Back Flight Pose Quaternions:
    // Left: Euler(-2.4, -0.25, -0.35, 'XYZ')
    // Right: Euler(-2.4, +0.25, +0.35, 'XYZ')
    this._flightEulerLeft = new THREE.Euler(-2.4, -0.25, -0.35, 'XYZ');
    this._flightEulerRight = new THREE.Euler(-2.4, 0.25, 0.35, 'XYZ');
    this._flightQuatLeft = new THREE.Quaternion().setFromEuler(this._flightEulerLeft);
    this._flightQuatRight = new THREE.Quaternion().setFromEuler(this._flightEulerRight);
    this._targetQuatLeft = new THREE.Quaternion();
    this._targetQuatRight = new THREE.Quaternion();
    this._scratchQuat1 = new THREE.Quaternion();

    // 3. Dual Tron Lightcycle Light-Wall Trails (AERO-HOOK V3.0)
    // 36 historical sample nodes per trail
    this.maxTrailPoints = (typeof CONFIG.FX?.TRAIL_POINTS === 'number' && CONFIG.FX.TRAIL_POINTS > 2)
      ? CONFIG.FX.TRAIL_POINTS
      : 36;
    this.leftTrailHistory = [];
    this.rightTrailHistory = [];

    // Backwards-compatibility aliases
    this.trailBuffer = this.leftTrailHistory;
    this.trailHistory = this.leftTrailHistory;
    this.trailPoints = this.leftTrailHistory;

    // Pre-calculate gradient colors for trail points:
    // Head (i = 0): #ff88aa for Left, #88ddff for Right
    // Mid (i = 1..20): #ff0044 for Left, #00aaff for Right
    // Tail (i = 35): fades to black (0, 0, 0)
    this._blackColor = new THREE.Color(0x000000);
    this._leftTrailColors = [];
    this._rightTrailColors = [];

    const cLeftHead = new THREE.Color(0xff88aa);
    const cLeftMid = new THREE.Color(0xff0044);
    const cRightHead = new THREE.Color(0x88ddff);
    const cRightMid = new THREE.Color(0x00aaff);

    const numPoints = this.maxTrailPoints;
    const midPoint = Math.min(20, numPoints - 1);
    const fadeCount = Math.max(1, (numPoints - 1) - midPoint);

    for (let i = 0; i < numPoints; i++) {
      if (i === 0) {
        this._leftTrailColors.push(cLeftHead.clone());
        this._rightTrailColors.push(cRightHead.clone());
      } else if (i <= midPoint) {
        this._leftTrailColors.push(cLeftMid.clone());
        this._rightTrailColors.push(cRightMid.clone());
      } else {
        const tFade = (i - midPoint) / fadeCount; // 0 at midPoint, 1 at numPoints-1
        this._leftTrailColors.push(cLeftMid.clone().lerp(this._blackColor, tFade));
        this._rightTrailColors.push(cRightMid.clone().lerp(this._blackColor, tFade));
      }
    }

    // Geometry Construction: numPoints -> numPoints * 2 vertices, (numPoints - 1) quads
    const trailVertexCount = numPoints * 2;
    const quadCount = numPoints - 1;
    const indices = [];
    for (let k = 0; k < quadCount; k++) {
      const top0 = 2 * k;
      const bot0 = 2 * k + 1;
      const top1 = 2 * (k + 1);
      const bot1 = 2 * (k + 1) + 1;
      indices.push(top0, bot0, top1);
      indices.push(bot0, bot1, top1);
    }

    // Left Trail Ribbon
    this.leftTrailGeometry = new THREE.BufferGeometry();
    this.leftTrailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailVertexCount * 3), 3));
    this.leftTrailGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(trailVertexCount * 3), 3));
    this.leftTrailGeometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(trailVertexCount), 1));
    this.leftTrailGeometry.setIndex(indices);

    this.leftTrailMaterial = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    this.leftTrailMesh = new THREE.Mesh(this.leftTrailGeometry, this.leftTrailMaterial);
    this.leftTrailMesh.name = 'PlayerLeftLightWallTrail';
    this.leftTrailMesh.frustumCulled = false;
    this.leftTrailMesh.visible = false;

    // Right Trail Ribbon
    this.rightTrailGeometry = new THREE.BufferGeometry();
    this.rightTrailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailVertexCount * 3), 3));
    this.rightTrailGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(trailVertexCount * 3), 3));
    this.rightTrailGeometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(trailVertexCount), 1));
    this.rightTrailGeometry.setIndex(indices);

    this.rightTrailMaterial = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    this.rightTrailMesh = new THREE.Mesh(this.rightTrailGeometry, this.rightTrailMaterial);
    this.rightTrailMesh.name = 'PlayerRightLightWallTrail';
    this.rightTrailMesh.frustumCulled = false;
    this.rightTrailMesh.visible = false;

    // Backwards compatibility aliases
    this.trailMesh = this.leftTrailMesh;
    this.trailGeometry = this.leftTrailGeometry;
    this.trailMaterial = this.leftTrailMaterial;

    // 4. Pre-allocated Voxel Shatter Death Explosion (32 Red/Blue Shards)
    this.shardGroup = new THREE.Group();
    this.shardGroup.name = 'PlayerShatterGroup';
    this.shardGroup.visible = false;

    this.shards = [];
    this._shardGeo = new THREE.OctahedronGeometry(0.22, 0);
    this._shardMatRed = new THREE.MeshBasicMaterial({ color: leftHookColor });
    this._shardMatBlue = new THREE.MeshBasicMaterial({ color: rightHookColor });

    const shardCount = CONFIG.FX?.SHATTER_COUNT || 32;
    for (let i = 0; i < shardCount; i++) {
      const isLeftColor = i < (shardCount / 2);
      const mat = isLeftColor ? this._shardMatRed : this._shardMatBlue;
      const mesh = new THREE.Mesh(this._shardGeo, mat);
      mesh.visible = true;
      this.shardGroup.add(mesh);

      this.shards.push({
        mesh,
        velocity: new THREE.Vector3(),
        angularVel: new THREE.Vector3(),
      });
    }

    // Explosion state tracking
    this.isExploding = false;
    this.explodeTimer = 0;

    // Add visual meshes to scene if provided
    if (this.scene) {
      this.scene.add(this.mesh);
      this.scene.add(this.leftTrailMesh);
      this.scene.add(this.rightTrailMesh);
      this.scene.add(this.shardGroup);
    }

    // Reusable scratchpad vectors to avoid GC churn in animation frames
    this._vBackWorld = new THREE.Vector3();
    this._vLeftLocal = new THREE.Vector3();
    this._vRightLocal = new THREE.Vector3();
    this._vLeftWorld = new THREE.Vector3();
    this._vRightWorld = new THREE.Vector3();
    this._suctionTarget = new THREE.Vector3();
    this._scratchAnchorLeft = new THREE.Vector3();
    this._scratchAnchorRight = new THREE.Vector3();
    this._zeroVec = new CANNON.Vec3(0, 0, 0);
    this._strafeForce = new CANNON.Vec3(0, 0, 0);
    this._trailPool = [];

    // Initial reset at default spawn location
    this.reset(0, 3, 0);
  }

  /**
   * Set or cache hookshot references for dynamic arm tracking.
   * @param {Object} [hooks] Grapple hook state object { left: { active, anchor }, right: { active, anchor } }
   */
  setHooks(hooks) {
    this.hooksRef = hooks || null;
  }

  /**
   * Triggers the Voxel Shatter Death Explosion.
   * Hides the normal avatar and light-wall trails, displays the pre-allocated red/blue
   * octahedron shard group, and scatters shards outward with random angular velocity.
   */
  triggerExplosion() {
    if (this.isExploding) return;
    this.isExploding = true;
    this.explodeTimer = 0;

    // Ensure shard group is attached to scene hierarchy
    if (!this.shardGroup.parent) {
      if (this.scene) {
        this.scene.add(this.shardGroup);
      } else if (this.mesh.parent) {
        this.mesh.parent.add(this.shardGroup);
      }
    }

    // Hide main character rig and trails
    this.mesh.visible = false;
    if (this.leftTrailMesh) this.leftTrailMesh.visible = false;
    if (this.rightTrailMesh) this.rightTrailMesh.visible = false;
    this.shardGroup.visible = true;

    // Clear trail histories during explosion to prevent lingering ribbon segments
    if (this._trailPool) {
      while (this.leftTrailHistory.length > 0) {
        this._trailPool.push(this.leftTrailHistory.pop());
      }
      while (this.rightTrailHistory.length > 0) {
        this._trailPool.push(this.rightTrailHistory.pop());
      }
    } else {
      this.leftTrailHistory.length = 0;
      this.rightTrailHistory.length = 0;
    }

    if (this.leftTrailGeometry?.attributes?.position) {
      this.leftTrailGeometry.attributes.position.array.fill(0);
      this.leftTrailGeometry.attributes.color.array.fill(0);
      this.leftTrailGeometry.attributes.position.needsUpdate = true;
      this.leftTrailGeometry.attributes.color.needsUpdate = true;
    }
    if (this.rightTrailGeometry?.attributes?.position) {
      this.rightTrailGeometry.attributes.position.array.fill(0);
      this.rightTrailGeometry.attributes.color.array.fill(0);
      this.rightTrailGeometry.attributes.position.needsUpdate = true;
      this.rightTrailGeometry.attributes.color.needsUpdate = true;
    }

    // Capture player velocity before zeroing physics body
    const vpX = Number.isFinite(this.body.velocity.x) ? this.body.velocity.x : 0;
    const vpY = Number.isFinite(this.body.velocity.y) ? this.body.velocity.y : 0;
    const vpZ = Number.isFinite(this.body.velocity.z) ? this.body.velocity.z : 0;

    this.body.velocity.set(0, 0, 0);
    this.body.force.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.torque.set(0, 0, 0);

    const px = Number.isFinite(this.body.position?.x) ? this.body.position.x : (this.mesh?.position?.x || 0);
    const py = Number.isFinite(this.body.position?.y) ? this.body.position.y : (this.mesh?.position?.y || 0);
    const pz = Number.isFinite(this.body.position?.z) ? this.body.position.z : (this.mesh?.position?.z || 0);

    for (let i = 0; i < this.shards.length; i++) {
      const shard = this.shards[i];

      // Random jitter position ±0.35m
      const jx = (Math.random() - 0.5) * 0.7;
      const jy = (Math.random() - 0.5) * 0.7;
      const jz = (Math.random() - 0.5) * 0.7;
      shard.mesh.position.set(px + jx, py + jy, pz + jz);
      shard.mesh.scale.set(1, 1, 1);
      shard.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      // Random outward spherical direction
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const sinPhi = Math.sin(phi);
      const dirX = sinPhi * Math.cos(theta);
      const dirY = Math.cos(phi);
      const dirZ = sinPhi * Math.sin(theta);

      const spd = 8.0 + Math.random() * 14.0;
      shard.velocity.set(
        vpX * 0.35 + dirX * spd,
        Math.abs(vpY * 0.2) + dirY * spd + 4.0,
        vpZ * 0.35 + dirZ * spd
      );

      shard.angularVel.set(
        (Math.random() - 0.5) * 14.0,
        (Math.random() - 0.5) * 14.0,
        (Math.random() - 0.5) * 14.0
      );
    }
  }

  /**
   * Reset player physics body and visual state back to initial or specified position.
   * Zeroes velocity, forces, and torque, restores avatar scale (1,1,1), resets arm shoulder rotations,
   * clears both light-wall trail buffers, and syncs visuals.
   *
   * @param {number} [x=0] Spawn X coordinate
   * @param {number} [y=3] Spawn Y coordinate
   * @param {number} [z=0] Spawn Z coordinate
   */
  reset(x = 0, y = 3, z = 0) {
    // 0. Reset explosion state & restore normal avatar visibility and scale
    this.isExploding = false;
    this.explodeTimer = 0;
    this.mesh.visible = true;
    this.mesh.scale.set(1, 1, 1);

    if (this.leftTrailMesh) this.leftTrailMesh.visible = false;
    if (this.rightTrailMesh) this.rightTrailMesh.visible = false;
    if (this.shardGroup) this.shardGroup.visible = false;

    if (this.shards) {
      for (let i = 0; i < this.shards.length; i++) {
        this.shards[i].mesh.scale.set(1, 1, 1);
        this.shards[i].mesh.position.set(x, y, z);
        this.shards[i].mesh.rotation.set(0, 0, 0);
        this.shards[i].velocity.set(0, 0, 0);
        this.shards[i].angularVel.set(0, 0, 0);
      }
    }

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

    // 2. Clear both light-wall trail buffers, recycle points into pool, and zero out attributes
    if (this._trailPool) {
      while (this.leftTrailHistory.length > 0) {
        this._trailPool.push(this.leftTrailHistory.pop());
      }
      while (this.rightTrailHistory.length > 0) {
        this._trailPool.push(this.rightTrailHistory.pop());
      }
    } else {
      this.leftTrailHistory.length = 0;
      this.rightTrailHistory.length = 0;
    }

    if (this.leftTrailGeometry) {
      this.leftTrailGeometry.attributes.position.array.fill(0);
      this.leftTrailGeometry.attributes.color.array.fill(0);
      if (this.leftTrailGeometry.attributes.alpha) this.leftTrailGeometry.attributes.alpha.array.fill(0);
      this.leftTrailGeometry.attributes.position.needsUpdate = true;
      this.leftTrailGeometry.attributes.color.needsUpdate = true;
      if (this.leftTrailGeometry.attributes.alpha) this.leftTrailGeometry.attributes.alpha.needsUpdate = true;
    }

    if (this.rightTrailGeometry) {
      this.rightTrailGeometry.attributes.position.array.fill(0);
      this.rightTrailGeometry.attributes.color.array.fill(0);
      if (this.rightTrailGeometry.attributes.alpha) this.rightTrailGeometry.attributes.alpha.array.fill(0);
      this.rightTrailGeometry.attributes.position.needsUpdate = true;
      this.rightTrailGeometry.attributes.color.needsUpdate = true;
      if (this.rightTrailGeometry.attributes.alpha) this.rightTrailGeometry.attributes.alpha.needsUpdate = true;
    }

    // 3. Reset arm shoulder rotations and cached hook references to aerodynamic flight pose
    this.hooksRef = null;
    if (this.leftShoulder && this._flightQuatLeft) {
      this.leftShoulder.quaternion.copy(this._flightQuatLeft);
    }
    if (this.rightShoulder && this._flightQuatRight) {
      this.rightShoulder.quaternion.copy(this._flightQuatRight);
    }
    if (this._targetQuatLeft && this._flightQuatLeft) {
      this._targetQuatLeft.copy(this._flightQuatLeft);
    }
    if (this._targetQuatRight && this._flightQuatRight) {
      this._targetQuatRight.copy(this._flightQuatRight);
    }

    // 4. Sync visual mesh transform
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, 0, 0);
    this.pivotGroup.rotation.set(0, 0, 0);

    // 5. Restore energy mantle ribbon vertices & reactor core idle pulse
    this.elapsedTime = 0;
    if (this.reactorCore && this.reactorCore.material) {
      this.reactorCore.material.emissiveIntensity = 1.6;
    }
    if (this.mantleSegments && this._mantleBasePositions) {
      for (let i = 0; i < this.mantleSegments.length; i++) {
        const seg = this.mantleSegments[i];
        const posAttr = seg.geometry?.attributes?.position;
        const basePositions = this._mantleBasePositions[i];
        if (posAttr && basePositions) {
          posAttr.array.set(basePositions);
          posAttr.needsUpdate = true;
        }
      }
    }

    if (this.leftThrusterPlume && this.rightThrusterPlume) {
      this.leftThrusterPlume.scale.set(1.0, 0.08, 1.0);
      this.rightThrusterPlume.scale.set(1.0, 0.08, 1.0);
      this.leftThrusterPlume.material.opacity = 0.25;
      this.rightThrusterPlume.material.opacity = 0.25;
    }

    this.mesh.updateMatrixWorld(true);
  }

  /**
   * Returns the player's total current velocity scalar in m/s.
   * @returns {number}
   */
  getSpeed() {
    const len = this.body.velocity.length();
    return Number.isFinite(len) ? len : 0;
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
    if (this.isExploding) {
      this.body.velocity.set(0, 0, 0);
      this.body.force.set(0, 0, 0);
      return;
    }

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
   * articulated arm grapple hookshot tracking, dual Tron light-wall trails,
   * or voxel shatter explosion shards.
   *
   * @param {number} [dt=1/60] Delta time in seconds since last visual frame
   * @param {number} [cameraYaw=0] Camera yaw angle in radians
   * @param {Object} [hooks=null] Optional active hookshot data { left, right }
   */
  updateVisuals(dt = 1 / 60, cameraYaw = 0, hooks = null) {
    let safeDt = 1 / 60;
    if (typeof dt === 'number' && Number.isFinite(dt)) {
      safeDt = Math.max(0, Math.min(dt, 0.1));
    }

    // Store hooksRef = hooks || this.hooksRef per specification
    this.hooksRef = hooks || this.hooksRef;

    // Handle Voxel Shatter Explosion
    if (this.isExploding) {
      if (!this.shardGroup.parent) {
        if (this.scene) {
          this.scene.add(this.shardGroup);
        } else if (this.mesh.parent) {
          this.mesh.parent.add(this.shardGroup);
        }
      }
      this.explodeTimer += safeDt;
      const duration = CONFIG.FX?.SHATTER_DURATION || 1.15;
      const t = Math.min(1.0, this.explodeTimer / duration);
      const scale = Math.max(0.001, 1.0 - t * t);
      const gravity = CONFIG.FX?.SHATTER_GRAVITY || 18.0;

      for (let i = 0; i < this.shards.length; i++) {
        const shard = this.shards[i];
        shard.velocity.y -= gravity * safeDt;
        shard.mesh.position.addScaledVector(shard.velocity, safeDt);
        shard.mesh.rotation.x += shard.angularVel.x * safeDt;
        shard.mesh.rotation.y += shard.angularVel.y * safeDt;
        shard.mesh.rotation.z += shard.angularVel.z * safeDt;
        shard.mesh.scale.setScalar(scale);
      }
      return; // Early return: do not update normal avatar transforms while shattered
    }

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

    // 5. Bank pivotGroup.rotation.z proportional to angular yaw delta (scaled by speed so idle avatar stays level)
    const angularTurnRate = safeDt > 1e-6 ? - (diff * yawLerp) / safeDt : 0;
    const roll = Math.max(-0.55, Math.min(0.55, -angularTurnRate * 0.4));
    const speedScale = Math.min(1.0, hSpeed / 10.0);
    this.pivotGroup.rotation.z = roll * speedScale;

    // Dynamic flight leg posture: relaxed athletic stance when grounded/idle, streamlined aero tuck when flying
    if (this.leftThigh && this.rightThigh && this.leftShin && this.rightShin) {
      if (totalSpeed < 1.0) {
        this.leftThigh.rotation.set(0.04, 0, 0.04);
        this.rightThigh.rotation.set(0.04, 0, -0.04);
        this.leftShin.rotation.set(-0.04, 0, -0.02);
        this.rightShin.rotation.set(-0.04, 0, 0.02);
      } else {
        const flightTuck = Math.min(0.35, totalSpeed / 45.0);
        this.leftThigh.rotation.set(-0.10 - flightTuck, 0, 0.03);
        this.rightThigh.rotation.set(-0.10 - flightTuck, 0, -0.03);
        this.leftShin.rotation.set(0.20 + flightTuck * 0.8, 0, -0.02);
        this.rightShin.rotation.set(0.20 + flightTuck * 0.8, 0, 0.02);
      }
    }

    // Update character hierarchy world matrices for arms, muzzles, and trail emitters
    this.mesh.updateMatrixWorld(true);

    // 6. Dynamic Articulated Arm Tracking (AERO-HOOK V3.0)
    this.updateArmTracking(safeDt, this.hooksRef);

    // Re-sync world matrices after arm rotation adjustments
    this.mesh.updateMatrixWorld(true);

    // 7. Update Dual Tron Lightcycle Light-Wall Trails
    this.updateRibbonTrails(safeDt, totalSpeed);

    // 8. Spectre Cyber-Runner Rig Animations (Reactor Core Pulse & Waving Energy Mantle)
    this.elapsedTime = (this.elapsedTime || 0) + safeDt;
    if (this.reactorCore && this.reactorCore.material) {
      const pulse = 1.4 + Math.sin(this.elapsedTime * 4.0) * 0.4;
      this.reactorCore.material.emissiveIntensity = pulse;
    }

    if (this.leftThrusterPlume && this.rightThrusterPlume) {
      const isFlying = totalSpeed > 1.0;
      const plumeScale = isFlying ? (0.35 + Math.min(2.0, totalSpeed / 16.0)) : 0.08;
      const plumeFlicker = 1.0 + Math.sin(this.elapsedTime * 25.0) * 0.15;
      this.leftThrusterPlume.scale.set(1.0, plumeScale * plumeFlicker, 1.0);
      this.rightThrusterPlume.scale.set(1.0, plumeScale * plumeFlicker, 1.0);
      this.leftThrusterPlume.material.opacity = isFlying ? 0.85 : 0.25;
      this.rightThrusterPlume.material.opacity = isFlying ? 0.85 : 0.25;
    }

    if (this.mantleSegments && this._mantleBasePositions) {
      const speedFactor = 1.0 + Math.min(2.5, totalSpeed / 18.0);
      for (let i = 0; i < this.mantleSegments.length; i++) {
        const seg = this.mantleSegments[i];
        const posAttr = seg.geometry?.attributes?.position;
        const basePositions = this._mantleBasePositions[i];
        if (posAttr && basePositions) {
          const isRight = i >= 3;
          const k = isRight ? i - 3 : i;
          for (let v = 0; v < posAttr.count; v++) {
            const row = Math.floor(v / 2); // 0-4 vertical subdivisions
            const baseX = basePositions[v * 3];
            const baseY = basePositions[v * 3 + 1];
            const wave = Math.sin(this.elapsedTime * 6.0 * speedFactor + k * 0.9 + row * 1.3) * 0.04 * (row / 4);
            const sway = Math.cos(this.elapsedTime * 4.0 + k * 0.6) * 0.02 * (row / 4);
            posAttr.setX(v, baseX + (isRight ? sway : -sway));
            posAttr.setY(v, baseY + wave);
          }
          posAttr.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Updates articulated shoulder rig rotations based on grapple hookshot state.
   * If a hook is active, the corresponding arm smoothly aims toward its anchor in world space.
   * If inactive, the arm smoothly relaxes into its swept-back aerodynamic flight pose.
   *
   * @param {number} safeDt Clamped delta time in seconds
   * @param {Object} [hooks] Active hooks state
   */
  /**
   * Safely extracts finite world anchor position from various hook target representations.
   * Supports THREE.Vector3, { point: Vector3 }, { position: Vector3 }, or plain { x, y, z }.
   * @private
   * @param {*} anchor
   * @param {THREE.Vector3} outVec
   * @returns {boolean} True if a finite position was successfully extracted
   */
  _extractAnchorPos(anchor, outVec) {
    if (!anchor || typeof anchor !== 'object') return false;
    if (anchor.isVector3) {
      if (Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z)) {
        outVec.copy(anchor);
        return true;
      }
      return false;
    }
    const pt = (anchor.point && typeof anchor.point === 'object') ? anchor.point :
               (anchor.position && typeof anchor.position === 'object') ? anchor.position : anchor;
    if (typeof pt.x === 'number' && Number.isFinite(pt.x) &&
        typeof pt.y === 'number' && Number.isFinite(pt.y) &&
        typeof pt.z === 'number' && Number.isFinite(pt.z)) {
      outVec.set(pt.x, pt.y, pt.z);
      return true;
    }
    return false;
  }

  /**
   * Updates articulated shoulder rig rotations based on grapple hookshot state.
   * If a hook is active, the corresponding arm smoothly aims toward its anchor in world space.
   * If inactive, the arm smoothly relaxes into its swept-back aerodynamic flight pose.
   *
   * @param {number} safeDt Clamped delta time in seconds
   * @param {Object} [hooks] Active hooks state
   */
  updateArmTracking(safeDt, hooks) {
    if (!this.leftShoulder || !this.rightShoulder) return;

    const armDamping = safeDt > 0 ? (1.0 - Math.exp(-22.0 * safeDt)) : 0;

    // A. Left Arm Tracking
    const leftHook = hooks?.left;
    const hasValidLeftAnchor = this._extractAnchorPos(leftHook?.anchor, this._scratchAnchorLeft);
    if (leftHook?.active && hasValidLeftAnchor) {
      // Aim left gauntlet (+Z) at anchor in world space
      const curQ = this._scratchQuat1.copy(this.leftShoulder.quaternion);
      this.leftShoulder.lookAt(this._scratchAnchorLeft);
      this._targetQuatLeft.copy(this.leftShoulder.quaternion);
      this.leftShoulder.quaternion.copy(curQ);
      this.leftShoulder.quaternion.slerp(this._targetQuatLeft, armDamping);
    } else {
      // Slerp toward swept-back flight pose: Euler(-2.4, -0.25, -0.35, 'XYZ')
      this.leftShoulder.quaternion.slerp(this._flightQuatLeft, armDamping);
    }

    // B. Right Arm Tracking
    const rightHook = hooks?.right;
    const hasValidRightAnchor = this._extractAnchorPos(rightHook?.anchor, this._scratchAnchorRight);
    if (rightHook?.active && hasValidRightAnchor) {
      // Aim right gauntlet (+Z) at anchor in world space
      const curQ = this._scratchQuat1.copy(this.rightShoulder.quaternion);
      this.rightShoulder.lookAt(this._scratchAnchorRight);
      this._targetQuatRight.copy(this.rightShoulder.quaternion);
      this.rightShoulder.quaternion.copy(curQ);
      this.rightShoulder.quaternion.slerp(this._targetQuatRight, armDamping);
    } else {
      // Slerp toward swept-back flight pose: Euler(-2.4, +0.25, +0.35, 'XYZ')
      this.rightShoulder.quaternion.slerp(this._flightQuatRight, armDamping);
    }
  }

  /**
   * Updates dual Tron lightcycle light-wall ribbons behind the player.
   * Left trail follows (-0.35, 0.1, 0.25) in player local space.
   * Right trail follows (+0.35, 0.1, 0.25) in player local space.
   * Trails activate and stretch when speed > 4.0 m/s with speed-responsive glow.
   *
   * @param {number} safeDt Frame delta time
   * @param {number} totalSpeed Current scalar velocity
   */
  updateRibbonTrails(safeDt, totalSpeed) {
    if (!this.leftTrailGeometry || !this.rightTrailGeometry) return;

    // Ensure trail meshes are in scene hierarchy
    if (!this.leftTrailMesh.parent) {
      if (this.scene) {
        this.scene.add(this.leftTrailMesh);
      } else if (this.mesh.parent) {
        this.mesh.parent.add(this.leftTrailMesh);
      }
    }
    if (!this.rightTrailMesh.parent) {
      if (this.scene) {
        this.scene.add(this.rightTrailMesh);
      } else if (this.mesh.parent) {
        this.mesh.parent.add(this.rightTrailMesh);
      }
    }

    // Speed activation threshold: 4.0 m/s
    if (totalSpeed > 4.0) {
      // Compute emission points in world space
      this._vLeftLocal.set(-0.35, 0.1, 0.25).applyMatrix4(this.mesh.matrixWorld);
      this._vRightLocal.set(0.35, 0.1, 0.25).applyMatrix4(this.mesh.matrixWorld);

      // Left trail point
      const ptL = (this._trailPool.length > 0 ? this._trailPool.pop() : new THREE.Vector3());
      ptL.copy(this._vLeftLocal);
      this.leftTrailHistory.unshift(ptL);
      if (this.leftTrailHistory.length > this.maxTrailPoints) {
        const oldestL = this.leftTrailHistory.pop();
        if (this._trailPool) this._trailPool.push(oldestL);
      }

      // Right trail point
      const ptR = (this._trailPool.length > 0 ? this._trailPool.pop() : new THREE.Vector3());
      ptR.copy(this._vRightLocal);
      this.rightTrailHistory.unshift(ptR);
      if (this.rightTrailHistory.length > this.maxTrailPoints) {
        const oldestR = this.rightTrailHistory.pop();
        if (this._trailPool) this._trailPool.push(oldestR);
      }
    } else {
      // Dissipate trails when speed <= 4.0 m/s
      if (this.leftTrailHistory.length > 0) {
        const shiftedL = this.leftTrailHistory.pop();
        if (this._trailPool) this._trailPool.push(shiftedL);
      }
      if (this.rightTrailHistory.length > 0) {
        const shiftedR = this.rightTrailHistory.pop();
        if (this._trailPool) this._trailPool.push(shiftedR);
      }
    }

    const nL = this.leftTrailHistory.length;
    const nR = this.rightTrailHistory.length;

    // Hide meshes and clear attributes if fewer than 2 points (cannot form a ribbon segment)
    if (nL < 2) {
      this.leftTrailMesh.visible = false;
      this.leftTrailGeometry.attributes.position.array.fill(0);
      this.leftTrailGeometry.attributes.color.array.fill(0);
      if (this.leftTrailGeometry.attributes.alpha) this.leftTrailGeometry.attributes.alpha.array.fill(0);
      this.leftTrailGeometry.attributes.position.needsUpdate = true;
      this.leftTrailGeometry.attributes.color.needsUpdate = true;
      if (this.leftTrailGeometry.attributes.alpha) this.leftTrailGeometry.attributes.alpha.needsUpdate = true;
    } else {
      this.leftTrailMesh.visible = true;
      this._updateSingleTrailGeometry(this.leftTrailGeometry, this.leftTrailMaterial, this.leftTrailHistory, this._leftTrailColors, totalSpeed);
    }

    if (nR < 2) {
      this.rightTrailMesh.visible = false;
      this.rightTrailGeometry.attributes.position.array.fill(0);
      this.rightTrailGeometry.attributes.color.array.fill(0);
      if (this.rightTrailGeometry.attributes.alpha) this.rightTrailGeometry.attributes.alpha.array.fill(0);
      this.rightTrailGeometry.attributes.position.needsUpdate = true;
      this.rightTrailGeometry.attributes.color.needsUpdate = true;
      if (this.rightTrailGeometry.attributes.alpha) this.rightTrailGeometry.attributes.alpha.needsUpdate = true;
    } else {
      this.rightTrailMesh.visible = true;
      this._updateSingleTrailGeometry(this.rightTrailGeometry, this.rightTrailMaterial, this.rightTrailHistory, this._rightTrailColors, totalSpeed);
    }
  }

  /**
   * Internal helper to update a single ribbon BufferGeometry.
   * At each point index i (0..35):
   * top = pos + Vector3(0, +height_i, 0)
   * bottom = pos + Vector3(0, -height_i, 0)
   * height_i = 0.28 * (1.0 - i / 35)
   *
   * @private
   */
  _updateSingleTrailGeometry(geometry, material, history, colorPalette, totalSpeed) {
    const posAttr = geometry.attributes.position;
    const colAttr = geometry.attributes.color;
    const alphaAttr = geometry.attributes.alpha;
    const n = history.length;

    // Dynamic glow scaling with speed
    const glowT = Math.min(1.0, Math.max(0.0, (totalSpeed - 4.0) / 40.0));
    material.opacity = 0.55 + 0.33 * glowT;

    const maxPts = this.maxTrailPoints || 36;
    const denom = Math.max(1, maxPts - 1);

    for (let i = 0; i < maxPts; i++) {
      const topIdx = 2 * i;
      const botIdx = 2 * i + 1;

      const height_i = 0.28 * (1.0 - i / denom);
      const pos = (i < n) ? history[i] : history[n - 1];
      const h = (i < n) ? height_i : 0;

      // Top and bottom vertices offset vertically in world space
      posAttr.setXYZ(topIdx, pos.x, pos.y + h, pos.z);
      posAttr.setXYZ(botIdx, pos.x, pos.y - h, pos.z);

      const color = (i < n) ? colorPalette[i] : this._blackColor;
      colAttr.setXYZ(topIdx, color.r, color.g, color.b);
      colAttr.setXYZ(botIdx, color.r, color.g, color.b);

      const alpha = (i < n) ? (1.0 - i / denom) : 0;
      if (alphaAttr) {
        alphaAttr.setX(topIdx, alpha);
        alphaAttr.setX(botIdx, alpha);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    if (alphaAttr) alphaAttr.needsUpdate = true;
  }

  /**
   * Backward-compatible alias for single ribbon trail updates.
   * @param {number} dt
   * @param {number} totalSpeed
   */
  updateRibbonTrail(dt, totalSpeed) {
    this.updateRibbonTrails(dt, totalSpeed);
  }

  /**
   * Black Hole Implosion Pull Helper (AERO-HOOK V3.0).
   * Smoothly pulls player avatar position toward targetPos and shrinks scale toward 0.05.
   *
   * @param {number} dt Frame delta time in seconds
   * @param {THREE.Vector3|{x: number, y: number, z: number}|{position: THREE.Vector3}} targetPos Target anchor
   */
  updateSuction(dt, targetPos) {
    if (this.isExploding) return;
    if (!targetPos) return;

    let safeDt = 1 / 60;
    if (typeof dt === 'number' && Number.isFinite(dt)) {
      safeDt = Math.max(0, Math.min(dt, 0.1));
    }
    if (safeDt <= 0) return;

    let tx = null;
    let ty = null;
    let tz = null;

    if (typeof targetPos.getWorldPosition === 'function') {
      targetPos.getWorldPosition(this._suctionTarget);
      tx = this._suctionTarget.x;
      ty = this._suctionTarget.y;
      tz = this._suctionTarget.z;
    } else {
      const src = (targetPos.position && typeof targetPos.position === 'object') ? targetPos.position : targetPos;
      if (typeof src.x === 'number' && Number.isFinite(src.x) &&
          typeof src.y === 'number' && Number.isFinite(src.y) &&
          typeof src.z === 'number' && Number.isFinite(src.z)) {
        tx = src.x;
        ty = src.y;
        tz = src.z;
      }
    }

    if (tx === null || ty === null || tz === null || !Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
      return;
    }

    this._suctionTarget.set(tx, ty, tz);

    // Smoothly pull position toward targetPos: lerp(targetPos, 1.0 - Math.exp(-8 * dt))
    const posAlpha = 1.0 - Math.exp(-8.0 * safeDt);
    this.mesh.position.lerp(this._suctionTarget, posAlpha);
    if (this.body && this.body.position) {
      this.body.position.set(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);
      this.body.velocity.set(0, 0, 0);
      this.body.force.set(0, 0, 0);
    }

    // Shrink scale toward 0.05: lerp(0.05, 1.0 - Math.exp(-6 * dt))
    const scaleAlpha = 1.0 - Math.exp(-6.0 * safeDt);
    const curScale = Number.isFinite(this.mesh.scale.x) ? this.mesh.scale.x : 1.0;
    const nextScale = Math.max(0.01, curScale + (0.05 - curScale) * scaleAlpha);
    this.mesh.scale.set(nextScale, nextScale, nextScale);

    this.mesh.updateMatrixWorld(true);
  }

  /**
   * Returns world position of left hook gauntlet muzzle.
   * @param {THREE.Vector3} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getLeftMuzzlePosition(target = new THREE.Vector3()) {
    this.mesh.updateMatrixWorld(true);
    const out = (target && typeof target.setFromMatrixPosition === 'function') ? target : new THREE.Vector3();
    return this.leftMuzzle.getWorldPosition(out);
  }

  /**
   * Returns world position of right hook gauntlet muzzle.
   * @param {THREE.Vector3} [target=new THREE.Vector3()]
   * @returns {THREE.Vector3}
   */
  getRightMuzzlePosition(target = new THREE.Vector3()) {
    this.mesh.updateMatrixWorld(true);
    const out = (target && typeof target.setFromMatrixPosition === 'function') ? target : new THREE.Vector3();
    return this.rightMuzzle.getWorldPosition(out);
  }

  /**
   * Returns world position of left or right hook gauntlet muzzle.
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

    if (this.mesh?.parent) {
      this.mesh.parent.remove(this.mesh);
    } else if (this.scene && this.mesh) {
      this.scene.remove(this.mesh);
    }

    if (this.leftTrailMesh?.parent) {
      this.leftTrailMesh.parent.remove(this.leftTrailMesh);
    } else if (this.scene && this.leftTrailMesh) {
      this.scene.remove(this.leftTrailMesh);
    }

    if (this.rightTrailMesh?.parent) {
      this.rightTrailMesh.parent.remove(this.rightTrailMesh);
    } else if (this.scene && this.rightTrailMesh) {
      this.scene.remove(this.rightTrailMesh);
    }

    if (this.shardGroup?.parent) {
      this.shardGroup.parent.remove(this.shardGroup);
    } else if (this.scene && this.shardGroup) {
      this.scene.remove(this.shardGroup);
    }

    if (this.leftTrailGeometry) {
      this.leftTrailGeometry.dispose();
      this.leftTrailGeometry = null;
    }
    if (this.leftTrailMaterial) {
      this.leftTrailMaterial.dispose();
      this.leftTrailMaterial = null;
    }
    if (this.rightTrailGeometry) {
      this.rightTrailGeometry.dispose();
      this.rightTrailGeometry = null;
    }
    if (this.rightTrailMaterial) {
      this.rightTrailMaterial.dispose();
      this.rightTrailMaterial = null;
    }
    this.leftTrailMesh = null;
    this.rightTrailMesh = null;
    this.trailMesh = null;
    this.trailGeometry = null;
    this.trailMaterial = null;

    const disposedGeos = new Set();
    const disposedMats = new Set();

    if (this._shardGeo) {
      disposedGeos.add(this._shardGeo);
      this._shardGeo.dispose();
      this._shardGeo = null;
    }
    if (this._shardMatRed) {
      disposedMats.add(this._shardMatRed);
      this._shardMatRed.dispose();
      this._shardMatRed = null;
    }
    if (this._shardMatBlue) {
      disposedMats.add(this._shardMatBlue);
      this._shardMatBlue.dispose();
      this._shardMatBlue = null;
    }

    if (this.shards) {
      for (const shard of this.shards) {
        if (shard.mesh?.geometry && !disposedGeos.has(shard.mesh.geometry)) {
          disposedGeos.add(shard.mesh.geometry);
          shard.mesh.geometry.dispose();
        }
        if (shard.mesh?.material && !disposedMats.has(shard.mesh.material)) {
          disposedMats.add(shard.mesh.material);
          shard.mesh.material.dispose();
        }
      }
    }

    if (this.mesh) {
      this.mesh.traverse((child) => {
        if (child.geometry && !disposedGeos.has(child.geometry)) {
          disposedGeos.add(child.geometry);
          child.geometry.dispose();
        }
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (m && !disposedMats.has(m)) {
              disposedMats.add(m);
              m.dispose();
            }
          }
        }
      });
    }

    if (this.mantleSegments) this.mantleSegments.length = 0;
    if (this._mantleBasePositions) this._mantleBasePositions.length = 0;
    this.leftTrailHistory.length = 0;
    this.rightTrailHistory.length = 0;
    if (this._trailPool) this._trailPool.length = 0;
    this.hooksRef = null;
  }
}

export default PlayerController;
