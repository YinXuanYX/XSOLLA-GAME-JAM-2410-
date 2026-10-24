import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './src/config.js';
import { PhysicsWorld } from './src/PhysicsWorld.js';
import { PlayerController } from './src/PlayerController.js';
import { GrapplePhysics } from './src/GrapplePhysics.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

function assertClose(actual, expected, tolerance = 0.05, message = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(`❌ ASSERTION FAILED: ${message} (Expected ~${expected}, got ${actual}, diff=${diff} > ${tolerance})`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('====================================================');
console.log('🧪 TESTING AERO-HOOK GRAPPLE PHYSICS (PHASE 1C-2)');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST 1: Construction & 3D Visual Mesh Hierarchy
// ----------------------------------------------------
console.log('--- TEST 1: Construction & 3D Visual Meshes ---');
const scene = new THREE.Scene();
const physicsWorld = new PhysicsWorld();
const player = new PlayerController(scene, physicsWorld);
const grapple = new GrapplePhysics(scene, player);

assert(grapple.hooks !== undefined, 'grapple.hooks state container exists');
assert(grapple.hooks.left !== undefined, 'hooks.left exists');
assert(grapple.hooks.right !== undefined, 'hooks.right exists');
assert(grapple.hooks.left.active === false, 'Left hook initially inactive');
assert(grapple.hooks.right.active === false, 'Right hook initially inactive');
assert(grapple.hooks.left.anchor instanceof THREE.Vector3, 'Left hook anchor is Vector3');
assert(grapple.hooks.right.anchor instanceof THREE.Vector3, 'Right hook anchor is Vector3');

// Left hook visuals
const leftRope = grapple.hooks.left.ropeMesh;
const leftClaw = grapple.hooks.left.clawMesh;
assert(leftRope instanceof THREE.Mesh, 'Left rope is THREE.Mesh');
assert(leftRope.geometry instanceof THREE.CylinderGeometry, 'Left rope uses CylinderGeometry');
assert(leftRope.material.color.getHex() === CONFIG.COLORS.HOOK_LEFT, 'Left rope color matches CONFIG.COLORS.HOOK_LEFT (cyan)');
assert(leftRope.visible === false, 'Left rope initially invisible');
assert(scene.children.includes(leftRope), 'Left rope added to scene');

assert(leftClaw instanceof THREE.Mesh, 'Left claw is THREE.Mesh');
assert(leftClaw.geometry instanceof THREE.OctahedronGeometry, 'Left claw uses OctahedronGeometry');
assert(leftClaw.material.color.getHex() === CONFIG.COLORS.HOOK_LEFT, 'Left claw color matches CONFIG.COLORS.HOOK_LEFT');
assert(leftClaw.visible === false, 'Left claw initially invisible');
assert(scene.children.includes(leftClaw), 'Left claw added to scene');

// Right hook visuals
const rightRope = grapple.hooks.right.ropeMesh;
const rightClaw = grapple.hooks.right.clawMesh;
assert(rightRope instanceof THREE.Mesh, 'Right rope is THREE.Mesh');
assert(rightRope.geometry instanceof THREE.CylinderGeometry, 'Right rope uses CylinderGeometry');
assert(rightRope.material.color.getHex() === CONFIG.COLORS.HOOK_RIGHT, 'Right rope color matches CONFIG.COLORS.HOOK_RIGHT (orange)');
assert(rightRope.visible === false, 'Right rope initially invisible');
assert(scene.children.includes(rightRope), 'Right rope added to scene');

assert(rightClaw instanceof THREE.Mesh, 'Right claw is THREE.Mesh');
assert(rightClaw.geometry instanceof THREE.OctahedronGeometry, 'Right claw uses OctahedronGeometry');
assert(rightClaw.material.color.getHex() === CONFIG.COLORS.HOOK_RIGHT, 'Right claw color matches CONFIG.COLORS.HOOK_RIGHT');
assert(rightClaw.visible === false, 'Right claw initially invisible');
assert(scene.children.includes(rightClaw), 'Right claw added to scene');

// Surface Preview Ring
const previewRing = grapple.previewRing;
assert(previewRing instanceof THREE.Mesh, 'Preview ring is THREE.Mesh');
assert(previewRing.geometry instanceof THREE.RingGeometry, 'Preview ring uses RingGeometry');
assert(previewRing.material.transparent === true, 'Preview ring material is transparent');
assertClose(previewRing.material.opacity, 0.8, 0.01, 'Preview ring opacity is 0.8');
assert(previewRing.material.depthWrite === false, 'Preview ring depthWrite is false');
assert(previewRing.visible === false, 'Preview ring initially invisible');
assert(scene.children.includes(previewRing), 'Preview ring added to scene');

// ----------------------------------------------------
// TEST 2: Single Hook Pull Acceleration (58 m/s^2, 4060 N)
// ----------------------------------------------------
console.log('\n--- TEST 2: Single Hook Pull Acceleration ---');
player.reset(0, 0, 0);
player.body.force.set(0, 0, 0);
player.body.velocity.set(0, 0, 0);

let firedSide = null;
grapple.fireHook('left', new THREE.Vector3(0, 0, -30), new THREE.Vector3(0, 0, 1), (s) => {
  firedSide = s;
});

assert(firedSide === 'left', 'fireHook invokes onSuccessCallback with channel side');
assert(grapple.hooks.left.active === true, 'Left hook is active');
assert(grapple.getActiveCount() === 1, 'Active hook count is 1');
assertClose(grapple.hooks.left.anchor.z, -30, 0.01, 'Left hook anchor Z set to -30');
assert(grapple.hooks.left.ropeMesh.visible === true, 'Left rope mesh shown on fire');
assert(grapple.hooks.left.clawMesh.visible === true, 'Left claw mesh shown on fire');

// Fixed update step
grapple.fixedUpdate(1 / 60);

// With player at (0, 0, 0), anchor at (0, 0, -30), L = 30m (> 2.5m):
// u = (0, 0, -1).
// mass = 70.0 kg, single pull accel = 58.0 m/s^2.
// pull force = 70.0 * 58.0 = 4060.0 N along -Z.
assertClose(player.body.force.z, -4060.0, 1.0, 'Single hook pull applies 4060 N force along -Z');
assertClose(player.body.force.x, 0, 0.1, 'Zero lateral force along X');
assertClose(player.body.force.y, 0, 0.1, 'Zero vertical force along Y');
assertClose(grapple.hooks.left.lastPullForce, 4060.0, 1.0, 'Recorded lastPullForce is 4060 N');

// ----------------------------------------------------
// TEST 3: Dual Hook Pull Acceleration (37.7 m/s^2 each, 1.3x Combined)
// ----------------------------------------------------
console.log('\n--- TEST 3: Dual Hook Pull Acceleration ---');
player.reset(0, 0, 0);
player.body.force.set(0, 0, 0);
player.body.velocity.set(0, 0, 0);

// Fire right hook as well (both anchored along -Z at -30m)
grapple.fireHook('right', new THREE.Vector3(0, 0, -30), new THREE.Vector3(0, 0, 1));
assert(grapple.hooks.left.active === true, 'Left hook active');
assert(grapple.hooks.right.active === true, 'Right hook active');
assert(grapple.getActiveCount() === 2, 'Active hook count is 2');

grapple.fixedUpdate(1 / 60);

// Dual pull acceleration = 37.7 m/s^2 per hook
// Force per hook = 70.0 * 37.7 = 2639.0 N
assertClose(grapple.hooks.left.lastPullForce, 2639.0, 1.0, 'Dual hook left pull force is 2639 N');
assertClose(grapple.hooks.right.lastPullForce, 2639.0, 1.0, 'Dual hook right pull force is 2639 N');

// Total combined force applied to player body = 2639.0 * 2 = 5278.0 N
assertClose(player.body.force.z, -5278.0, 1.0, 'Combined dual pull force is 5278 N');

// Check 1.3x ratio relative to single hook
const combinedAccel = (37.7 * 2);
const singleAccel = 58.0;
assertClose(combinedAccel / singleAccel, 1.3, 0.01, 'Dual hook combined acceleration is 1.3x single hook');

// ----------------------------------------------------
// TEST 4: Proximity Softening (Distance < 2.5m)
// ----------------------------------------------------
console.log('\n--- TEST 4: Proximity Softening (Distance < 2.5m) ---');
grapple.releaseAll();
player.reset(0, 0, 0);
player.body.force.set(0, 0, 0);
player.body.velocity.set(0, 0, 0);

// Anchor at 1.25m (half of 2.5m MIN_DETACH_DIST)
grapple.fireHook('left', new THREE.Vector3(0, 0, -1.25));
grapple.fixedUpdate(1 / 60);

// With distance L = 1.25m, a_pull should scale by (1.25 / 2.5) = 0.5:
// Expected force = 4060 N * 0.5 = 2030 N
assertClose(player.body.force.z, -2030.0, 1.0, 'Pull force at 1.25m is scaled to 50% (2030 N)');
assertClose(grapple.hooks.left.lastPullForce, 2030.0, 1.0, 'lastPullForce records proximity softened 2030 N');

// Anchor at 0.5m (20% of 2.5m)
player.body.force.set(0, 0, 0);
grapple.fireHook('left', new THREE.Vector3(0, 0, -0.5));
grapple.fixedUpdate(1 / 60);
// Expected force = 4060 N * (0.5 / 2.5) = 812 N
assertClose(player.body.force.z, -812.0, 1.0, 'Pull force at 0.5m is scaled to 20% (812 N)');

// ----------------------------------------------------
// TEST 5: Slack / Fall Cancellation Force (Negative Radial Velocity)
// ----------------------------------------------------
console.log('\n--- TEST 5: Slack / Fall Cancellation Force ---');
grapple.releaseAll();
player.reset(0, 0, 0);
player.body.force.set(0, 0, 0);

// Anchor is high above along +Y at (0, 30, 0), so u = (0, 1, 0)
grapple.fireHook('left', new THREE.Vector3(0, 30, 0));

// Player is falling downward at -10 m/s: velocity = (0, -10, 0)
player.body.velocity.set(0, -10, 0);

grapple.fixedUpdate(1 / 60);

// v_radial = velocity . u = (0, -10, 0) . (0, 1, 0) = -10 m/s
// v_radial < 0: Falling away from anchor!
// F_tension = mass * (-v_radial * TENSION_DAMPING) * u
// F_tension = 70.0 * (10.0 * 8.5) * (0, 1, 0) = 5950.0 N along +Y
// F_pull = 70.0 * 58.0 * (0, 1, 0) = 4060.0 N along +Y
// F_total = 4060 + 5950 = 10010.0 N along +Y
assertClose(grapple.hooks.left.lastRadialVelocity, -10.0, 0.01, 'lastRadialVelocity is -10.0 m/s');
assertClose(grapple.hooks.left.lastTensionForce, 5950.0, 1.0, 'lastTensionForce is 5950 N');
assertClose(player.body.force.y, 10010.0, 1.0, 'Total applied force is 10010 N (pull + slack-cancellation tension)');

// ----------------------------------------------------
// TEST 6: No Slack Cancellation When Moving Toward Anchor (v_radial >= 0)
// ----------------------------------------------------
console.log('\n--- TEST 6: No Slack Cancellation When Moving Toward Anchor ---');
player.body.force.set(0, 0, 0);

// Player is moving upward toward anchor: velocity = (0, +12, 0)
player.body.velocity.set(0, 12, 0);

grapple.fixedUpdate(1 / 60);

// v_radial = +12.0 >= 0: No tension force!
assertClose(grapple.hooks.left.lastRadialVelocity, 12.0, 0.01, 'lastRadialVelocity is +12.0 m/s');
assertClose(grapple.hooks.left.lastTensionForce, 0.0, 0.01, 'Tension force is 0 when moving toward anchor');
assertClose(player.body.force.y, 4060.0, 1.0, 'Only base pull force 4060 N is applied');

// Tangential movement (perpendicular to rope vector)
player.body.force.set(0, 0, 0);
player.body.velocity.set(20, 0, 0); // Along +X, while u is along +Y -> dot product = 0

grapple.fixedUpdate(1 / 60);
assertClose(grapple.hooks.left.lastRadialVelocity, 0.0, 0.01, 'Radial velocity is 0 for pure tangential velocity');
assertClose(grapple.hooks.left.lastTensionForce, 0.0, 0.01, 'Tension force is 0 when radial velocity is 0');
assertClose(player.body.force.y, 4060.0, 1.0, 'Only base pull force 4060 N is applied');

// ----------------------------------------------------
// TEST 7: Momentum Conservation on Release
// ----------------------------------------------------
console.log('\n--- TEST 7: Momentum Conservation on Release ---');
// Give player high dynamic momentum
player.body.velocity.set(18.5, 32.0, -54.2);

grapple.releaseHook('left');

assert(grapple.hooks.left.active === false, 'Left hook is inactive after release');
assert(grapple.hooks.left.ropeMesh.visible === false, 'Left rope hidden after release');
assert(grapple.hooks.left.clawMesh.visible === false, 'Left claw hidden after release');

// Velocity must be completely preserved (100% conservation)
assertClose(player.body.velocity.x, 18.5, 1e-6, 'Velocity X strictly conserved on release');
assertClose(player.body.velocity.y, 32.0, 1e-6, 'Velocity Y strictly conserved on release');
assertClose(player.body.velocity.z, -54.2, 1e-6, 'Velocity Z strictly conserved on release');

// ----------------------------------------------------
// TEST 8: 3D Rope Midpoint Transform, Scale & Claw Positioning
// ----------------------------------------------------
console.log('\n--- TEST 8: 3D Rope Transforms & Scaling ---');
player.reset(0, 0, 0);
// Player left muzzle is at (-0.42, -0.1, -0.25)
const targetAnchor = new THREE.Vector3(10, 20, -30);
grapple.fireHook('left', targetAnchor);

// Update visuals
grapple.updateVisuals(null);

const muzzleScratch = new THREE.Vector3();
player.getLeftMuzzlePosition(muzzleScratch);

const ropeMesh = grapple.hooks.left.ropeMesh;
const clawMesh = grapple.hooks.left.clawMesh;

// 1. Claw position must match anchor point exactly
assertClose(clawMesh.position.x, targetAnchor.x, 0.001, 'Claw X matches anchor X');
assertClose(clawMesh.position.y, targetAnchor.y, 0.001, 'Claw Y matches anchor Y');
assertClose(clawMesh.position.z, targetAnchor.z, 0.001, 'Claw Z matches anchor Z');

// 2. Rope position must be at midpoint of muzzle and anchor
const expectedMidX = (muzzleScratch.x + targetAnchor.x) * 0.5;
const expectedMidY = (muzzleScratch.y + targetAnchor.y) * 0.5;
const expectedMidZ = (muzzleScratch.z + targetAnchor.z) * 0.5;
assertClose(ropeMesh.position.x, expectedMidX, 0.001, 'Rope position X is exact midpoint');
assertClose(ropeMesh.position.y, expectedMidY, 0.001, 'Rope position Y is exact midpoint');
assertClose(ropeMesh.position.z, expectedMidZ, 0.001, 'Rope position Z is exact midpoint');

// 3. Rope scale along Z must equal distance
const expectedDist = muzzleScratch.distanceTo(targetAnchor);
assertClose(ropeMesh.scale.z, expectedDist, 0.01, 'Rope scale Z matches distance between muzzle and anchor');
assertClose(ropeMesh.scale.x, 1.0, 0.001, 'Rope scale X is 1.0');
assertClose(ropeMesh.scale.y, 1.0, 0.001, 'Rope scale Y is 1.0');

// ----------------------------------------------------
// TEST 9: Surface Preview Ring Placement and Normal Orientation
// ----------------------------------------------------
console.log('\n--- TEST 9: Surface Preview Ring Placement and Normal Alignment ---');

// Hit wall facing +Z (normal = 0, 0, 1)
const hitInfo1 = {
  hit: true,
  point: new THREE.Vector3(5, 12, -40),
  normal: new THREE.Vector3(0, 0, 1),
};
grapple.updateVisuals(hitInfo1);

assert(grapple.previewRing.visible === true, 'Preview ring is visible on valid hit');
// Position offset by normal * 0.02
assertClose(grapple.previewRing.position.x, 5.0, 0.001, 'Preview ring X matches hit point X');
assertClose(grapple.previewRing.position.y, 12.0, 0.001, 'Preview ring Y matches hit point Y');
assertClose(grapple.previewRing.position.z, -40 + 0.02, 0.001, 'Preview ring Z offset by +0.02 normal');

// Ring normal check: (0, 0, 1) rotated by quaternion should align with normal (0, 0, 1)
const rotatedNormal1 = new THREE.Vector3(0, 0, 1).applyQuaternion(grapple.previewRing.quaternion);
assertClose(rotatedNormal1.x, 0, 0.01, 'Aligned ring normal X is 0');
assertClose(rotatedNormal1.y, 0, 0.01, 'Aligned ring normal Y is 0');
assertClose(rotatedNormal1.z, 1.0, 0.01, 'Aligned ring normal Z is 1.0');

// Hit ground facing +Y (normal = 0, 1, 0)
const hitInfo2 = {
  hit: true,
  point: new THREE.Vector3(0, -2, -20),
  normal: new THREE.Vector3(0, 1, 0),
};
grapple.updateVisuals(hitInfo2);
assertClose(grapple.previewRing.position.y, -2 + 0.02, 0.001, 'Preview ring Y offset by +0.02 along +Y normal');
const rotatedNormal2 = new THREE.Vector3(0, 0, 1).applyQuaternion(grapple.previewRing.quaternion);
assertClose(rotatedNormal2.x, 0, 0.01, 'Ring normal rotated to +Y: X is 0');
assertClose(rotatedNormal2.y, 1.0, 0.01, 'Ring normal rotated to +Y: Y is 1.0');
assertClose(rotatedNormal2.z, 0, 0.01, 'Ring normal rotated to +Y: Z is 0');

// Hit miss: ring becomes invisible
grapple.updateVisuals({ hit: false });
assert(grapple.previewRing.visible === false, 'Preview ring hidden when hit is false');
grapple.updateVisuals(null);
assert(grapple.previewRing.visible === false, 'Preview ring hidden when targetInfo is null');

// ----------------------------------------------------
// TEST 10: Multi-frame Simulation Loop
// ----------------------------------------------------
console.log('\n--- TEST 10: Multi-frame Simulation Loop ---');
grapple.releaseAll();
player.reset(0, 10, 0);
physicsWorld.world.gravity.set(0, -24.0, 0);

// Attach grapple hook high ahead at (0, 30, -50)
grapple.fireHook('left', new THREE.Vector3(0, 30, -50));

// Step physics world and grapple physics for 30 steps
for (let step = 0; step < 30; step++) {
  grapple.fixedUpdate(1 / 60);
  physicsWorld.step(1 / 60);
  grapple.updateVisuals(null);
}

// Player should be accelerated forward along -Z and upward against gravity
assert(player.body.position.z < -2.0, 'Player progressed forward along -Z while grappled');
assert(player.getSpeed() > 5.0, 'Player built up substantial speed while grappled');
assert(player.body.velocity.z < -5.0, 'Player forward velocity along -Z is negative');

// ----------------------------------------------------
// TEST 11: Cleanup & Dispose
// ----------------------------------------------------
console.log('\n--- TEST 11: Cleanup & Dispose ---');
grapple.dispose();

assert(grapple.hooks.left.active === false, 'Left hook inactive after dispose');
assert(grapple.hooks.right.active === false, 'Right hook inactive after dispose');
assert(grapple.hooks.left.ropeMesh === null, 'Left ropeMesh null after dispose');
assert(grapple.hooks.left.clawMesh === null, 'Left clawMesh null after dispose');
assert(grapple.hooks.right.ropeMesh === null, 'Right ropeMesh null after dispose');
assert(grapple.hooks.right.clawMesh === null, 'Right clawMesh null after dispose');
assert(grapple.previewRing === null, 'previewRing null after dispose');

// ----------------------------------------------------
// TEST 12: Edge Cases & Boundary Values
// ----------------------------------------------------
console.log('\n--- TEST 12: Edge Cases & Boundary Values ---');
const edgeScene = new THREE.Scene();
const edgePhysicsWorld = new PhysicsWorld();
const edgePlayer = new PlayerController(edgeScene, edgePhysicsWorld);
const edgeGrapple = new GrapplePhysics(edgeScene, edgePlayer);

// 1. Plain object targetPoint & targetNormal (not Vector3 instances)
edgeGrapple.fireHook('left', { x: 12, y: 34, z: -56 }, { x: 0, y: 1, z: 0 });
assert(edgeGrapple.hooks.left.active === true, 'Plain object targetPoint activates hook');
assertClose(edgeGrapple.hooks.left.anchor.x, 12, 0.001, 'Plain object X copied');
assertClose(edgeGrapple.hooks.left.anchor.y, 34, 0.001, 'Plain object Y copied');
assertClose(edgeGrapple.hooks.left.anchor.z, -56, 0.001, 'Plain object Z copied');

// 2. L < 1e-4 (Player at exact anchor point)
edgePlayer.reset(12, 34, -56);
edgePlayer.body.force.set(0, 0, 0);
edgePlayer.body.velocity.set(0, 0, 0);
edgeGrapple.fixedUpdate(1 / 60);
assert(Number.isFinite(edgePlayer.body.force.x) && !Number.isNaN(edgePlayer.body.force.x), 'Force X is finite when L < 1e-4');
assert(Number.isFinite(edgePlayer.body.force.y) && !Number.isNaN(edgePlayer.body.force.y), 'Force Y is finite when L < 1e-4');
assert(Number.isFinite(edgePlayer.body.force.z) && !Number.isNaN(edgePlayer.body.force.z), 'Force Z is finite when L < 1e-4');
assert(edgePlayer.body.force.length() === 0, 'No divide-by-zero force produced when player is at anchor');

// 3. Invalid side string ignored safely
edgeGrapple.fireHook('middle', { x: 0, y: 0, z: 0 });
edgeGrapple.releaseHook('middle');
assert(edgeGrapple.hooks.middle === undefined, 'Invalid side string safely ignored');

// 4. FixedUpdate when no player is attached
const orphanGrapple = new GrapplePhysics(null, null);
orphanGrapple.fireHook('left', new THREE.Vector3(0, 10, 0));
try {
  orphanGrapple.fixedUpdate(1 / 60);
  assert(true, 'fixedUpdate survives null player/body gracefully');
} catch (e) {
  assert(false, `fixedUpdate threw on null player: ${e.message}`);
}

// 5. Anti-parallel surface normal (-Z)
const hitInfoAntiParallel = {
  hit: true,
  point: new THREE.Vector3(0, 5, 10),
  normal: new THREE.Vector3(0, 0, -1),
};
edgeGrapple.updateVisuals(hitInfoAntiParallel);
const antiRotatedNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(edgeGrapple.previewRing.quaternion);
assertClose(antiRotatedNormal.z, -1.0, 0.01, 'Ring aligns cleanly with anti-parallel normal (0, 0, -1)');

// 6. Idempotent dispose
edgeGrapple.dispose();
edgeGrapple.dispose();
orphanGrapple.dispose();
assert(true, 'Idempotent dispose completes without throwing');

// ----------------------------------------------------
// TEST 13: Spurious Torque, Telemetry Reset & Robustness
// ----------------------------------------------------
console.log('\n--- TEST 13: Spurious Torque, Telemetry Reset & Robustness ---');

// 1. Spurious Torque Elimination
const torqueScene = new THREE.Scene();
const torquePW = new PhysicsWorld();
const torquePlayer = new PlayerController(torqueScene, torquePW);
torquePlayer.reset(0, 10, 0); // elevated off origin
const torqueGrapple = new GrapplePhysics(torqueScene, torquePlayer);

torqueGrapple.fireHook('left', new THREE.Vector3(0, 30, -50));
torqueGrapple.fixedUpdate(1 / 60);

assert(torquePlayer.body.force.length() > 0, 'Pull force is applied to player body');
assertClose(torquePlayer.body.torque.x, 0, 1e-4, 'Torque X is strictly 0 (no artificial rotational torque)');
assertClose(torquePlayer.body.torque.y, 0, 1e-4, 'Torque Y is strictly 0');
assertClose(torquePlayer.body.torque.z, 0, 1e-4, 'Torque Z is strictly 0');

// 2. Flexible 3-Argument fireHook(side, targetPoint, callback)
let flexCallbackCalled = false;
let flexSide = null;
torqueGrapple.releaseAll();
torqueGrapple.fireHook('right', new THREE.Vector3(10, 5, -20), (s) => {
  flexCallbackCalled = true;
  flexSide = s;
});
assert(flexCallbackCalled === true, '3-argument fireHook correctly calls callback');
assert(flexSide === 'right', 'Callback receives correct side parameter');

// 3. Immediate Rope Mesh Positioning on fireHook (No 1-frame origin flash)
const rightRopeMesh = torqueGrapple.hooks.right.ropeMesh;
assert(rightRopeMesh.visible === true, 'Rope mesh is visible right after fireHook');
assert(rightRopeMesh.position.length() > 0, 'Rope mesh is immediately positioned away from origin (0, 0, 0)');
assertClose(rightRopeMesh.position.x, (0.42 + 10) * 0.5, 0.1, 'Rope mesh X immediately positioned at midpoint');

// 4. Stale Telemetry Reset when L < 1e-4
const resetScene = new THREE.Scene();
const resetPW = new PhysicsWorld();
const resetPlayer = new PlayerController(resetScene, resetPW);
resetPlayer.reset(0, 0, -10);
const resetGrapple = new GrapplePhysics(resetScene, resetPlayer);
resetGrapple.fireHook('left', new THREE.Vector3(0, 0, 0));
resetGrapple.fixedUpdate(1 / 60);
assert(resetGrapple.hooks.left.lastPullForce > 0, 'Pull force non-zero at 10m');

// Move player to exact anchor point
resetPlayer.reset(0, 0, 0);
resetGrapple.fixedUpdate(1 / 60);
assert(resetGrapple.hooks.left.lastPullForce === 0, 'lastPullForce reset to 0 at anchor (no stale telemetry)');
assert(resetGrapple.hooks.left.lastForce.length() === 0, 'lastForce reset to (0, 0, 0) at anchor');

// 5. Non-Body Player Visual Muzzle Offsets
const meshPlayer = {
  mesh: { position: new THREE.Vector3(50, 10, -100) },
};
const meshGrapple = new GrapplePhysics(null, meshPlayer);
meshGrapple.fireHook('left', new THREE.Vector3(50, 10, -130));
meshGrapple.updateVisuals(null);
const meshRope = meshGrapple.hooks.left.ropeMesh;
assertClose(meshRope.position.x, (50 - 0.42 + 50) * 0.5, 0.1, 'Mesh player rope X is correctly positioned near 50 (not collapsed to 25)');
assertClose(meshRope.position.y, (10 - 0.1 + 10) * 0.5, 0.1, 'Mesh player rope Y is correctly positioned near 10 (not collapsed to 5)');
assertClose(meshRope.position.z, (-100 - 130) * 0.5, 0.1, 'Mesh player rope Z is at midpoint -115 (not collapsed to -65)');

// 6. Preview Ring Malformed Normal Robustness
const previewGrapple = new GrapplePhysics();
previewGrapple.updateVisuals({ hit: true, point: new THREE.Vector3(5, 5, -10), normal: {} });
assert(previewGrapple.previewRing.visible === true, 'Preview ring visible with empty normal object');
assert(Number.isFinite(previewGrapple.previewRing.position.x), 'Preview ring position X is finite');
assert(Number.isFinite(previewGrapple.previewRing.position.y), 'Preview ring position Y is finite');
assert(Number.isFinite(previewGrapple.previewRing.position.z), 'Preview ring position Z is finite');
assert(Number.isFinite(previewGrapple.previewRing.quaternion.x), 'Preview ring quaternion X is finite');

// 7. Preview Ring Non-finite Coordinates Rejected
previewGrapple.updateVisuals({ hit: true, point: { x: NaN, y: 0, z: 0 } });
assert(previewGrapple.previewRing.visible === false, 'Preview ring hidden when point contains NaN');

// 8. setScene and setPlayer Lifecycle Helpers
const newScene = new THREE.Scene();
previewGrapple.setScene(newScene);
assert(newScene.children.includes(previewGrapple.previewRing), 'previewRing transferred to newScene');
assert(newScene.children.includes(previewGrapple.hooks.left.ropeMesh), 'Left rope transferred to newScene');

// Cleanup
torqueGrapple.dispose();
resetGrapple.dispose();
meshGrapple.dispose();
previewGrapple.dispose();

console.log('\n====================================================');
console.log('🎉 ALL AERO-HOOK GRAPPLE PHYSICS TESTS PASSED!');
console.log('====================================================');


