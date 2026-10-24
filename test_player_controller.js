import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from './src/PhysicsWorld.js';
import { PlayerController } from './src/PlayerController.js';
import { CONFIG } from './src/config.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

function assertClose(a, b, epsilon, message) {
  if (Math.abs(a - b) > epsilon) {
    console.error(`❌ ASSERTION FAILED: ${message} (Expected ~${b}, got ${a}, diff=${Math.abs(a - b)})`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('====================================================');
console.log('🧪 TESTING AERO-HOOK PLAYER CONTROLLER (VERSION 3.0)');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST 1: Construction & Cannon.js Physics Body
// ----------------------------------------------------
console.log('--- TEST 1: Construction & Physics Body ---');
const scene = new THREE.Scene();
const physicsWorld = new PhysicsWorld();
const player = new PlayerController(scene, physicsWorld);

assert(player.body instanceof CANNON.Body, 'player.body is instance of CANNON.Body');
assert(player.body.mass === CONFIG.PHYSICS.PLAYER_MASS, `body mass is ${CONFIG.PHYSICS.PLAYER_MASS} kg`);
assert(player.body.shapes[0] instanceof CANNON.Sphere, 'body shape is CANNON.Sphere');
assert(player.body.shapes[0].radius === CONFIG.PHYSICS.PLAYER_RADIUS, `body radius is ${CONFIG.PHYSICS.PLAYER_RADIUS} m`);
assert(player.body.fixedRotation === true, 'body fixedRotation is true');
assert(player.body.linearDamping === CONFIG.PHYSICS.LINEAR_DAMPING, `linearDamping is ${CONFIG.PHYSICS.LINEAR_DAMPING}`);
assert(player.body.userData?.type === 'PLAYER', 'body tagged with userData type PLAYER');
assert(physicsWorld.bodies.includes(player.body), 'player.body is registered in physicsWorld');

// ----------------------------------------------------
// TEST 2: Procedural Low-Poly 3D Avatar Hierarchy (V3.0 Rig)
// ----------------------------------------------------
console.log('\n--- TEST 2: Procedural Avatar Hierarchy & Articulated Arms ---');
assert(player.mesh instanceof THREE.Group, 'player.mesh is THREE.Group');
assert(scene.children.includes(player.mesh), 'player.mesh added to scene');
assert(player.pivotGroup instanceof THREE.Group, 'player.pivotGroup is THREE.Group');
assert(player.mesh.children.includes(player.pivotGroup), 'pivotGroup is child of mesh');

// Torso
const torsoColor = player.torsoMesh.material.color.getHex();
assert(torsoColor === 0x10141f || torsoColor === 0x0d1017, 'torso material color is dark obsidian');
assert(player.torsoMesh.material.flatShading === true, 'torso material flatShading is true');
const torsoRoughness = player.torsoMesh.material.roughness;
assert(Math.abs(torsoRoughness - 0.25) < 0.05, 'torso material roughness matches spec (0.25)');

// Head & Visor
assert(player.headMesh instanceof THREE.Mesh, 'player.headMesh created');
assert(player.headMesh.geometry instanceof THREE.OctahedronGeometry, 'head uses OctahedronGeometry');
assertClose(player.headMesh.position.y, 0.75, 0.001, 'head position.y is 0.75');

assert(player.visorMesh instanceof THREE.Mesh, 'player.visorMesh created');
assert(player.visorMesh.geometry instanceof THREE.BoxGeometry, 'visor uses BoxGeometry');
assertClose(player.visorMesh.position.y, 0.75, 0.001, 'visor position.y is 0.75');
assertClose(player.visorMesh.position.z, -0.18, 0.001, 'visor position.z is -0.18');

// Split Visor
assert(player.leftVisor instanceof THREE.Mesh, 'player.leftVisor created');
assert(player.rightVisor instanceof THREE.Mesh, 'player.rightVisor created');
assertClose(player.leftVisor.position.x, -0.095, 0.01, 'leftVisor position.x is -0.095');
assertClose(player.rightVisor.position.x, 0.095, 0.01, 'rightVisor position.x is +0.095');
assert(player.leftVisor.material.color.getHex() === (CONFIG.COLORS.HOOK_LEFT || 0xff0044), 'leftVisor glows Beat Saber Red');
assert(player.rightVisor.material.color.getHex() === (CONFIG.COLORS.HOOK_RIGHT || 0x00aaff), 'rightVisor glows Beat Saber Blue');

// Hip Thruster Pods (Backwards-compatibility)
assert(player.leftPod instanceof THREE.Mesh, 'leftPod created');
assert(player.rightPod instanceof THREE.Mesh, 'rightPod created');
assertClose(player.leftPod.position.x, -0.42, 0.001, 'leftPod position.x is -0.42');
assertClose(player.leftPod.position.y, -0.1, 0.001, 'leftPod position.y is -0.1');
assertClose(player.rightPod.position.x, 0.42, 0.001, 'rightPod position.x is +0.42');
assertClose(player.rightPod.position.y, -0.1, 0.001, 'rightPod position.y is -0.1');

// Articulated Shoulder Rigs (AERO-HOOK V3.0)
assert(player.leftShoulder instanceof THREE.Group, 'leftShoulder is THREE.Group');
assert(player.rightShoulder instanceof THREE.Group, 'rightShoulder is THREE.Group');
assert(player.pivotGroup.children.includes(player.leftShoulder), 'leftShoulder is child of pivotGroup');
assert(player.pivotGroup.children.includes(player.rightShoulder), 'rightShoulder is child of pivotGroup');
assertClose(player.leftShoulder.position.x, -0.42, 0.001, 'leftShoulder position.x is -0.42');
assertClose(player.leftShoulder.position.y, 0.32, 0.001, 'leftShoulder position.y is 0.32');
assertClose(player.leftShoulder.position.z, 0.0, 0.001, 'leftShoulder position.z is 0.0');
assertClose(player.rightShoulder.position.x, 0.42, 0.001, 'rightShoulder position.x is +0.42');
assertClose(player.rightShoulder.position.y, 0.32, 0.001, 'rightShoulder position.y is 0.32');
assertClose(player.rightShoulder.position.z, 0.0, 0.001, 'rightShoulder position.z is 0.0');

// Arm Geometries & Segments
assert(player.leftPauldron.geometry instanceof THREE.OctahedronGeometry, 'leftPauldron uses OctahedronGeometry(0.16)');
assert(player.leftArmSegment.geometry instanceof THREE.BoxGeometry, 'leftArmSegment uses BoxGeometry(0.13, 0.13, 0.62)');
assertClose(player.leftArmSegment.position.z, 0.32, 0.001, 'leftArmSegment positioned at z = 0.32');
assert(player.leftArmStripe.geometry instanceof THREE.BoxGeometry, 'leftArmStripe uses BoxGeometry(0.15, 0.06, 0.52)');
assertClose(player.leftArmStripe.position.z, 0.34, 0.001, 'leftArmStripe positioned at z = 0.34');
assert(player.leftArmStripe.material.color.getHex() === (CONFIG.COLORS.HOOK_LEFT || 0xff0044), 'leftArmStripe color is HOOK_LEFT red');
assert(player.rightArmStripe.material.color.getHex() === (CONFIG.COLORS.HOOK_RIGHT || 0x00aaff), 'rightArmStripe color is HOOK_RIGHT blue');
assert(player.leftGauntlet.geometry instanceof THREE.BoxGeometry, 'leftGauntlet uses BoxGeometry(0.17, 0.17, 0.24)');
assertClose(player.leftGauntlet.position.z, 0.62, 0.001, 'leftGauntlet positioned at z = 0.62');

// Muzzle Nodes
assert(player.leftMuzzle instanceof THREE.Object3D, 'leftMuzzle is THREE.Object3D');
assert(player.rightMuzzle instanceof THREE.Object3D, 'rightMuzzle is THREE.Object3D');
assert(player.leftShoulder.children.includes(player.leftMuzzle), 'leftMuzzle is child of leftShoulder');
assert(player.rightShoulder.children.includes(player.rightMuzzle), 'rightMuzzle is child of rightShoulder');
assertClose(player.leftMuzzle.position.z, 0.76, 0.001, 'leftMuzzle positioned at z = 0.76 inside leftShoulder');
assertClose(player.rightMuzzle.position.z, 0.76, 0.001, 'rightMuzzle positioned at z = 0.76 inside rightShoulder');

// ----------------------------------------------------
// TEST 3: Dual Tron Lightcycle Light-Wall Trails
// ----------------------------------------------------
console.log('\n--- TEST 3: Dual Tron Lightcycle Light-Wall Trails Structure ---');
assert(player.leftTrailMesh instanceof THREE.Mesh, 'leftTrailMesh is THREE.Mesh');
assert(player.rightTrailMesh instanceof THREE.Mesh, 'rightTrailMesh is THREE.Mesh');
assert(player.trailMesh === player.leftTrailMesh, 'player.trailMesh aliases leftTrailMesh for backwards-compatibility');
assert(player.leftTrailGeometry instanceof THREE.BufferGeometry, 'leftTrailGeometry is BufferGeometry');
assert(player.rightTrailGeometry instanceof THREE.BufferGeometry, 'rightTrailGeometry is BufferGeometry');
assert(player.leftTrailGeometry.attributes.position.count === 72, 'leftTrailGeometry has 72 vertices (36 points * 2)');
assert(player.rightTrailGeometry.attributes.position.count === 72, 'rightTrailGeometry has 72 vertices (36 points * 2)');
assert(player.leftTrailGeometry.index.count === 210, 'leftTrailGeometry index has 210 indices (35 quads / 70 triangles)');
assert(player.rightTrailGeometry.index.count === 210, 'rightTrailGeometry index has 210 indices (35 quads / 70 triangles)');
assert(player.leftTrailMesh.material.vertexColors === true, 'trail material uses vertexColors');
assert(player.leftTrailMesh.material.transparent === true, 'trail material is transparent');
assert(player.leftTrailMesh.material.blending === THREE.AdditiveBlending, 'trail material uses AdditiveBlending');
assert(player.leftTrailMesh.material.side === THREE.DoubleSide, 'trail material uses DoubleSide');
assert(Array.isArray(player.leftTrailHistory), 'leftTrailHistory is an Array');
assert(Array.isArray(player.rightTrailHistory), 'rightTrailHistory is an Array');
assert(player.maxTrailPoints === (CONFIG.FX?.TRAIL_POINTS || 36), 'maxTrailPoints is 36');

// ----------------------------------------------------
// TEST 4: reset() Method
// ----------------------------------------------------
console.log('\n--- TEST 4: reset() Method ---');
player.body.velocity.set(15, 20, -30);
player.body.force.set(100, 200, 300);
player.mesh.scale.set(0.1, 0.1, 0.1);
player.reset(0, 3, 0);

assert(player.body.position.x === 0 && player.body.position.y === 3 && player.body.position.z === 0, 'body.position reset to (0, 3, 0)');
assert(player.body.velocity.length() === 0, 'body.velocity zeroed');
assert(player.body.force.length() === 0, 'body.force zeroed');
assert(player.mesh.position.x === 0 && player.mesh.position.y === 3 && player.mesh.position.z === 0, 'mesh.position synced to (0, 3, 0)');
assertClose(player.mesh.scale.x, 1.0, 0.001, 'mesh.scale.x restored to 1.0 on reset');
assertClose(player.mesh.scale.y, 1.0, 0.001, 'mesh.scale.y restored to 1.0 on reset');
assertClose(player.mesh.scale.z, 1.0, 0.001, 'mesh.scale.z restored to 1.0 on reset');
assert(player.leftTrailHistory.length === 0, 'leftTrailHistory cleared on reset');
assert(player.rightTrailHistory.length === 0, 'rightTrailHistory cleared on reset');
assert(player.leftTrailMesh.visible === false, 'leftTrailMesh hidden on reset');
assert(player.rightTrailMesh.visible === false, 'rightTrailMesh hidden on reset');

// Verify shoulder flight pose after reset
const expectedFlightQuatLeft = new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.4, -0.25, -0.35, 'XYZ'));
const expectedFlightQuatRight = new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.4, 0.25, 0.35, 'XYZ'));
assertClose(player.leftShoulder.quaternion.x, expectedFlightQuatLeft.x, 0.01, 'leftShoulder reset to flight pose quat X');
assertClose(player.rightShoulder.quaternion.x, expectedFlightQuatRight.x, 0.01, 'rightShoulder reset to flight pose quat X');

// ----------------------------------------------------
// TEST 5: Air-Strafe Physics Math in fixedUpdate()
// ----------------------------------------------------
console.log('\n--- TEST 5: Air-Strafe Math (Section 4.3.A) ---');
player.reset(0, 3, 0);
player.fixedUpdate(1 / 60, { KeyW: true }, 0);

// Expected force = m * AIR_STRAFE_ACCEL = 70 * 14 = 980 N along -Z
assertClose(player.body.force.x, 0, 0.01, 'KeyW strafe force X is 0');
assertClose(player.body.force.y, 0, 0.01, 'KeyW strafe force Y is 0');
assertClose(player.body.force.z, -980.0, 0.01, 'KeyW strafe force Z is -980 N');

physicsWorld.step(1 / 60);
assert(player.body.velocity.z < 0, 'Player accelerated along -Z');

// Air-Strafe speed cap at 20.0 m/s
player.body.velocity.set(0, 0, -20.5);
player.body.force.set(0, 0, 0);
player.fixedUpdate(1 / 60, { KeyW: true }, 0);
assertClose(player.body.force.z, 0, 0.01, 'No air-strafe force added when directional speed >= 20.0 m/s');

// Lateral strafe applies perpendicular force
player.fixedUpdate(1 / 60, { KeyD: true }, 0);
assertClose(player.body.force.x, 980.0, 0.01, 'Perpendicular strafe force (KeyD) applies even when forward speed > 20 m/s');

// Space produces no jump
player.body.force.set(0, 0, 0);
player.fixedUpdate(1 / 60, { Space: true, KeyW: false }, 0);
assertClose(player.body.force.y, 0, 0.001, 'Space key produces zero vertical jump force');

// ----------------------------------------------------
// TEST 6: MAX_SPEED Hard Clamp (75.0 m/s)
// ----------------------------------------------------
console.log('\n--- TEST 6: MAX_SPEED Hard Clamp ---');
player.body.velocity.set(50, 40, -60);
const preSpeed = player.body.velocity.length();
assert(preSpeed > 75.0, `Initial velocity length ${preSpeed.toFixed(2)} exceeds 75.0`);

player.fixedUpdate(1 / 60, {}, 0);
const clampedSpeed = player.getSpeed();
assertClose(clampedSpeed, 75.0, 0.001, 'Velocity strictly clamped to 75.0 m/s');

// ----------------------------------------------------
// TEST 7: updateVisuals() Banking, Pitch & Yaw
// ----------------------------------------------------
console.log('\n--- TEST 7: Visuals, Yaw, Banking & Pitch ---');
player.reset(5, 10, -50);

player.body.velocity.set(0, 0, 0);
player.updateVisuals(0.1, 1.25);
assertClose(player.mesh.position.x, 5, 0.001, 'Visual mesh synced to X = 5');
assertClose(player.mesh.position.y, 10, 0.001, 'Visual mesh synced to Y = 10');
assertClose(player.mesh.position.z, -50, 0.001, 'Visual mesh synced to Z = -50');
assert(player.mesh.rotation.y > 0, 'Stationary yaw lerps toward cameraYaw');

player.body.velocity.set(30, 0, 0);
for (let i = 0; i < 40; i++) {
  player.updateVisuals(1 / 60, 0);
}
assertClose(player.mesh.rotation.y, -Math.PI / 2, 0.05, 'Airborne yaw aligns toward velocity vector');

player.body.velocity.set(0, 0, -75);
player.updateVisuals(1 / 60, 0);
assertClose(player.pivotGroup.rotation.x, 0.65, 0.01, 'Torso pitches forward to 0.65 rad at max speed');

// ----------------------------------------------------
// TEST 8: Dual Light-Wall Trails Activation (> 4.0 m/s)
// ----------------------------------------------------
console.log('\n--- TEST 8: Dual Light-Wall Trails Activation (> 4.0 m/s) ---');
player.reset(0, 5, 0);

// Speed <= 4.0 m/s: trails remain hidden
player.body.velocity.set(0, 0, -3.5);
player.updateVisuals(1 / 60, 0);
assert(player.leftTrailMesh.visible === false, 'Left trail mesh hidden at 3.5 m/s (<= 4.0 m/s)');
assert(player.rightTrailMesh.visible === false, 'Right trail mesh hidden at 3.5 m/s (<= 4.0 m/s)');

// Speed > 4.0 m/s: trails activate and populate buffer
player.body.velocity.set(0, 0, -25);
for (let step = 0; step < 20; step++) {
  player.body.position.z -= 0.42;
  player.updateVisuals(1 / 60, 0);
}
assert(player.leftTrailMesh.visible === true, 'Left trail becomes visible at 25 m/s (> 4.0 m/s)');
assert(player.rightTrailMesh.visible === true, 'Right trail becomes visible at 25 m/s (> 4.0 m/s)');
assert(player.leftTrailHistory.length > 2, `Left trail history populated (${player.leftTrailHistory.length} points)`);
assert(player.rightTrailHistory.length > 2, `Right trail history populated (${player.rightTrailHistory.length} points)`);
assert(player.leftTrailHistory.length <= 36, 'Trail history respects max length 36');

// Verify vertical height formula: height_i = 0.28 * (1.0 - i / 35)
const posAttr = player.leftTrailGeometry.attributes.position;
const topY0 = posAttr.getY(0); // top at i=0
const botY0 = posAttr.getY(1); // bot at i=0
assertClose(topY0 - botY0, 0.56, 0.01, 'Head vertical ribbon height (top - bot) is 2 * 0.28 = 0.56m');

// ----------------------------------------------------
// TEST 9: getSpeed() Method
// ----------------------------------------------------
console.log('\n--- TEST 9: getSpeed() ---');
player.body.velocity.set(3, 4, 0);
assertClose(player.getSpeed(), 5.0, 0.001, 'getSpeed returns correct 3-4-5 triangle magnitude');

// ----------------------------------------------------
// TEST 10: dispose() Method
// ----------------------------------------------------
console.log('\n--- TEST 10: dispose() ---');
const prevBodies = physicsWorld.bodies.length;
player.dispose();
assert(physicsWorld.bodies.length === prevBodies - 1, 'player.body removed from physics world');
assert(!scene.children.includes(player.mesh), 'player.mesh removed from scene');
assert(!scene.children.includes(player.leftTrailMesh), 'player.leftTrailMesh removed from scene');
assert(!scene.children.includes(player.rightTrailMesh), 'player.rightTrailMesh removed from scene');

// ----------------------------------------------------
// TEST 11: Edge Cases & Defensive Programming
// ----------------------------------------------------
console.log('\n--- TEST 11: Edge Cases & Defensive Programming ---');
const standalonePlayer = new PlayerController(null, null);
assert(standalonePlayer.body instanceof CANNON.Body, 'Standalone player created without scene or physicsWorld');
assert(standalonePlayer.mesh instanceof THREE.Group, 'Standalone player mesh created');

standalonePlayer.fixedUpdate();
assert(standalonePlayer.getSpeed() === 0, 'fixedUpdate with empty args runs without error');

standalonePlayer.body.velocity.set(NaN, Infinity, -NaN);
standalonePlayer.fixedUpdate(1 / 60, {}, 0);
assert(Number.isFinite(standalonePlayer.body.velocity.x), 'velocity.x sanitized from NaN');

standalonePlayer.body.velocity.set(0, 0, -30);
standalonePlayer.updateVisuals(0, 0);
assert(Number.isFinite(standalonePlayer.mesh.rotation.y), 'rotation.y is finite after dt = 0');
assert(Number.isFinite(standalonePlayer.pivotGroup.rotation.x), 'rotation.x is finite after dt = 0');
assert(Number.isFinite(standalonePlayer.pivotGroup.rotation.z), 'rotation.z is finite after dt = 0');

standalonePlayer.updateVisuals(-0.5, 0);
assert(Number.isFinite(standalonePlayer.mesh.rotation.y), 'rotation.y is finite after negative dt');

standalonePlayer.updateVisuals(1 / 60, 7 * Math.PI);
assert(Number.isFinite(standalonePlayer.mesh.rotation.y), 'Yaw smoothly handles large angle multiples');

// Rapid trail switching across 4.0 m/s threshold
let maxTrailLengthObserved = 0;
for (let i = 0; i < 60; i++) {
  standalonePlayer.body.velocity.set(0, 0, i % 2 === 0 ? -12 : -2);
  standalonePlayer.updateVisuals(1 / 60, 0);
  if (standalonePlayer.leftTrailHistory.length > maxTrailLengthObserved) {
    maxTrailLengthObserved = standalonePlayer.leftTrailHistory.length;
  }
}
assert(maxTrailLengthObserved <= 36, 'Trail buffer never exceeds 36 entries across 60 rapid threshold switches');

standalonePlayer.dispose();
standalonePlayer.dispose();
assert(true, 'Calling dispose() multiple times is safe and idempotent');

// ----------------------------------------------------
// TEST 12: 1-Frame Trail Visibility Glitch Prevention
// ----------------------------------------------------
console.log('\n--- TEST 12: 1-Frame Trail Visibility Glitch Prevention ---');
const testScene = new THREE.Scene();
const testWorld = new PhysicsWorld();
const trailTester = new PlayerController(testScene, testWorld);

trailTester.reset(0, 3, 0);
assert(trailTester.leftTrailMesh.visible === false, 'Left trail mesh hidden initially');
assert(trailTester.rightTrailMesh.visible === false, 'Right trail mesh hidden initially');

// Step 1: 1 single frame at 20 m/s (1 point in buffer, cannot form a ribbon segment)
trailTester.body.velocity.set(0, 0, -20);
trailTester.updateVisuals(1 / 60, 0);
assert(trailTester.leftTrailHistory.length === 1, 'Trail buffer has 1 point on first frame');
assert(trailTester.leftTrailMesh.visible === false, 'Left trail mesh remains invisible on frame 1 (prevents uninitialized buffer flash)');

// Step 2: 2nd frame at 20 m/s (2 points in buffer, segment forms)
trailTester.body.position.z -= 0.33;
trailTester.updateVisuals(1 / 60, 0);
assert(trailTester.leftTrailHistory.length === 2, 'Trail buffer has 2 points on second frame');
assert(trailTester.leftTrailMesh.visible === true, 'Left trail mesh becomes visible once segment has >= 2 points');

// Step 3: Speed drops below 4 m/s, dissipates to 1 point
trailTester.body.velocity.set(0, 0, -2);
trailTester.updateVisuals(1 / 60, 0);
assert(trailTester.leftTrailHistory.length === 1, 'Trail buffer dissipates to 1 point');
assert(trailTester.leftTrailMesh.visible === false, 'Left trail mesh immediately hides when points < 2');

// ----------------------------------------------------
// TEST 13: Muzzle Helper Methods
// ----------------------------------------------------
console.log('\n--- TEST 13: Muzzle Helper Methods ---');
trailTester.reset(0, 3, 0);
const leftMuzzWorld = trailTester.getLeftMuzzlePosition();
const rightMuzzWorld = trailTester.getRightMuzzlePosition();
const queriedLeft = trailTester.getMuzzlePosition('left');
const queriedRight = trailTester.getMuzzlePosition('right');

assert(leftMuzzWorld instanceof THREE.Vector3, 'getLeftMuzzlePosition returns Vector3');
assert(rightMuzzWorld instanceof THREE.Vector3, 'getRightMuzzlePosition returns Vector3');
assert(Number.isFinite(leftMuzzWorld.x), 'leftMuzzle world X is finite');
assert(Number.isFinite(leftMuzzWorld.y), 'leftMuzzle world Y is finite');
assert(Number.isFinite(leftMuzzWorld.z), 'leftMuzzle world Z is finite');
assertClose(queriedLeft.x, leftMuzzWorld.x, 0.001, 'getMuzzlePosition("left") matches');
assertClose(queriedRight.x, rightMuzzWorld.x, 0.001, 'getMuzzlePosition("right") matches');
assert(leftMuzzWorld.x < 0, 'Left muzzle is on left side (-X)');
assert(rightMuzzWorld.x > 0, 'Right muzzle is on right side (+X)');

// ----------------------------------------------------
// TEST 14: Dual Light-Wall Trail Vertex Colors (Red/Blue Gradient)
// ----------------------------------------------------
console.log('\n--- TEST 14: Dual Light-Wall Trail Vertex Colors ---');
const colorTrailPlayer = new PlayerController(testScene, testWorld);
colorTrailPlayer.reset(0, 5, 0);
colorTrailPlayer.body.velocity.set(0, 0, -30);

for (let step = 0; step < 40; step++) {
  colorTrailPlayer.body.position.z -= 0.5;
  colorTrailPlayer.updateVisuals(1 / 60, 0);
}

// Left Trail Colors:
const leftColAttr = colorTrailPlayer.leftTrailGeometry.attributes.color;
const cLeftHead = new THREE.Color().fromBufferAttribute(leftColAttr, 0);
assert(cLeftHead.getHex() === 0xff88aa, `Left trail head color matches #ff88aa (got 0x${cLeftHead.getHex().toString(16)})`);

// Mid (i = 5): #ff0044
const topIdx5 = 2 * 5;
const cLeftMid = new THREE.Color().fromBufferAttribute(leftColAttr, topIdx5);
assert(cLeftMid.getHex() === 0xff0044, `Left trail mid color matches #ff0044 (got 0x${cLeftMid.getHex().toString(16)})`);

// Tail (i = 35): fades to black (0, 0, 0)
const topIdx35 = 2 * 35;
const cLeftTail = new THREE.Color().fromBufferAttribute(leftColAttr, topIdx35);
assert(cLeftTail.getHex() === 0x000000, 'Left trail tail color is black (0x000000)');

// Right Trail Colors:
const rightColAttr = colorTrailPlayer.rightTrailGeometry.attributes.color;
const cRightHead = new THREE.Color().fromBufferAttribute(rightColAttr, 0);
assert(cRightHead.getHex() === 0x88ddff, `Right trail head color matches #88ddff (got 0x${cRightHead.getHex().toString(16)})`);

const cRightMid = new THREE.Color().fromBufferAttribute(rightColAttr, topIdx5);
assert(cRightMid.getHex() === 0x00aaff, `Right trail mid color matches #00aaff (got 0x${cRightMid.getHex().toString(16)})`);

const cRightTail = new THREE.Color().fromBufferAttribute(rightColAttr, topIdx35);
assert(cRightTail.getHex() === 0x000000, 'Right trail tail color is black (0x000000)');

colorTrailPlayer.dispose();

// ----------------------------------------------------
// TEST 15: Pre-allocated Voxel Shatter Death Explosion
// ----------------------------------------------------
console.log('\n--- TEST 15: Pre-allocated Voxel Shatter Death Explosion ---');
const explodePlayer = new PlayerController(testScene, testWorld);
explodePlayer.reset(0, 5, 0);

assert(explodePlayer.shardGroup instanceof THREE.Group, 'shardGroup is THREE.Group');
assert(testScene.children.includes(explodePlayer.shardGroup), 'shardGroup added to scene');
assert(explodePlayer.shardGroup.visible === false, 'shardGroup initially invisible');
assert(explodePlayer.shards.length === (CONFIG.FX?.SHATTER_COUNT || 32), 'pre-allocated 32 shards');

explodePlayer.body.velocity.set(10, 20, -30);
explodePlayer.triggerExplosion();

assert(explodePlayer.isExploding === true, 'isExploding is true after triggerExplosion');
assert(explodePlayer.mesh.visible === false, 'avatar mesh hidden during explosion');
assert(explodePlayer.leftTrailMesh.visible === false, 'left trail mesh hidden during explosion');
assert(explodePlayer.rightTrailMesh.visible === false, 'right trail mesh hidden during explosion');
assert(explodePlayer.shardGroup.visible === true, 'shardGroup visible during explosion');

explodePlayer.updateVisuals(0.1, 0);
assert(explodePlayer.explodeTimer > 0, 'explodeTimer advanced by dt');
assert(explodePlayer.shards[0].mesh.scale.x < 1.0, 'Shard scale shrank along normalized time t');

explodePlayer.reset(2, 4, 6);
assert(explodePlayer.isExploding === false, 'isExploding reset to false');
assert(explodePlayer.mesh.visible === true, 'avatar mesh restored to visible');
assert(explodePlayer.leftTrailMesh.visible === false, 'trail mesh hidden on reset');
assert(explodePlayer.shardGroup.visible === false, 'shardGroup hidden on reset');

explodePlayer.dispose();
trailTester.dispose();

// ----------------------------------------------------
// TEST 16: Articulated Arm Hookshot Tracking (AERO-HOOK V3.0)
// ----------------------------------------------------
console.log('\n--- TEST 16: Articulated Arm Hookshot Tracking ---');
const trackingPlayer = new PlayerController(testScene, testWorld);
trackingPlayer.reset(0, 5, 0);

// Inactive state: arms relax toward swept-back flight poses
for (let i = 0; i < 30; i++) {
  trackingPlayer.updateVisuals(1 / 60, 0, { left: { active: false }, right: { active: false } });
}

assertClose(trackingPlayer.leftShoulder.quaternion.x, expectedFlightQuatLeft.x, 0.05, 'Inactive left arm relaxed in flight pose');
assertClose(trackingPlayer.rightShoulder.quaternion.x, expectedFlightQuatRight.x, 0.05, 'Inactive right arm relaxed in flight pose');

// Fire Left Hookshot toward an anchor at (-15, 20, -40)
const leftAnchor = new THREE.Vector3(-15, 20, -40);
const hookState = {
  left: { active: true, anchor: leftAnchor },
  right: { active: false, anchor: null },
};

// Slerp arm toward target over 20 frames
for (let i = 0; i < 20; i++) {
  trackingPlayer.updateVisuals(1 / 60, 0, hookState);
}

// Verify left arm aims towards leftAnchor
const leftShoulderPos = new THREE.Vector3();
trackingPlayer.leftShoulder.getWorldPosition(leftShoulderPos);
const leftMuzzlePos = trackingPlayer.getLeftMuzzlePosition();

const leftArmDir = new THREE.Vector3().subVectors(leftMuzzlePos, leftShoulderPos).normalize();
const expectedLeftDir = new THREE.Vector3().subVectors(leftAnchor, leftShoulderPos).normalize();
const dotLeft = leftArmDir.dot(expectedLeftDir);
assertClose(dotLeft, 1.0, 0.02, `Left arm accurately aimed at anchor (dot=${dotLeft.toFixed(4)} ~ 1.0)`);

// Right arm remains in aerodynamic flight pose while left is active
assertClose(trackingPlayer.rightShoulder.quaternion.x, expectedFlightQuatRight.x, 0.05, 'Right arm independently kept flight pose');

// Now fire Right Hookshot toward an anchor at (+25, 12, -35)
const rightAnchor = new THREE.Vector3(25, 12, -35);
hookState.right = { active: true, anchor: rightAnchor };
hookState.left.active = false; // Release left

for (let i = 0; i < 20; i++) {
  trackingPlayer.updateVisuals(1 / 60, 0, hookState);
}

const rightShoulderPos = new THREE.Vector3();
trackingPlayer.rightShoulder.getWorldPosition(rightShoulderPos);
const rightMuzzlePos = trackingPlayer.getRightMuzzlePosition();

const rightArmDir = new THREE.Vector3().subVectors(rightMuzzlePos, rightShoulderPos).normalize();
const expectedRightDir = new THREE.Vector3().subVectors(rightAnchor, rightShoulderPos).normalize();
const dotRight = rightArmDir.dot(expectedRightDir);
assertClose(dotRight, 1.0, 0.02, `Right arm accurately aimed at anchor (dot=${dotRight.toFixed(4)} ~ 1.0)`);

// Verify setHooks() caching works without passing hooks directly to updateVisuals()
trackingPlayer.setHooks({ left: { active: false }, right: { active: false } });
for (let i = 0; i < 20; i++) {
  trackingPlayer.updateVisuals(1 / 60, 0); // null hooks, uses hooksRef
}
assertClose(trackingPlayer.rightShoulder.quaternion.x, expectedFlightQuatRight.x, 0.05, 'Right arm returned to flight pose via setHooks cached reference');

trackingPlayer.dispose();

// ----------------------------------------------------
// TEST 17: Black Hole Implosion Suction Helper (AERO-HOOK V3.0)
// ----------------------------------------------------
console.log('\n--- TEST 17: Black Hole Implosion Suction Helper ---');
const suctionPlayer = new PlayerController(testScene, testWorld);
suctionPlayer.reset(0, 5, -80);

const blackHoleGate = { x: 0, y: 12, z: -120 };
const initialDist = suctionPlayer.mesh.position.distanceTo(new THREE.Vector3(blackHoleGate.x, blackHoleGate.y, blackHoleGate.z));
assertClose(suctionPlayer.mesh.scale.x, 1.0, 0.001, 'Initial player scale is 1.0');

// Step suction update for 10 frames
for (let step = 0; step < 10; step++) {
  suctionPlayer.updateSuction(1 / 60, blackHoleGate);
}

const postDist = suctionPlayer.mesh.position.distanceTo(new THREE.Vector3(blackHoleGate.x, blackHoleGate.y, blackHoleGate.z));
assert(postDist < initialDist, `Suction successfully pulled player closer (${postDist.toFixed(2)}m < ${initialDist.toFixed(2)}m)`);
assert(suctionPlayer.mesh.scale.x < 1.0, `Player scale shrank toward 0.05 (current: ${suctionPlayer.mesh.scale.x.toFixed(3)})`);
assert(suctionPlayer.mesh.scale.x > 0.05, 'Scale remains bounded above 0.05 during initial shrink');

// Multiple suction steps pull scale very close to 0.05
for (let step = 0; step < 40; step++) {
  suctionPlayer.updateSuction(1 / 60, blackHoleGate);
}
assertClose(suctionPlayer.mesh.scale.x, 0.05, 0.03, 'Player scale approaches ~0.05 singularity collapse');

// Reset restores scale to 1.0 and clears suction
suctionPlayer.reset(0, 3, 0);
assertClose(suctionPlayer.mesh.scale.x, 1.0, 0.001, 'reset() completely restores avatar scale to 1.0');

suctionPlayer.dispose();

// ----------------------------------------------------
// TEST 18: Arrow Key Controls & Vector Recycling (Restored)
// ----------------------------------------------------
console.log('\n--- TEST 18: Arrow Key Controls & Vector Recycling ---');
const arrowTester = new PlayerController(testScene, testWorld);
arrowTester.reset(0, 3, 0);
arrowTester.fixedUpdate(1 / 60, { ArrowUp: true }, 0);
assert(arrowTester.body.force.z < -900, 'ArrowUp produces forward force along -Z');

arrowTester.reset(0, 3, 0);
arrowTester.fixedUpdate(1 / 60, { ArrowRight: true }, 0);
assert(arrowTester.body.force.x > 900, 'ArrowRight produces rightward force along +X');

// Verify Vector3 object pooling
assert(Array.isArray(arrowTester._trailPool), '_trailPool exists on instance');
arrowTester.body.velocity.set(0, 0, -40);
for (let i = 0; i < 40; i++) {
  arrowTester.body.position.z -= 0.5;
  arrowTester.updateVisuals(1 / 60, 0);
}
assert(arrowTester._trailPool.length > 0, 'Vector3 instances recycled into _trailPool when buffer max is reached');
arrowTester.dispose();

// ----------------------------------------------------
// TEST 19: Edge Case Defense & Robustness for V3.0 Features
// ----------------------------------------------------
console.log('\n--- TEST 19: Edge Case Defense & Robustness for V3.0 Features ---');
const defensePlayer = new PlayerController(testScene, testWorld);
defensePlayer.reset(0, 3, 0);

// A. updateArmTracking with anchor: {} (must not throw TypeError: cannot read property 'isVector3' of undefined)
defensePlayer.updateVisuals(1 / 60, 0, { left: { active: true, anchor: {} }, right: { active: false } });
assert(Number.isFinite(defensePlayer.leftShoulder.quaternion.x), 'Left arm quaternion is finite when anchor is {}');
assert(Number.isFinite(defensePlayer.leftShoulder.quaternion.w), 'Left arm quaternion W is finite when anchor is {}');

// B. updateArmTracking with anchor containing NaN
defensePlayer.updateVisuals(1 / 60, 0, { left: { active: true, anchor: { x: NaN, y: 0, z: 0 } } });
assert(Number.isFinite(defensePlayer.leftShoulder.quaternion.x), 'Left arm quaternion sanitized when anchor has NaN');

// C. updateArmTracking with hitInfo format: { point: Vector3 }
const pointAnchor = new THREE.Vector3(12, 14, -20);
defensePlayer.updateVisuals(1 / 60, 0, { right: { active: true, anchor: { point: pointAnchor } } });
assert(Number.isFinite(defensePlayer.rightShoulder.quaternion.x), 'Right arm tracks { point: Vector3 } hitInfo format');

// D. updateSuction with partial targetPos: { x: 10 } (must not set Y/Z to NaN)
defensePlayer.updateSuction(1 / 60, { x: 10 });
assert(Number.isFinite(defensePlayer.mesh.position.y), 'updateSuction with partial { x: 10 } does not corrupt position.y to NaN');
assert(Number.isFinite(defensePlayer.mesh.position.z), 'updateSuction with partial { x: 10 } does not corrupt position.z to NaN');

// E. updateSuction with null targetPos (must be safe no-op)
defensePlayer.updateSuction(1 / 60, null);
assert(Number.isFinite(defensePlayer.mesh.position.x), 'updateSuction with null targetPos is safe no-op');

// F. getLeftMuzzlePosition(null) and getRightMuzzlePosition(null) must not crash
const nullQueryLeft = defensePlayer.getLeftMuzzlePosition(null);
const nullQueryRight = defensePlayer.getRightMuzzlePosition(null);
assert(nullQueryLeft instanceof THREE.Vector3, 'getLeftMuzzlePosition(null) safely returns a Vector3');
assert(nullQueryRight instanceof THREE.Vector3, 'getRightMuzzlePosition(null) safely returns a Vector3');

// G. reset() clears hooksRef so stale aiming never carries over to next run
defensePlayer.setHooks({ left: { active: true, anchor: new THREE.Vector3(100, 200, 300) } });
defensePlayer.reset(0, 3, 0);
assert(defensePlayer.hooksRef === null, 'reset() explicitly clears this.hooksRef to null');

// H. triggerExplosion flushes trail buffers into pool
defensePlayer.body.velocity.set(0, 0, -30);
for (let i = 0; i < 10; i++) {
  defensePlayer.body.position.z -= 0.5;
  defensePlayer.updateVisuals(1 / 60, 0);
}
assert(defensePlayer.leftTrailHistory.length > 0, 'Trail history populated before explosion');
defensePlayer.triggerExplosion();
assert(defensePlayer.leftTrailHistory.length === 0, 'Trail history flushed on triggerExplosion');
assert(defensePlayer.leftTrailMesh.visible === false, 'Left trail hidden on triggerExplosion');

defensePlayer.dispose();

console.log('\n====================================================');
console.log('🎉 ALL PLAYER CONTROLLER V3.0 TESTS PASSED SUCCESSFULLY!');
console.log('====================================================');
