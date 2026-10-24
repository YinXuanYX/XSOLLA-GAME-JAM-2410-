/**
 * Integration Test for Phase 1B:
 * PlayerController + CameraController Interoperation & Physics Integration
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './src/config.js';
import { PhysicsWorld } from './src/PhysicsWorld.js';
import { PlayerController } from './src/PlayerController.js';
import { CameraController } from './src/CameraController.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

function assertClose(actual, expected, tolerance = 0.05, message = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(`❌ FAILED: ${message} (Expected ~${expected}, got ${actual}, diff ${diff} > ${tolerance})`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

console.log('====================================================');
console.log('🧪 TESTING PHASE 1B INTEGRATION (PLAYER + CAMERA)');
console.log('====================================================');

// Setup world, scene, camera, player, and camera controller
const scene = new THREE.Scene();
const physicsWorld = new PhysicsWorld();
const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.BASE_FOV, 16 / 9, 0.1, 1000);
const player = new PlayerController(scene, physicsWorld);
const cameraController = new CameraController(camera);

// ----------------------------------------------------
// TEST 1: Initial States & Spawning
// ----------------------------------------------------
console.log('\n--- TEST 1: Initial States & Spawning ---');
player.reset(0, 5, 0);
cameraController.reset(0, -0.15);

assert(player.mesh.position.y === 5, 'Player spawned at Y = 5');
assert(cameraController.yaw === 0, 'Camera yaw initialized to 0');
assert(cameraController.pitch === -0.15, 'Camera pitch initialized to -0.15');
assert(camera.fov === CONFIG.CAMERA.BASE_FOV, 'Camera FOV matches CONFIG.CAMERA.BASE_FOV (70)');

// ----------------------------------------------------
// TEST 2: Camera Following & Right-Shoulder Offset
// ----------------------------------------------------
console.log('\n--- TEST 2: Camera Following & Right-Shoulder Offset ---');
cameraController.update(1 / 60, player.mesh.position, player.getSpeed(), []);

// With yaw = 0, pitch = -0.15:
// right vector is (1, 0, 0), pivot is playerPos + (0, 1.8, 0) + 0.65 * (1, 0, 0) = (0.65, 6.8, 0)
// backward ray direction from yaw=0, pitch=-0.15:
// bx = sin(0)*cos(-0.15) = 0
// by = -sin(-0.15) > 0 (camera is slightly above and behind)
// bz = cos(0)*cos(-0.15) > 0 (pointing back along +Z)
assertClose(camera.position.x, 0.65, 0.05, 'Camera X is offset to right shoulder by 0.65m');
assert(camera.position.z > 5.0, 'Camera Z is behind player (> 5m)');
assert(camera.position.y > 6.8, 'Camera Y is elevated above shoulder pivot');

// ----------------------------------------------------
// TEST 3: Yaw-Driven Air-Strafe & Camera Sync
// ----------------------------------------------------
console.log('\n--- TEST 3: Yaw-Driven Air-Strafe & Camera Sync ---');
// Rotate camera 90 degrees right (yaw = -PI/2)
cameraController.yaw = -Math.PI / 2;
// Pressing KeyW with yaw = -PI/2 should strafe along +X in world space
player.reset(0, 5, 0);
player.fixedUpdate(1 / 60, { KeyW: true }, cameraController.yaw);

// Check force applied
assertClose(player.body.force.x, 70.0 * 14.0, 1.0, 'KeyW with -PI/2 yaw applies 980 N along +X');
assertClose(player.body.force.z, 0, 1.0, 'KeyW with -PI/2 yaw applies zero force along Z');

// ----------------------------------------------------
// TEST 4: Spring-Arm Anti-Clip Raycasting
// ----------------------------------------------------
console.log('\n--- TEST 4: Spring-Arm Anti-Clip Raycasting ---');
cameraController.reset(0, 0);
player.reset(0, 0, 0);

// Place a wall mesh 3.0 meters behind the player with front face at Z = 3.0 (plane or box centered at 3.25)
const wallGeometry = new THREE.BoxGeometry(10, 10, 0.5);
const wallMaterial = new THREE.MeshBasicMaterial();
const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
// Box depth is 0.5, so center at 3.25 puts front face at exactly Z = 3.0
wallMesh.position.set(0.65, 1.8, 3.25);
wallMesh.updateMatrixWorld(true);

const grappleableMeshes = [wallMesh];
cameraController.update(1 / 60, player.mesh.position, player.getSpeed(), grappleableMeshes);

// Unobstructed distance is 6.5m. But wall front face is at 3.0m.
// Expected distance = Math.max(1.2, 3.0 - 0.35) = 2.65m.
assertClose(camera.position.z, 2.65, 0.05, 'Camera distance shortened by wall obstacle to ~2.65m');

// ----------------------------------------------------
// TEST 5: Speed-Driven Dynamic FOV Scaling
// ----------------------------------------------------
console.log('\n--- TEST 5: Speed-Driven Dynamic FOV Scaling ---');
// At speed 10 m/s (below 15 m/s), FOV is base 70
player.body.velocity.set(0, 0, -10);
cameraController.update(1 / 60, player.mesh.position, player.getSpeed(), []);
assertClose(camera.fov, 70.0, 0.1, 'FOV is 70° at 10 m/s');

// At speed 45 m/s (midpoint of 15..75), FOV is ~84°
player.body.velocity.set(0, 0, -45);
// Let lerp settle over 30 frames
for (let i = 0; i < 30; i++) {
  cameraController.update(1 / 60, player.mesh.position, player.getSpeed(), []);
}
assertClose(camera.fov, 84.0, 1.5, 'FOV scales smoothly toward ~84° at 45 m/s');

// At max speed 75 m/s, FOV scales toward 98°
player.body.velocity.set(0, 0, -75);
for (let i = 0; i < 60; i++) {
  cameraController.update(1 / 60, player.mesh.position, player.getSpeed(), []);
}
assertClose(camera.fov, 98.0, 0.5, 'FOV expands to 98° at 75 m/s max velocity');

// ----------------------------------------------------
// TEST 6: Continuous Simulation Loop (60 Frames)
// ----------------------------------------------------
console.log('\n--- TEST 6: Continuous Simulation Loop (60 Frames) ---');
player.reset(0, 5, 0);
cameraController.reset(0, -0.15);

for (let frame = 0; frame < 60; frame++) {
  // Simulate air strafing forward
  player.fixedUpdate(1 / 60, { KeyW: true }, cameraController.yaw);
  physicsWorld.step(1 / 60);
  player.updateVisuals(1 / 60, cameraController.yaw);
  cameraController.update(1 / 60, player.mesh.position, player.getSpeed(), []);
}

assert(player.mesh.position.z < 0, 'Player progressed forward along -Z');
assert(player.getSpeed() > 0, 'Player built up speed');
assert(Number.isFinite(camera.position.x), 'Camera X is valid finite number');
assert(Number.isFinite(camera.position.y), 'Camera Y is valid finite number');
assert(Number.isFinite(camera.position.z), 'Camera Z is valid finite number');
assert(Number.isFinite(camera.fov), 'Camera FOV is valid finite number');

// Cleanup
player.dispose();
wallGeometry.dispose();
wallMaterial.dispose();

console.log('\n====================================================');
console.log('🎉 ALL PHASE 1B INTEGRATION TESTS PASSED!');
console.log('====================================================');
