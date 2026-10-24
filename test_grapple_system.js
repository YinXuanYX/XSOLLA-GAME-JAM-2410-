import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './src/config.js';
import { PhysicsWorld } from './src/PhysicsWorld.js';
import { PlayerController } from './src/PlayerController.js';
import { GrappleSystem } from './src/GrappleSystem.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

function assertClose(a, b, tol = 1e-3, message = '') {
  if (Math.abs(a - b) > tol) {
    console.error(`❌ ASSERTION FAILED: ${message} (Expected ${b}, got ${a}, diff ${Math.abs(a - b)})`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('====================================================');
console.log('🧪 TESTING AERO-HOOK UNIFIED GRAPPLE SYSTEM (PHASE 1C)');
console.log('====================================================\n');

// Setup world, scene, camera, player, and grapple system
const scene = new THREE.Scene();
const physicsWorld = new PhysicsWorld();
const player = new PlayerController(scene, physicsWorld);
const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.BASE_FOV, 16 / 9, 0.1, 1000);
camera.position.set(0, 5, 5);
camera.lookAt(0, 5, -50);
camera.updateMatrixWorld(true);

const grapple = new GrappleSystem(scene, camera, player, CONFIG);

// ----------------------------------------------------
// TEST 1: Construction & Property Integrity
// ----------------------------------------------------
console.log('--- TEST 1: Construction & Property Integrity ---');
assert(grapple instanceof GrappleSystem, 'GrappleSystem instance created');
assert(grapple.hooks !== undefined, 'grapple.hooks exists');
assert(grapple.hooks.left !== undefined, 'grapple.hooks.left exists');
assert(grapple.hooks.right !== undefined, 'grapple.hooks.right exists');
assert(grapple.previewRing instanceof THREE.Mesh, 'grapple.previewRing is THREE.Mesh');
assert(grapple.previewRing.visible === false, 'grapple.previewRing is initially invisible');
assert(grapple.hooks.left.ropeMesh instanceof THREE.Mesh, 'hooks.left.ropeMesh is THREE.Mesh');
assert(grapple.hooks.left.clawMesh instanceof THREE.Mesh, 'hooks.left.clawMesh is THREE.Mesh');
assert(grapple.hooks.right.ropeMesh instanceof THREE.Mesh, 'hooks.right.ropeMesh is THREE.Mesh');
assert(grapple.hooks.right.clawMesh instanceof THREE.Mesh, 'hooks.right.clawMesh is THREE.Mesh');
assert(grapple.getActiveHookCount() === 0, 'Initial active hook count is 0');

// ----------------------------------------------------
// TEST 2: findTargetPoint (Direct & Magnetism Cone)
// ----------------------------------------------------
console.log('\n--- TEST 2: findTargetPoint (Direct & Magnetism Cone) ---');
// Create a grappleable wall mesh in front of camera
const wallGeo = new THREE.BoxGeometry(20, 20, 1);
const wallMat = new THREE.MeshBasicMaterial();
const wallMesh = new THREE.Mesh(wallGeo, wallMat);
wallMesh.position.set(0, 5, -35); // 40m in front of camera (camera is at z=5)
wallMesh.updateMatrixWorld(true);

const meshes = [wallMesh];
player.reset(0, 5, 0);

const targetDirect = grapple.findTargetPoint(meshes);
assert(targetDirect.hit === true, 'findTargetPoint finds wall in front of camera');
assert(targetDirect.assisted === false, 'Direct center hit is not assisted');
assertClose(targetDirect.distance, 34.5, 0.1, 'Hit distance from player at (0,5,0) to wall front face (z=-34.5) is ~34.5m');
assertClose(targetDirect.normal.z, 1.0, 0.01, 'Hit surface normal faces +Z toward camera');

// Test magnetism cone fallback: shift camera lookAt slightly off-target (1.5 degrees off center)
const coneCam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
coneCam.position.set(0, 0, 0);
coneCam.lookAt(0, 0, -100);
coneCam.updateMatrixWorld(true);

// Target slightly off center by ~1.5° (tan(1.5°) * 40m ≈ 1.047m)
const offsetTarget = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), wallMat);
offsetTarget.position.set(40 * Math.tan((1.5 * Math.PI) / 180), 0, -40);
offsetTarget.updateMatrixWorld(true);

grapple.setCamera(coneCam);
player.reset(0, 0, 0);

const targetCone = grapple.findTargetPoint([offsetTarget]);
assert(targetCone.hit === true, 'Magnetism cone catches off-center target');
assert(targetCone.assisted === true, 'Off-center catch returns assisted: true');

// Reset camera to standard
grapple.setCamera(camera);

// ----------------------------------------------------
// TEST 3: tryFireHook & Dual-Hook Acceleration States
// ----------------------------------------------------
console.log('\n--- TEST 3: tryFireHook & Dual-Hook Acceleration States ---');
player.reset(0, 5, 0);

let firedSide = null;
const success = grapple.tryFireHook('left', meshes, (side) => {
  firedSide = side;
});

assert(success === true, 'tryFireHook returns true on valid hit');
assert(firedSide === 'left', 'onSuccessCallback received "left" side argument');
assert(grapple.isHookActive('left') === true, 'isHookActive("left") returns true');
assert(grapple.getActiveHookCount() === 1, 'Active hook count is 1');
assert(grapple.hooks.left.ropeMesh.visible === true, 'Left rope mesh visible on fire');
assert(grapple.hooks.left.clawMesh.visible === true, 'Left claw mesh visible on fire');

// Check Single Hook pull force (PRD: 58.0 m/s^2 * 70kg = 4060 N)
grapple.fixedUpdate(1 / 60);
assertClose(grapple.hooks.left.lastPullForce, 4060, 1.0, 'Single hook applies 4060 N base pull force');
assertClose(player.body.force.z, -4060, 2.0, 'Force applied along -Z toward wall');

// Fire second hook (dual hook)
let rightFired = false;
grapple.tryFireHook('right', meshes, () => {
  rightFired = true;
});
assert(rightFired === true, 'Right hook fired successfully');
assert(grapple.getActiveHookCount() === 2, 'Active hook count is now 2');

// Check Dual Hook pull force (PRD: 37.7 m/s^2 * 70kg = 2639 N per hook, 1.3x combined)
player.body.force.set(0, 0, 0);
grapple.fixedUpdate(1 / 60);
assertClose(grapple.hooks.left.lastPullForce, 2639, 1.0, 'Dual hook left pull force is 2639 N');
assertClose(grapple.hooks.right.lastPullForce, 2639, 1.0, 'Dual hook right pull force is 2639 N');
assertClose(player.body.force.z, -5278, 2.0, 'Combined dual pull force is 5278 N (1.3x single hook)');

// ----------------------------------------------------
// TEST 4: Proximity Softening & Slack-Cancellation Force
// ----------------------------------------------------
console.log('\n--- TEST 4: Proximity Softening & Slack-Cancellation Force ---');
// Position player 1.25m from anchor (MIN_DETACH_DIST is 2.5m, so factor = 1.25 / 2.5 = 0.5)
grapple.releaseAll();
grapple.tryFireHook('left', meshes);

// Teleport player near anchor (anchor is at z = -34.5)
player.body.position.set(0, 5, -34.5 + 1.25);
player.body.velocity.set(0, 0, 0);
player.body.force.set(0, 0, 0);

grapple.fixedUpdate(1 / 60);
assertClose(grapple.hooks.left.lastPullForce, 4060 * 0.5, 5.0, 'Pull force softened by 50% when distance is 1.25m');

// Slack / Fall Cancellation Force test:
// Give player a backward velocity moving AWAY from anchor (v_radial < 0)
// anchor is at -34.5, player is at -33.25. Direction to anchor is -Z.
// If player moves +Z (speed 10 m/s), radial velocity is -10 m/s.
player.body.velocity.set(0, 0, 10);
player.body.force.set(0, 0, 0);

grapple.fixedUpdate(1 / 60);
// F_tension = m * (-v_radial * TENSION_DAMPING) = 70 * (10 * 8.5) = 5950 N
assertClose(grapple.hooks.left.lastTensionForce, 5950, 10.0, 'Slack cancellation force is 5950 N when falling/moving away at 10 m/s');

// ----------------------------------------------------
// TEST 5: Momentum Conservation on Release
// ----------------------------------------------------
console.log('\n--- TEST 5: Momentum Conservation on Release ---');
// Set a high velocity
player.body.velocity.set(15, -5, -45);
grapple.releaseHook('left');

assert(grapple.isHookActive('left') === false, 'Left hook inactive after releaseHook');
assert(grapple.hooks.left.ropeMesh.visible === false, 'Left rope mesh hidden on release');
assert(grapple.hooks.left.clawMesh.visible === false, 'Left claw mesh hidden on release');
assertClose(player.body.velocity.x, 15, 1e-4, 'Velocity X conserved 100% on release');
assertClose(player.body.velocity.y, -5, 1e-4, 'Velocity Y conserved 100% on release');
assertClose(player.body.velocity.z, -45, 1e-4, 'Velocity Z conserved 100% on release');

// ----------------------------------------------------
// TEST 6: updateVisuals (Preview Ring & 3D Ropes)
// ----------------------------------------------------
console.log('\n--- TEST 6: updateVisuals (Preview Ring & 3D Ropes) ---');
player.reset(0, 5, 0);
camera.position.set(0, 5, 5);
camera.lookAt(0, 5, -50);
camera.updateMatrixWorld(true);

// Update visuals against wall mesh
grapple.updateVisuals(meshes);

assert(grapple.previewRing.visible === true, 'Preview ring visible when aiming at wall');
assertClose(grapple.previewRing.position.z, -34.5 + 0.02, 0.05, 'Preview ring offset slightly along surface normal');

// Fire hook and check rope transform
grapple.tryFireHook('left', meshes);
grapple.updateVisuals(meshes);

const leftRope = grapple.hooks.left.ropeMesh;
assert(leftRope.visible === true, 'Active rope visible in updateVisuals');
assert(leftRope.scale.z > 20, 'Rope length scaled dynamically along Z');
assert(Number.isFinite(leftRope.position.x), 'Rope position X is finite');
assert(Number.isFinite(leftRope.position.y), 'Rope position Y is finite');
assert(Number.isFinite(leftRope.position.z), 'Rope position Z is finite');

// ----------------------------------------------------
// TEST 7: reset() and dispose()
// ----------------------------------------------------
console.log('\n--- TEST 7: reset() and dispose() ---');
grapple.reset();
assert(grapple.getActiveHookCount() === 0, 'Active hook count is 0 after reset');
assert(grapple.previewRing.visible === false, 'Preview ring hidden after reset');
assert(grapple.targetInfo.hit === false, 'targetInfo.hit is false after reset');

grapple.dispose();
assert(true, 'grapple.dispose() completes cleanly');

console.log('\n====================================================');
console.log('🎉 ALL UNIFIED GRAPPLE SYSTEM TESTS PASSED!');
console.log('====================================================');
