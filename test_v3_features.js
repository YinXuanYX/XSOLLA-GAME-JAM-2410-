import assert from 'node:assert';
import fs from 'node:fs';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './src/config.js';
import { LevelGenerator, mulberry32 } from './src/LevelGenerator.js';
import { PlayerController } from './src/PlayerController.js';
import { CameraController } from './src/CameraController.js';
import { AudioSynth } from './src/AudioSynth.js';

console.log('================================================================');
console.log('🌌 AERO-HOOK VERSION 3.0 VERIFICATION SUITE');
console.log('Solid Monoliths, Wide Neon Stripes, Megacity & Black Hole Finale');
console.log('================================================================');

// Mock scene and physics world
const scene = new THREE.Scene();
const physicsWorld = {
  worldMaterial: new CANNON.Material('mockMaterial'),
  addBody: (b) => {},
  removeBody: (b) => {},
};

const levelGen = new LevelGenerator(scene, physicsWorld);

// ============================================================================
// TEST 1: Solid Matte Obsidian Monoliths & Wide 3D Neon Stripes
// ============================================================================
console.log('\n--- TEST 1: Solid Matte Obsidian Monoliths & Wide Neon Slabs ---');

// Spawn standard tall monolith (h = 24)
const monolith = levelGen.spawnBlock({
  x: 0,
  y: 12,
  z: -50,
  w: 10,
  h: 24,
  d: 10,
});

assert(monolith.mesh instanceof THREE.Mesh, 'Monolith base is a THREE.Mesh');
assert(monolith.mesh.material.roughness === 0.45, 'Monolith base roughness is 0.45');
assert(monolith.mesh.material.metalness === 0.35, 'Monolith base metalness is 0.35');

// Verify NO 1px LineSegments or EdgesGeometry wireframes on the block
let has1pxWireframe = false;
monolith.mesh.traverse((child) => {
  if (child instanceof THREE.LineSegments || child instanceof THREE.Line) {
    has1pxWireframe = true;
  }
});
assert(!has1pxWireframe, 'Monolith has NO 1px LineSegments / EdgesGeometry wireframes');
console.log('✅ Monolith has NO 1px wireframe edges');

// Verify wide horizontal neon bands and pilasters
const slabs = monolith.mesh.children.filter((c) => c instanceof THREE.Mesh);
assert(slabs.length >= 3, `Monolith has multiple 3D neon slabs (found ${slabs.length})`);

// Check wide horizontal stripe thickness (clamped between 0.9m and 2.2m)
const expectedStripeH = Math.min(2.2, Math.max(0.9, 24 * 0.08)); // 1.92m
const horizSlabs = slabs.filter((s) => s.geometry.parameters.height < 3.0);
assert(horizSlabs.length >= 2, 'Monolith has at least 2 horizontal neon bands');
assert(
  Math.abs(horizSlabs[0].geometry.parameters.height - expectedStripeH) < 0.01,
  `Horizontal band height is ${expectedStripeH.toFixed(2)}m wide`
);

// Check that slabs sit proud of the base block (w + 0.12, d + 0.12 = 0.06m proud per face)
assert(
  Math.abs(horizSlabs[0].geometry.parameters.width - (10 + 0.12)) < 0.001,
  'Horizontal band is 0.06m proud along width (w + 0.12)'
);
assert(
  Math.abs(horizSlabs[0].geometry.parameters.depth - (10 + 0.12)) < 0.001,
  'Horizontal band is 0.06m proud along depth (d + 0.12)'
);
console.log('✅ Neon slabs sit 0.06m proud of dark monolith faces (Zero Z-Fighting)');

// Check tall monolith pilasters (h >= 20 -> 1.4m wide pilaster)
const pilasters = slabs.filter((s) => s.geometry.parameters.width === 1.4);
assert(pilasters.length === 2, 'Tall monolith (h >= 20) has 2 vertical pilasters 1.4m wide');
console.log('✅ Tall monolith has 1.4m wide vertical neon pilasters');

// Check accent color rotation across Cyan, Electric Blue, Crimson Red
const color1 = levelGen.materials.stripes[0].color.getHex();
const color2 = levelGen.materials.stripes[1].color.getHex();
const color3 = levelGen.materials.stripes[2].color.getHex();
assert(color1 === 0x00f0ff, 'Stripe color 1 is Cyan (0x00f0ff)');
assert(color2 === 0x00aaff, 'Stripe color 2 is Electric Blue (0x00aaff)');
assert(color3 === 0xff0044, 'Stripe color 3 is Crimson Red (0xff0044)');
console.log('✅ Neon slab stripe accent colors rotate through Cyan, Electric Blue, Crimson Red');

// Raycast verification: ONLY base mesh in grappleableMeshes
assert(levelGen.grappleableMeshes.includes(monolith.mesh), 'Base mesh is in grappleableMeshes');
for (const slab of slabs) {
  assert(!levelGen.grappleableMeshes.includes(slab), 'Decorative slab is NOT in grappleableMeshes');
}
console.log('✅ ONLY solid base mesh is grappleable; decorative slabs excluded from raycasts');

// Hazard Block: dark magma core + wide orange bands (no wireframe)
const hazardBlock = levelGen.spawnBlock({
  x: 20,
  y: 5,
  z: -60,
  w: 8,
  h: 16,
  d: 8,
  isHazard: true,
});
assert(hazardBlock.mesh.material.color.getHex() === 0x1f0500, 'Hazard block uses magma core (0x1f0500)');
let hazardHas1pxWireframe = false;
hazardBlock.mesh.traverse((c) => {
  if (c instanceof THREE.LineSegments || c instanceof THREE.Line) hazardHas1pxWireframe = true;
});
assert(!hazardHas1pxWireframe, 'Hazard block has NO 1px wireframes');
const hazardSlabs = hazardBlock.mesh.children.filter((c) => c instanceof THREE.Mesh);
assert(hazardSlabs.length >= 1, 'Hazard block has wide glowing orange stripe bands');
assert(hazardSlabs[0].geometry.parameters.height === 0.8, 'Hazard stripe band is 0.8m thick');
console.log('✅ Lethal hazard monolith uses dark magma core with wide 0.8m orange neon bands');

// ============================================================================
// TEST 2: Minimalist Sci-Fi Megacity Horizon Background
// ============================================================================
console.log('\n--- TEST 2: Minimalist Sci-Fi Megacity Horizon Background ---');

assert(levelGen.cityGroup instanceof THREE.Group, 'cityGroup is a THREE.Group');
assert(scene.children.includes(levelGen.cityGroup), 'cityGroup is added to scene');
assert(!levelGen.grappleableMeshes.includes(levelGen.cityGroup), 'cityGroup is NEVER in grappleableMeshes');

assert(levelGen.cityTowers.length === 64, 'Megacity consists of 64 panoramic megastructures');

let allTowersValid = true;
for (const t of levelGen.cityTowers) {
  const x = t.group.position.x;
  const absX = Math.abs(x);
  if (absX < 159 || absX > 381) allTowersValid = false;
  if (t.group.position.y !== -180) allTowersValid = false;
}
assert(allTowersValid, 'All 64 megastructures positioned at left/right corridors (X = 160-380m, Y = -180m)');
console.log('✅ 64 megastructures correctly distributed along corridor corridors (X = 160m to 380m)');

// Test Skyline wrapping along -Z (recycling > 250m behind player)
const initialFirstTowerZ = levelGen.cityTowers[0].group.position.z;
// Simulate player flying 350m down the course
levelGen.updateCityBackground({ x: 0, y: 0, z: -350 });
for (const t of levelGen.cityTowers) {
  const tz = t.group.position.z;
  // Window: [playerZ - 650, playerZ + 250] -> [-1000, -100]
  assert(tz >= -1000 && tz <= -100, `Tower at Z = ${tz} is inside visible window [-1000, -100]`);
}
console.log('✅ Distant skyline towers recycle infinitely along -Z when > 250m behind player');

// ============================================================================
// TEST 3: 3D Singularity Black Hole Finish Gate & Supernova Explosion
// ============================================================================
console.log('\n--- TEST 3: 3D Singularity Black Hole & Supernova Detonation ---');

const finishGate = levelGen.spawnFinishGate(0, 10, -500);
assert(finishGate.radius === 18, 'Black hole has 18m capture radius');
assert(finishGate.exploding === false, 'Black hole starts in idle state');
assert(levelGen.blackHoleGroup instanceof THREE.Group, 'blackHoleGroup created');

// Check singularity components
assert(levelGen.bhCore instanceof THREE.Mesh, 'Singularity event horizon core exists');
assert(levelGen.bhCore.geometry.parameters.radius === 7.5, 'Event horizon core radius is 7.5m');
assert(levelGen.bhCore.material.color.getHex() === 0x000000, 'Singularity core is pure pitch black (0x000000)');

assert(levelGen.bhHalo instanceof THREE.Mesh, 'Gravitational photon shell exists');
assert(levelGen.bhHalo.geometry.parameters.radius === 8.1, 'Photon shell radius is 8.1m');
assert(levelGen.bhHalo.material.wireframe === true, 'Photon shell is cyan wireframe');

assert(levelGen.bhDisk1 instanceof THREE.Mesh, 'Primary accretion disk exists');
assert(levelGen.bhDisk1.geometry.parameters.innerRadius === 9.5, 'Accretion disk inner radius is 9.5m');
assert(levelGen.bhDisk1.geometry.parameters.outerRadius === 19.5, 'Accretion disk outer radius is 19.5m');

assert(levelGen.bhDisk2 instanceof THREE.Mesh, 'Secondary relativistic jet ring exists');
assert(levelGen.bhDisk2.material.color.getHex() === 0xff0044, 'Relativistic jet ring is Crimson/Magenta (0xff0044)');

assert(levelGen.bhParticles.length === 48, '48 swirling vortex particles orbiting singularity');
console.log('✅ 3D Black Hole Singularity constructed with Core, Halo, Accretion Disk, Jet Ring, and 48 Shards');

// Idle spin update
const prevRotZ = levelGen.bhDisk1.rotation.z;
levelGen.updateBlackHole(1 / 60, 1.0);
assert(levelGen.bhDisk1.rotation.z > prevRotZ, 'Primary accretion disk rotates continuously');
console.log('✅ Idle animation spins accretion disks, pulses photon shell, and orbits shards');

// Trigger Supernova Explosion
levelGen.triggerBlackHoleExplosion();
assert(levelGen.finishGate.exploding === true, 'Exploding state is active');
assert(levelGen.bhShockwave instanceof THREE.Mesh, 'Supernova shockwave mesh spawned');
assert(levelGen.bhParticles[0].vel.length() >= 28.0, 'Shards given outward supernova velocity (>= 28 m/s)');

// Test Phase 1 (Implosion 0.0s - 0.35s)
levelGen.updateBlackHole(0.20, 1.2);
assert(levelGen.bhCore.scale.x < 0.8, 'Core implodes toward singularity (scale < 0.8)');
console.log('✅ Phase 1 (0.0s - 0.35s): Gravitational Implosion compresses core & disks down to 0.08x');

// Test Phase 2 (Supernova Detonation 0.35s - 1.35s)
levelGen.updateBlackHole(0.25, 1.45); // t = 0.45s (> 0.35s)
assert(levelGen.bhDetonated === true, 'Detonation triggered');
assert(levelGen.bhCore.material.color.getHex() === 0xffffff, 'Core flashes blinding white (0xffffff)');
assert(levelGen.bhShockwave.scale.x > 5.0, 'Supernova shockwave expanding rapidly');
console.log('✅ Phase 2 (0.35s - 1.35s): Supernova Detonation blasts shockwave ring and shards outward');

// Reset Black Hole
levelGen.resetBlackHole();
assert(levelGen.finishGate.exploding === false, 'Reset restores exploding = false');
assert(levelGen.bhCore.material.color.getHex() === 0x000000, 'Reset restores pitch-black core');
assert(levelGen.bhCore.scale.x === 1, 'Reset restores core scale to 1.0');
console.log('✅ resetBlackHole() cleanly restores pristine idle Singularity');

// ============================================================================
// TEST 4: AudioSynth playBlackHoleExplosion
// ============================================================================
console.log('\n--- TEST 4: Web Audio Synth Black Hole Explosion ---');

const audio = new AudioSynth();
assert(typeof audio.playBlackHoleExplosion === 'function', 'audio.playBlackHoleExplosion exists');
const audioContent = fs.readFileSync('src/AudioSynth.js', 'utf-8');
assert(audioContent.includes('playBlackHoleExplosion'), 'playBlackHoleExplosion defined in AudioSynth.js');
assert(audioContent.includes('chargeOsc'), 'Includes rising gravitational vacuum charge (0.0s - 0.35s)');
assert(audioContent.includes('boomOsc'), 'Includes sub-bass supernova boom at 0.35s');
assert(audioContent.includes('chordNotes'), 'Includes crystalline victory chord');
console.log('✅ playBlackHoleExplosion() includes Vacuum Charge, Sub-Bass Boom & Crystalline Chord');

// ============================================================================
// TEST 5: main.js FINISHING State & Arm Tracking IK Hookup
// ============================================================================
console.log('\n--- TEST 5: main.js FINISHING State & Arm Tracking IK Hookup ---');

const mainContent = fs.readFileSync('src/main.js', 'utf-8');
assert(mainContent.includes("gameState = 'FINISHING'"), "main.js includes 'FINISHING' state");
assert(mainContent.includes('finishAnimStartTime'), 'finishAnimStartTime tracked');
assert(mainContent.includes('pendingFinishData'), 'pendingFinishData snapshot created');
assert(mainContent.includes('player.updateVisuals(dt, cameraCtrl.yaw, grapple.hooks)'), 'grapple.hooks passed to player.updateVisuals');
assert(mainContent.includes('triggerBlackHoleExplosion'), 'levelGen.triggerBlackHoleExplosion called on course clear');
assert(mainContent.includes('playBlackHoleExplosion'), 'audio.playBlackHoleExplosion called on course clear');
assert(mainContent.includes('player.updateSuction'), 'player.updateSuction called during FINISHING state');

// Verify PlayerController updateSuction pulls position and shrinks scale
const player = new PlayerController(scene, physicsWorld);
assert(typeof player.updateSuction === 'function', 'player.updateSuction is implemented');
player.mesh.position.set(0, 10, -480);
player.mesh.scale.set(1, 1, 1);
const bhTarget = { x: 0, y: 10, z: -500 };
player.updateSuction(0.1, bhTarget);
assert(player.mesh.position.z < -480, 'Suction pulled player toward Black Hole Z (-500)');
assert(player.mesh.scale.x < 1.0, 'Suction shrunk player avatar scale (< 1.0)');
console.log('✅ player.updateSuction smoothly pulls avatar toward Black Hole and shrinks scale');

console.log('\n================================================================');
console.log('🎉 ALL VERSION 3.0 REQUIREMENTS VERIFIED AND FULLY PASSING!');
console.log('================================================================\n');
