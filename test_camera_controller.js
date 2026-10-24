import * as THREE from 'three';
import { CameraController } from './src/CameraController.js';
import { CONFIG } from './src/config.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

function assertClose(a, b, tol = 1e-4, message = '') {
  if (Math.abs(a - b) > tol) {
    console.error(`❌ ASSERTION FAILED: ${message} (Expected ${b}, got ${a})`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('====================================================');
console.log('🧪 TESTING AERO-HOOK CAMERA CONTROLLER (PHASE 1B-2)');
console.log('====================================================\n');

// Mock DOM environment for Node.js
class MockElement {
  constructor(name = 'element') {
    this.name = name;
    this.children = [];
  }

  contains(el) {
    return el === this || this.children.includes(el);
  }

  requestPointerLock() {
    document.pointerLockElement = this;
    document.dispatchEvent('pointerlockchange', {});
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this.pointerLockElement = null;
    this.listeners = {};
  }

  addEventListener(type, cb) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  removeEventListener(type, cb) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(fn => fn !== cb);
  }

  dispatchEvent(type, event) {
    if (this.listeners[type]) {
      for (const cb of this.listeners[type]) {
        cb(event);
      }
    }
  }

  exitPointerLock() {
    this.pointerLockElement = null;
    this.dispatchEvent('pointerlockchange', {});
  }
}

globalThis.document = new MockDocument();

// 1. Construction and Default State
console.log('--- TEST 1: Construction & Defaults ---');
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
const domElement = new MockElement('canvas');
const camCtrl = new CameraController(camera, domElement);

assert(camCtrl.yaw === 0, 'Initial yaw is 0');
assertClose(camCtrl.pitch, -0.15, 1e-4, 'Initial pitch is -0.15');
assert(camCtrl.isLocked === false, 'Initial isLocked is false');
assert(camera.fov === CONFIG.CAMERA.BASE_FOV, `Camera FOV initialized to CONFIG.CAMERA.BASE_FOV (${CONFIG.CAMERA.BASE_FOV})`);
assert(camCtrl.raycaster instanceof THREE.Raycaster, 'Raycaster instantiated');
assertClose(camCtrl.raycaster.far, CONFIG.CAMERA.ARM_DISTANCE, 1e-4, `Raycaster far is ARM_DISTANCE (${CONFIG.CAMERA.ARM_DISTANCE})`);
assertClose(camCtrl.currentDistance, CONFIG.CAMERA.ARM_DISTANCE, 1e-4, 'Initial currentDistance is ARM_DISTANCE');

// Verify initial unit vectors are already initialized
const initFwd = camCtrl.getForwardVector();
const initBwd = camCtrl.getBackwardVector();
const initRight = camCtrl.getRightVector();
assertClose(initFwd.length(), 1.0, 1e-4, 'Initial forward vector has unit length 1.0 (not 0)');
assertClose(initBwd.length(), 1.0, 1e-4, 'Initial backward vector has unit length 1.0 (not 0)');
assertClose(initRight.length(), 1.0, 1e-4, 'Initial right vector has unit length 1.0 (not 0)');
assertClose(camera.quaternion.x, camCtrl._quat.x, 1e-4, 'Camera quaternion X synced on construction');
assertClose(camera.quaternion.w, camCtrl._quat.w, 1e-4, 'Camera quaternion W synced on construction');

// 2. Mouse Move & PointerLock Interaction
console.log('\n--- TEST 2: PointerLock & Mouse Move ---');
// Dispatch mouse move without lock -> angles should NOT change
document.dispatchEvent('mousemove', { movementX: 100, movementY: 50 });
assert(camCtrl.yaw === 0, 'Yaw unchanged when pointer not locked');
assertClose(camCtrl.pitch, -0.15, 1e-4, 'Pitch unchanged when pointer not locked');

// Engage pointer lock on domElement
document.pointerLockElement = domElement;
document.dispatchEvent('pointerlockchange', {});
assert(camCtrl.isLocked === true, 'isLocked is true after pointerlockchange with domElement');

// Dispatch mouse move: X moves right (+100px), Y moves down (+50px)
document.dispatchEvent('mousemove', { movementX: 100, movementY: 50 });
const expectedYaw1 = 0 - 100 * CONFIG.CAMERA.SENSITIVITY;
const expectedPitch1 = -0.15 - 50 * CONFIG.CAMERA.SENSITIVITY;
assertClose(camCtrl.yaw, expectedYaw1, 1e-5, 'Yaw updated correctly with sensitivity');
assertClose(camCtrl.pitch, expectedPitch1, 1e-5, 'Pitch updated correctly with sensitivity');

// Test pitch clamping
document.dispatchEvent('mousemove', { movementX: 0, movementY: 50000 });
assertClose(camCtrl.pitch, CONFIG.CAMERA.PITCH_MIN, 1e-5, 'Pitch clamped to PITCH_MIN on large downward move');

document.dispatchEvent('mousemove', { movementX: 0, movementY: -100000 });
assertClose(camCtrl.pitch, CONFIG.CAMERA.PITCH_MAX, 1e-5, 'Pitch clamped to PITCH_MAX on large upward move');

// Release lock
document.pointerLockElement = null;
document.dispatchEvent('pointerlockchange', {});
assert(camCtrl.isLocked === false, 'isLocked is false after pointer lock release');

// Test controller instantiated without domElement (accepts any document pointer lock)
const camCtrlNoDom = new CameraController(camera);
const anyCanvas = new MockElement('child-canvas');
document.pointerLockElement = anyCanvas;
document.dispatchEvent('pointerlockchange', {});
assert(camCtrlNoDom.isLocked === true, 'Controller with no domElement accepts any active pointerLockElement');
document.dispatchEvent('mousemove', { movementX: 40, movementY: 10 });
assertClose(camCtrlNoDom.yaw, 0 - 40 * CONFIG.CAMERA.SENSITIVITY, 1e-5, 'Controller with no domElement rotates when locked');
document.pointerLockElement = null;
document.dispatchEvent('pointerlockchange', {});
camCtrlNoDom.dispose();

// Test container with child element pointerlock
const containerEl = new MockElement('container');
const nestedCanvas = new MockElement('nested-canvas');
containerEl.children.push(nestedCanvas);
const camCtrlContainer = new CameraController(camera, containerEl);
document.pointerLockElement = nestedCanvas;
document.dispatchEvent('pointerlockchange', {});
assert(camCtrlContainer.isLocked === true, 'Controller locks when child canvas of domElement is locked');
document.dispatchEvent('pointerlockerror', {});
assert(camCtrlContainer.isLocked === false, 'Controller unlocks on pointerlockerror');
camCtrlContainer.dispose();

// 3. Reset Method
console.log('\n--- TEST 3: reset() Method ---');
camera.fov = 95;
camCtrl.reset();
assert(camCtrl.yaw === 0, 'reset() restores yaw = 0');
assertClose(camCtrl.pitch, -0.12, 1e-4, 'reset() restores pitch = -0.12');
assert(camera.fov === CONFIG.CAMERA.BASE_FOV, `reset() restores camera.fov = ${CONFIG.CAMERA.BASE_FOV}`);
assertClose(camCtrl.currentDistance, CONFIG.CAMERA.ARM_DISTANCE, 1e-4, 'reset() restores currentDistance');
assertClose(camCtrl.getForwardVector().length(), 1.0, 1e-4, 'reset() immediately updates forward vector');

camCtrl.reset(1.5, -0.25);
assertClose(camCtrl.yaw, 1.5, 1e-4, 'reset(1.5, -0.25) sets custom yaw');
assertClose(camCtrl.pitch, -0.25, 1e-4, 'reset(1.5, -0.25) sets custom pitch');

// 4. Update Geometry & Camera Positioning (Free Air)
console.log('\n--- TEST 4: Pivot & Camera Positioning without Obstacles ---');
camCtrl.reset(0, 0); // Yaw 0, Pitch 0 -> looking along -Z
const playerPos = new THREE.Vector3(10, 5, -20);
camCtrl.update(1 / 60, playerPos, 0, []);

const pivot = camCtrl.getPivot();
assertClose(pivot.x, playerPos.x + CONFIG.CAMERA.SHOULDER_OFFSET, 1e-4, 'Pivot X includes right shoulder offset');
assertClose(pivot.y, playerPos.y + CONFIG.CAMERA.ARM_HEIGHT, 1e-4, 'Pivot Y includes arm height');
assertClose(pivot.z, playerPos.z, 1e-4, 'Pivot Z matches player Z when yaw is 0');

// Camera backward vector should be (0, 0, 1) when yaw=0, pitch=0
const backward = camCtrl.getBackwardVector();
assertClose(backward.x, 0, 1e-4, 'Backward X is 0');
assertClose(backward.y, 0, 1e-4, 'Backward Y is 0');
assertClose(backward.z, 1, 1e-4, 'Backward Z is +1');

// Camera position should be pivot + backward * 6.5
assertClose(camera.position.x, pivot.x, 1e-4, 'Camera X matches pivot X');
assertClose(camera.position.y, pivot.y, 1e-4, 'Camera Y matches pivot Y');
assertClose(camera.position.z, pivot.z + CONFIG.CAMERA.ARM_DISTANCE, 1e-4, 'Camera Z is pivot Z + ARM_DISTANCE');

// 5. Wall Anti-Clip Raycast
console.log('\n--- TEST 5: Wall Anti-Clip Raycasting ---');
// Create a wall mesh behind the player
// Pivot is at (10.65, 6.8, -20). Camera backward is +Z.
// Let's place a wall at Z = -16.0 (4.0m behind pivot along +Z)
const wallGeo = new THREE.BoxGeometry(10, 10, 1);
const wallMat = new THREE.MeshBasicMaterial();
const wallMesh = new THREE.Mesh(wallGeo, wallMat);
wallMesh.position.set(pivot.x, pivot.y, pivot.z + 4.0); // 4.0m away from pivot along +Z
wallMesh.updateMatrixWorld(true);

const grappleableMeshes = [wallMesh];
camCtrl.update(1 / 60, playerPos, 0, grappleableMeshes);

// Hit distance should be approximately 4.0m - half thickness (0.5m) = 3.5m
// Expected dist = Math.max(1.2, d_hit - 0.35) = 3.5 - 0.35 = 3.15m
const hitDistance = camCtrl.getDistance();
assert(hitDistance < CONFIG.CAMERA.ARM_DISTANCE, `Camera pulled in due to wall hit (${hitDistance.toFixed(2)}m < 6.5m)`);
assertClose(hitDistance, 3.5 - 0.35, 0.05, `Camera distance matches d_hit - 0.35 buffer (${hitDistance.toFixed(2)}m)`);
assertClose(camera.position.z, pivot.z + hitDistance, 0.05, 'Camera position Z respects adjusted distance');

// Test close obstacle minimum distance clamping (1.2m)
wallMesh.position.set(pivot.x, pivot.y, pivot.z + 1.0); // very close wall (0.5m front face)
wallMesh.updateMatrixWorld(true);
camCtrl.update(1 / 60, playerPos, 0, grappleableMeshes);
assertClose(camCtrl.getDistance(), 1.2, 1e-4, 'Camera distance clamped to minimum 1.2m on near collision');

// 6. Dynamic FOV Scaling & dt=0 Protection
console.log('\n--- TEST 6: Dynamic Speed FOV Scaling ---');
camCtrl.reset(0, 0);

// dt = 0 must NOT advance FOV
camCtrl.update(0, playerPos, 75.0, []);
assertClose(camera.fov, CONFIG.CAMERA.BASE_FOV, 1e-4, 'dt = 0 does NOT advance FOV lerp');

// Low speed (<= 15 m/s) -> FOV stays at BASE_FOV (70)
for (let i = 0; i < 30; i++) {
  camCtrl.update(1 / 60, playerPos, 10.0, []);
}
assertClose(camera.fov, CONFIG.CAMERA.BASE_FOV, 0.01, `FOV remains at BASE_FOV (70) when speed <= 15 m/s (${camera.fov.toFixed(2)})`);

// Max speed (75 m/s) -> FOV lerps towards MAX_FOV (98)
for (let i = 0; i < 60; i++) {
  camCtrl.update(1 / 60, playerPos, 75.0, []);
}
assertClose(camera.fov, CONFIG.CAMERA.MAX_FOV, 0.5, `FOV approaches MAX_FOV (98) at 75 m/s (${camera.fov.toFixed(2)})`);

// Mid speed (45 m/s) -> FOV lerps towards (70 + 98)/2 = 84
for (let i = 0; i < 60; i++) {
  camCtrl.update(1 / 60, playerPos, 45.0, []);
}
assertClose(camera.fov, 84.0, 0.5, `FOV approaches 84 deg at 45 m/s (${camera.fov.toFixed(2)})`);

// Overspeed (> 75 m/s) -> Clamped to MAX_FOV (98)
for (let i = 0; i < 60; i++) {
  camCtrl.update(1 / 60, playerPos, 120.0, []);
}
assertClose(camera.fov, CONFIG.CAMERA.MAX_FOV, 0.5, `FOV clamped to MAX_FOV at 120 m/s (${camera.fov.toFixed(2)})`);

// 7. Edge Cases & Resilience
console.log('\n--- TEST 7: Edge Cases & Robustness ---');
// Null playerPos, NaN speeds, null meshes
camCtrl.update(0, null, NaN, null);
assert(!isNaN(camera.position.x), 'Camera X is not NaN with null playerPos');
assert(!isNaN(camera.fov), 'Camera FOV is not NaN with NaN speed');

// NaN components inside playerPos object
const nanPos = { x: NaN, y: 15, z: NaN };
camCtrl.update(1 / 60, nanPos, 0, []);
assert(!isNaN(camera.position.x), 'Camera X is not NaN when playerPos has NaN components');
assertClose(camCtrl.getPivot().y, 15 + CONFIG.CAMERA.ARM_HEIGHT, 1e-4, 'Handles valid Y even when X/Z are NaN');

// CANNON.Vec3 compatibility test
const cannonPos = { x: 5, y: 12, z: -15 };
camCtrl.update(1 / 60, cannonPos, 20, []);
assertClose(camCtrl.getPivot().y, 12 + CONFIG.CAMERA.ARM_HEIGHT, 1e-4, 'Handles CANNON.Vec3-like position objects');

// Velocity vector as playerSpeed
const velVector = new THREE.Vector3(30, 0, 40); // length = 50 m/s
camCtrl.update(1 / 60, playerPos, velVector, []);
assert(!isNaN(camera.fov), 'Handles THREE.Vector3 object for playerSpeed');

// Plain object velocity { x, y, z } without .length()
const plainVel = { x: 30, y: 0, z: 40 };
camCtrl.update(1 / 60, playerPos, plainVel, []);
assert(!isNaN(camera.fov), 'Handles plain {x,y,z} velocity object without .length()');

// LevelGenerator wrapper object compatibility
const mockLevelGen = { grappleableMeshes: [wallMesh] };
camCtrl.update(1 / 60, playerPos, 0, mockLevelGen);
assert(camCtrl.getDistance() <= CONFIG.CAMERA.ARM_DISTANCE, 'Handles LevelGenerator object passed instead of direct array');

// Group or Scene with .children compatibility
const mockGroup = { children: [wallMesh] };
camCtrl.update(1 / 60, playerPos, 0, mockGroup);
assert(camCtrl.getDistance() <= CONFIG.CAMERA.ARM_DISTANCE, 'Handles Object3D group with .children array');

// NaN mouse movement deltas should not corrupt yaw/pitch
document.pointerLockElement = domElement;
document.dispatchEvent('pointerlockchange', {});
document.dispatchEvent('mousemove', { movementX: NaN, movementY: Infinity });
assert(!isNaN(camCtrl.yaw), 'Yaw does not become NaN on NaN movementX');
assert(!isNaN(camCtrl.pitch), 'Pitch does not become NaN on infinite movementY');
document.pointerLockElement = null;

// requestPointerLock / exitPointerLock methods
camCtrl.requestPointerLock();
assert(camCtrl.isLocked === true, 'requestPointerLock() successfully engages lock');
camCtrl.exitPointerLock();
assert(camCtrl.isLocked === false, 'exitPointerLock() successfully releases lock');

// Dispose test
camCtrl.dispose();
assert(document.listeners['mousemove'].length === 0, 'mousemove listener removed on dispose');
assert(document.listeners['pointerlockchange'].length === 0, 'pointerlockchange listener removed on dispose');
assert(document.listeners['pointerlockerror'].length === 0, 'pointerlockerror listener removed on dispose');

console.log('\n====================================================');
console.log('🎉 ALL CAMERA CONTROLLER TESTS PASSED SUCCESSFULLY!');
console.log('====================================================');
