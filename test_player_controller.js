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
console.log('🧪 TESTING AERO-HOOK PLAYER CONTROLLER (PHASE 1B-1)');
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
// TEST 2: Procedural Low-Poly 3D Avatar Hierarchy
// ----------------------------------------------------
console.log('\n--- TEST 2: Procedural Avatar Hierarchy ---');
assert(player.mesh instanceof THREE.Group, 'player.mesh is THREE.Group');
assert(scene.children.includes(player.mesh), 'player.mesh added to scene');
assert(player.pivotGroup instanceof THREE.Group, 'player.pivotGroup is THREE.Group');
assert(player.mesh.children.includes(player.pivotGroup), 'pivotGroup is child of mesh');

// Torso
assert(player.torsoMesh instanceof THREE.Mesh, 'player.torsoMesh created');
assert(player.torsoMesh.geometry instanceof THREE.ConeGeometry, 'torso uses ConeGeometry');
assert(player.torsoMesh.material.color.getHex() === 0x2e3440, 'torso material color is 0x2e3440');
assert(player.torsoMesh.material.flatShading === true, 'torso material flatShading is true');
assertClose(player.torsoMesh.material.roughness, 0.6, 0.01, 'torso material roughness is 0.6');

// Head & Visor
assert(player.headMesh instanceof THREE.Mesh, 'player.headMesh created');
assert(player.headMesh.geometry instanceof THREE.OctahedronGeometry, 'head uses OctahedronGeometry');
assertClose(player.headMesh.position.y, 0.75, 0.001, 'head position.y is 0.75');
assert(player.headMesh.material.color.getHex() === 0x4c566a, 'head material color is 0x4c566a');

assert(player.visorMesh instanceof THREE.Mesh, 'player.visorMesh created');
assert(player.visorMesh.geometry instanceof THREE.BoxGeometry, 'visor uses BoxGeometry');
assertClose(player.visorMesh.position.x, 0.0, 0.001, 'visor position.x is 0');
assertClose(player.visorMesh.position.y, 0.75, 0.001, 'visor position.y is 0.75');
assertClose(player.visorMesh.position.z, -0.18, 0.001, 'visor position.z is -0.18');
assert(player.visorMesh.material.color.getHex() === CONFIG.COLORS.HOOK_LEFT, 'visor uses Hook Left cyan color');

// Hip ODM Launchers & Muzzles
assert(player.leftPod instanceof THREE.Mesh, 'leftPod created');
assert(player.rightPod instanceof THREE.Mesh, 'rightPod created');
assertClose(player.leftPod.position.x, -0.42, 0.001, 'leftPod position.x is -0.42');
assertClose(player.leftPod.position.y, -0.1, 0.001, 'leftPod position.y is -0.1');
assertClose(player.rightPod.position.x, 0.42, 0.001, 'rightPod position.x is +0.42');
assertClose(player.rightPod.position.y, -0.1, 0.001, 'rightPod position.y is -0.1');

assert(player.leftMuzzle instanceof THREE.Object3D, 'leftMuzzle is Object3D');
assert(player.rightMuzzle instanceof THREE.Object3D, 'rightMuzzle is Object3D');
assertClose(player.leftMuzzle.position.z, -0.25, 0.001, 'leftMuzzle position.z is -0.25');
assertClose(player.rightMuzzle.position.z, -0.25, 0.001, 'rightMuzzle position.z is -0.25');

// World Position query check for GrappleSystem
player.reset(10, 5, -20);
const leftMuzzleWorld = new THREE.Vector3();
const rightMuzzleWorld = new THREE.Vector3();
player.leftMuzzle.getWorldPosition(leftMuzzleWorld);
player.rightMuzzle.getWorldPosition(rightMuzzleWorld);

assertClose(leftMuzzleWorld.x, 10 - 0.42, 0.01, 'leftMuzzle world X matches expected offset');
assertClose(leftMuzzleWorld.y, 5 - 0.1, 0.01, 'leftMuzzle world Y matches expected offset');
assertClose(leftMuzzleWorld.z, -20 - 0.25, 0.01, 'leftMuzzle world Z matches expected offset');
assertClose(rightMuzzleWorld.x, 10 + 0.42, 0.01, 'rightMuzzle world X matches expected offset');

// ----------------------------------------------------
// TEST 3: Dynamic Ribbon Trail Geometry
// ----------------------------------------------------
console.log('\n--- TEST 3: Dynamic Ribbon Trail Structure ---');
assert(player.trailMesh instanceof THREE.Mesh, 'trailMesh is THREE.Mesh');
assert(player.trailGeometry instanceof THREE.BufferGeometry, 'trailGeometry is BufferGeometry');
assert(player.trailGeometry.attributes.position.count === 24, 'trailGeometry position attribute has 24 vertices');
assert(player.trailGeometry.attributes.color.itemSize === 4, 'trailGeometry color attribute is RGBA (itemSize 4)');
assert(player.trailGeometry.attributes.alpha.itemSize === 1, 'trailGeometry alpha attribute is itemSize 1');
assert(player.trailMesh.material.vertexColors === true, 'trail material uses vertexColors');
assert(player.trailMesh.material.transparent === true, 'trail material is transparent');
assert(Array.isArray(player.trailBuffer), 'trailBuffer is an Array');

// ----------------------------------------------------
// TEST 4: reset() Method
// ----------------------------------------------------
console.log('\n--- TEST 4: reset() Method ---');
player.body.velocity.set(15, 20, -30);
player.body.force.set(100, 200, 300);
player.reset(0, 3, 0);

assert(player.body.position.x === 0 && player.body.position.y === 3 && player.body.position.z === 0, 'body.position reset to (0, 3, 0)');
assert(player.body.velocity.length() === 0, 'body.velocity zeroed');
assert(player.body.force.length() === 0, 'body.force zeroed');
assert(player.mesh.position.x === 0 && player.mesh.position.y === 3 && player.mesh.position.z === 0, 'mesh.position synced to (0, 3, 0)');
assert(player.trailBuffer.length === 0, 'trailBuffer cleared on reset');
assert(player.trailMesh.visible === false, 'trailMesh hidden on reset');

// ----------------------------------------------------
// TEST 5: Air-Strafe Physics Math in fixedUpdate()
// ----------------------------------------------------
console.log('\n--- TEST 5: Air-Strafe Math (Section 4.3.A) ---');
// At cameraYaw = 0: fwd = (0, 0, -1), right = (1, 0, 0)
// Pressing KeyW: wishDir = (0, 0, -1)
player.reset(0, 3, 0);
player.fixedUpdate(1 / 60, { KeyW: true }, 0);

// Expected force = m * AIR_STRAFE_ACCEL = 70 * 14 = 980 N along -Z
assertClose(player.body.force.x, 0, 0.01, 'KeyW strafe force X is 0');
assertClose(player.body.force.y, 0, 0.01, 'KeyW strafe force Y is 0');
assertClose(player.body.force.z, -980.0, 0.01, 'KeyW strafe force Z is -980 N');

// Step simulation: velocity should accelerate along -Z
physicsWorld.step(1 / 60);
assert(player.body.velocity.z < 0, 'Player accelerated along -Z');
console.log(`Velocity after 1 step of KeyW: ${player.body.velocity.z.toFixed(4)} m/s`);

// Test Air-Strafe speed cap at 20.0 m/s:
// When directional speed reaches 20.0 m/s, strafe force is no longer applied
player.body.velocity.set(0, 0, -20.5); // already > 20 m/s along -Z
player.body.force.set(0, 0, 0);
player.fixedUpdate(1 / 60, { KeyW: true }, 0);
assertClose(player.body.force.z, 0, 0.01, 'No air-strafe force added when directional speed >= 20.0 m/s');

// But lateral strafe (KeyD) STILL applies perpendicular force!
player.fixedUpdate(1 / 60, { KeyD: true }, 0);
assertClose(player.body.force.x, 980.0, 0.01, 'Perpendicular strafe force (KeyD) applies even when forward speed > 20 m/s');

// Verify Space does NOT jump
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
assertClose(player.body.velocity.x / clampedSpeed, 50 / preSpeed, 0.001, 'Clamping preserves vector direction X');
assertClose(player.body.velocity.y / clampedSpeed, 40 / preSpeed, 0.001, 'Clamping preserves vector direction Y');
assertClose(player.body.velocity.z / clampedSpeed, -60 / preSpeed, 0.001, 'Clamping preserves vector direction Z');

// ----------------------------------------------------
// TEST 7: updateVisuals() Banking, Pitch & Yaw
// ----------------------------------------------------
console.log('\n--- TEST 7: Visuals, Yaw, Banking & Pitch ---');
player.reset(5, 10, -50);

// A. Low speed (stationary): yaw aligns with cameraYaw
player.body.velocity.set(0, 0, 0);
player.updateVisuals(0.1, 1.25);
assertClose(player.mesh.position.x, 5, 0.001, 'Visual mesh synced to X = 5');
assertClose(player.mesh.position.y, 10, 0.001, 'Visual mesh synced to Y = 10');
assertClose(player.mesh.position.z, -50, 0.001, 'Visual mesh synced to Z = -50');
assert(player.mesh.rotation.y > 0, 'Stationary yaw lerps toward cameraYaw');

// B. High speed along +X: yaw aligns with velocity vector atan2(-vx, -vz)
// When vx = 30, vz = 0: targetYaw = atan2(-30, 0) = -PI/2
player.body.velocity.set(30, 0, 0);
// Update frames to allow smooth yaw slerp convergence
for (let i = 0; i < 40; i++) {
  player.updateVisuals(1 / 60, 0);
}
assertClose(player.mesh.rotation.y, -Math.PI / 2, 0.05, 'Airborne yaw aligns toward velocity vector');

// C. Forward Pitch proportional to horizontal speed (up to 0.65 rad)
player.body.velocity.set(0, 0, -75); // Max speed
player.updateVisuals(1 / 60, 0);
assertClose(player.pivotGroup.rotation.x, 0.65, 0.01, 'Torso pitches forward to 0.65 rad at max speed');

player.body.velocity.set(0, 0, -37.5); // Half max speed
player.updateVisuals(1 / 60, 0);
assertClose(player.pivotGroup.rotation.x, 0.325, 0.01, 'Torso pitch is exactly half (0.325 rad) at half speed');

// D. Lateral Bank (Roll) clamped between -0.55 and +0.55
assert(player.pivotGroup.rotation.z >= -0.55 && player.pivotGroup.rotation.z <= 0.55, 'Lateral roll strictly bounded in [-0.55, 0.55]');

// ----------------------------------------------------
// TEST 8: Dynamic Ribbon Trail (speed > 25 m/s)
// ----------------------------------------------------
console.log('\n--- TEST 8: Dynamic Ribbon Trail Activation ---');
player.reset(0, 5, 0);

// Speed <= 25 m/s: trail does not activate
player.body.velocity.set(0, 0, -20);
player.updateVisuals(1 / 60, 0);
assert(player.trailMesh.visible === false, 'Trail mesh hidden at 20 m/s (< 25 m/s)');

// Speed > 25 m/s: trail activates and populates buffer
player.body.velocity.set(0, 0, -40);
for (let step = 0; step < 15; step++) {
  player.body.position.z -= 0.66; // simulate movement
  player.updateVisuals(1 / 60, 0);
}
assert(player.trailMesh.visible === true, 'Trail mesh becomes visible at 40 m/s (> 25 m/s)');
assert(player.trailBuffer.length > 2, `Trail buffer populated (${player.trailBuffer.length} points)`);
assert(player.trailBuffer.length <= 24, 'Trail buffer respects max length 24');

// Verify vertex alpha fade: tail (k=0) has alpha 0.0, head (k=22/23) has alpha 0.8
const alphaAttr = player.trailGeometry.attributes.alpha;
const oldestAlpha = alphaAttr.getX(0);
const newestAlpha = alphaAttr.getX(22);
assertClose(oldestAlpha, 0.0, 0.001, 'Oldest trail vertex alpha is 0.0');
assertClose(newestAlpha, 0.8, 0.001, 'Newest trail vertex alpha is 0.8');

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
assert(!scene.children.includes(player.trailMesh), 'player.trailMesh removed from scene');

// ----------------------------------------------------
// TEST 11: Edge Cases & Defensive Programming
// ----------------------------------------------------
console.log('\n--- TEST 11: Edge Cases & Defensive Programming ---');
// 1. Instantiation with null arguments
const standalonePlayer = new PlayerController(null, null);
assert(standalonePlayer.body instanceof CANNON.Body, 'Standalone player created without scene or physicsWorld');
assert(standalonePlayer.mesh instanceof THREE.Group, 'Standalone player mesh created');

// 2. fixedUpdate() with empty/undefined arguments
standalonePlayer.fixedUpdate();
assert(standalonePlayer.getSpeed() === 0, 'fixedUpdate with empty args runs without error');

// 3. Velocity NaN poisoning recovery
standalonePlayer.body.velocity.set(NaN, Infinity, -NaN);
standalonePlayer.fixedUpdate(1 / 60, {}, 0);
assert(Number.isFinite(standalonePlayer.body.velocity.x), 'velocity.x sanitized from NaN');
assert(Number.isFinite(standalonePlayer.body.velocity.y), 'velocity.y sanitized from NaN');
assert(Number.isFinite(standalonePlayer.body.velocity.z), 'velocity.z sanitized from NaN');

// 4. updateVisuals() with dt = 0 and negative dt
standalonePlayer.body.velocity.set(0, 0, -30);
standalonePlayer.updateVisuals(0, 0);
assert(Number.isFinite(standalonePlayer.mesh.rotation.y), 'rotation.y is finite after dt = 0');
assert(Number.isFinite(standalonePlayer.pivotGroup.rotation.x), 'rotation.x is finite after dt = 0');
assert(Number.isFinite(standalonePlayer.pivotGroup.rotation.z), 'rotation.z is finite after dt = 0');

standalonePlayer.updateVisuals(-0.5, 0);
assert(Number.isFinite(standalonePlayer.mesh.rotation.y), 'rotation.y is finite after negative dt');

// 5. Diagonal input (KeyW + KeyD) at cameraYaw = Math.PI / 4
standalonePlayer.reset(0, 0, 0);
standalonePlayer.fixedUpdate(1 / 60, { KeyW: true, KeyD: true }, Math.PI / 4);
const forceLen = standalonePlayer.body.force.length();
assertClose(forceLen, 70.0 * 14.0, 0.01, 'Diagonal air-strafe force magnitude is exactly m * a (980 N)');

// 6. Camera yaw wrapping (yaw = 7 * Math.PI)
standalonePlayer.updateVisuals(1 / 60, 7 * Math.PI);
assert(Number.isFinite(standalonePlayer.mesh.rotation.y), 'Yaw smoothly handles large angle multiples');

// 7. Rapid trail switching across 25 m/s threshold
let maxTrailLengthObserved = 0;
for (let i = 0; i < 50; i++) {
  standalonePlayer.body.velocity.set(0, 0, i % 2 === 0 ? -35 : -15);
  standalonePlayer.updateVisuals(1 / 60, 0);
  if (standalonePlayer.trailBuffer.length > maxTrailLengthObserved) {
    maxTrailLengthObserved = standalonePlayer.trailBuffer.length;
  }
}
assert(maxTrailLengthObserved <= 24, 'Trail buffer never exceeds 24 entries across 50 rapid threshold switches');

// 8. Double dispose idempotency
standalonePlayer.dispose();
standalonePlayer.dispose();
assert(true, 'Calling dispose() multiple times is safe and idempotent');

// ----------------------------------------------------
// TEST 12: Ribbon Trail Non-Distortion & Tangent Continuity
// ----------------------------------------------------
console.log('\n--- TEST 12: Ribbon Trail Non-Distortion & Tangent Continuity ---');
const testScene = new THREE.Scene();
const testWorld = new PhysicsWorld();
const trailTester = new PlayerController(testScene, testWorld);

// Move along +X at 40 m/s
trailTester.body.velocity.set(40, 0, 0);
for (let i = 0; i < 20; i++) {
  trailTester.body.position.x += 40 * (1 / 60);
  trailTester.updateVisuals(1 / 60, 0);
}

const posAttr = trailTester.trailGeometry.attributes.position;
// Vertex 22 (left) and 23 (right) at the newest segment right behind the avatar
const v22 = new THREE.Vector3(posAttr.getX(22), posAttr.getY(22), posAttr.getZ(22));
const v23 = new THREE.Vector3(posAttr.getX(23), posAttr.getY(23), posAttr.getZ(23));
const widthVec = new THREE.Vector3().subVectors(v23, v22);

// When traveling along +X, ribbon width vector MUST be perpendicular (along Z)
assertClose(Math.abs(widthVec.z), 0.36, 0.02, 'Width vector at player back is oriented along Z perpendicular to X motion');
assertClose(Math.abs(widthVec.x), 0.0, 0.02, 'Width vector at player back does NOT collapse/twist into X direction');

// ----------------------------------------------------
// TEST 13: 1-Frame Trail Visibility Glitch Prevention
// ----------------------------------------------------
console.log('\n--- TEST 13: 1-Frame Trail Visibility Glitch Prevention ---');
trailTester.reset(0, 3, 0);
assert(trailTester.trailMesh.visible === false, 'Trail mesh hidden initially');

// Step 1: 1 single frame at 40 m/s (1 point in buffer, cannot form a ribbon segment)
trailTester.body.velocity.set(0, 0, -40);
trailTester.updateVisuals(1 / 60, 0);
assert(trailTester.trailBuffer.length === 1, 'Trail buffer has 1 point on first frame');
assert(trailTester.trailMesh.visible === false, 'Trail mesh remains invisible on frame 1 (prevents uninitialized buffer flash)');

// Step 2: 2nd frame at 40 m/s (2 points in buffer, segment forms)
trailTester.body.position.z -= 0.66;
trailTester.updateVisuals(1 / 60, 0);
assert(trailTester.trailBuffer.length === 2, 'Trail buffer has 2 points on second frame');
assert(trailTester.trailMesh.visible === true, 'Trail mesh becomes visible once segment has >= 2 points');

// Step 3: Speed drops below 25 m/s, dissipates to 1 point
trailTester.body.velocity.set(0, 0, -10);
trailTester.updateVisuals(1 / 60, 0); // shifts 1 point, now length is 1
assert(trailTester.trailBuffer.length === 1, 'Trail buffer dissipates to 1 point');
assert(trailTester.trailMesh.visible === false, 'Trail mesh immediately hides when points < 2');

// ----------------------------------------------------
// TEST 14: Cannon Integration Vectors Reset
// ----------------------------------------------------
console.log('\n--- TEST 14: Cannon Integration Vectors Reset ---');
trailTester.body.velocity.set(25, 10, -50);
testWorld.step(1 / 60);
trailTester.reset(15, 25, 35);
assertClose(trailTester.body.position.x, 15, 0.001, 'body.position.x reset');
assertClose(trailTester.body.position.y, 25, 0.001, 'body.position.y reset');
assertClose(trailTester.body.position.z, 35, 0.001, 'body.position.z reset');
assertClose(trailTester.body.previousPosition.x, 15, 0.001, 'body.previousPosition.x reset');
assertClose(trailTester.body.interpolatedPosition.x, 15, 0.001, 'body.interpolatedPosition.x reset');
assertClose(trailTester.body.initPosition.x, 15, 0.001, 'body.initPosition.x reset');
assertClose(trailTester.body.initVelocity.length(), 0.0, 0.001, 'body.initVelocity zeroed');

// ----------------------------------------------------
// TEST 15: Muzzle Helper Methods
// ----------------------------------------------------
console.log('\n--- TEST 15: Muzzle Helper Methods ---');
trailTester.reset(0, 3, 0);
const leftMuzzWorld = trailTester.getLeftMuzzlePosition();
const rightMuzzWorld = trailTester.getRightMuzzlePosition();
const queriedLeft = trailTester.getMuzzlePosition('left');
const queriedRight = trailTester.getMuzzlePosition('right');

assertClose(leftMuzzWorld.x, -0.42, 0.01, 'getLeftMuzzlePosition X is -0.42');
assertClose(leftMuzzWorld.y, 2.9, 0.01, 'getLeftMuzzlePosition Y is 2.9');
assertClose(leftMuzzWorld.z, -0.25, 0.01, 'getLeftMuzzlePosition Z is -0.25');
assertClose(rightMuzzWorld.x, 0.42, 0.01, 'getRightMuzzlePosition X is 0.42');
assertClose(queriedLeft.x, leftMuzzWorld.x, 0.001, 'getMuzzlePosition("left") matches');
assertClose(queriedRight.x, rightMuzzWorld.x, 0.001, 'getMuzzlePosition("right") matches');

// ----------------------------------------------------
// TEST 16: Dynamic Banking Direction (Roll into Turns)
// ----------------------------------------------------
console.log('\n--- TEST 16: Dynamic Banking Direction (Roll into Turns) ---');
trailTester.reset(0, 3, 0);

// Turn right: velocity heading towards +X and -Z (yaw is negative)
trailTester.body.velocity.set(20, 0, -20);
trailTester.updateVisuals(1 / 60, 0);
assert(trailTester.pivotGroup.rotation.z < 0, 'Right turn produces negative roll (tilts avatar right into turn)');
assert(trailTester.pivotGroup.rotation.z >= -0.55, 'Right turn roll within -0.55 clamp');

// Turn left: velocity heading towards -X and -Z (yaw is positive)
trailTester.reset(0, 3, 0);
trailTester.body.velocity.set(-20, 0, -20);
trailTester.updateVisuals(1 / 60, 0);
assert(trailTester.pivotGroup.rotation.z > 0, 'Left turn produces positive roll (tilts avatar left into turn)');
assert(trailTester.pivotGroup.rotation.z <= 0.55, 'Left turn roll within +0.55 clamp');

// ----------------------------------------------------
// TEST 17: Arrow Key Controls & Vector Recycling
// ----------------------------------------------------
console.log('\n--- TEST 17: Arrow Key Controls & Vector Recycling ---');
trailTester.reset(0, 3, 0);
trailTester.fixedUpdate(1 / 60, { ArrowUp: true }, 0);
assert(trailTester.body.force.z < -900, 'ArrowUp produces forward force along -Z');

trailTester.reset(0, 3, 0);
trailTester.fixedUpdate(1 / 60, { ArrowRight: true }, 0);
assert(trailTester.body.force.x > 900, 'ArrowRight produces rightward force along +X');

// Verify Vector3 object pooling
assert(Array.isArray(trailTester._trailPool), '_trailPool exists on instance');
trailTester.body.velocity.set(0, 0, -40);
for (let i = 0; i < 30; i++) {
  trailTester.updateVisuals(1 / 60, 0);
}
assert(trailTester._trailPool.length > 0, 'Vector3 instances recycled into _trailPool when buffer max is reached');

trailTester.dispose();

console.log('\n====================================================');
console.log('🎉 ALL PLAYER CONTROLLER TESTS PASSED SUCCESSFULLY!');
console.log('====================================================');
