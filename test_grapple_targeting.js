import * as THREE from 'three';
import { GrappleRaycaster, findTargetPoint } from './src/GrappleRaycaster.js';
import { CONFIG } from './src/config.js';

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
console.log('🧪 TESTING AERO-HOOK GRAPPLE RAYCASTER (PHASE 1C-1)');
console.log('====================================================\n');

const raycaster = new GrappleRaycaster(CONFIG);

// ----------------------------------------------------
// TEST 1: Setup & Initialization
// ----------------------------------------------------
console.log('--- TEST 1: Setup & Initialization ---');
assert(raycaster.raycaster instanceof THREE.Raycaster, 'Raycaster instance created');
assertClose(
  raycaster.raycaster.far,
  CONFIG.GRAPPLE.MAX_RANGE + CONFIG.CAMERA.ARM_DISTANCE,
  1e-4,
  'Raycaster.far equals MAX_RANGE + ARM_DISTANCE (85.0 + 6.5 = 91.5m)'
);
assertClose(raycaster.maxRange, 85.0, 1e-4, 'maxRange is 85.0m');
assertClose(raycaster.armDistance, 6.5, 1e-4, 'armDistance is 6.5m');
assert(raycaster._coneSamples.length === 16, '16 cone sample rays precomputed (2 rings * 8 rays)');

// ----------------------------------------------------
// TEST 2: Center-Screen Direct Raycast within 85m
// ----------------------------------------------------
console.log('\n--- TEST 2: Center-Screen Direct Raycast within 85m ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = {
    mesh: { position: new THREE.Vector3(0, 0, 0) },
  };

  // Wall centered at (0, 0, -40), box size 10x10x1. Front face at Z = -39.5
  const wallGeo = new THREE.BoxGeometry(10, 10, 1);
  const wallMat = new THREE.MeshBasicMaterial();
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.set(0, 0, -40);
  wallMesh.updateMatrixWorld(true);

  const result = raycaster.findTargetPoint(camera, player, [wallMesh]);

  assert(result.hit === true, 'Direct raycast hits target');
  assert(result.assisted === false, 'Direct raycast is NOT assisted (assisted: false)');
  assert(result.point instanceof THREE.Vector3, 'Hit point is a THREE.Vector3');
  assertClose(result.point.z, -39.5, 0.01, 'Hit point Z is at front face (-39.5m)');
  assertClose(result.distance, 39.5, 0.01, 'Distance from player is 39.5m');
  assert(result.distance <= CONFIG.GRAPPLE.MAX_RANGE, 'Distance is <= MAX_RANGE (85.0m)');
  assert(result.normal instanceof THREE.Vector3, 'Hit normal is a THREE.Vector3');
  assertClose(result.normal.z, 1.0, 0.01, 'Front face normal points toward camera (+Z)');
}

// ----------------------------------------------------
// TEST 3: Center-Screen Direct Raycast > 85m Rejected
// ----------------------------------------------------
console.log('\n--- TEST 3: Center-Screen Direct Raycast > 85m Rejected ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = {
    mesh: { position: new THREE.Vector3(0, 0, 0) },
  };

  // Wall centered at (0, 0, -88), front face at Z = -87.5m
  // Note: 87.5m is within raycaster.far (91.5m), but > player maxRange (85.0m)
  const wallGeo = new THREE.BoxGeometry(10, 10, 1);
  const wallMat = new THREE.MeshBasicMaterial();
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.set(0, 0, -88);
  wallMesh.updateMatrixWorld(true);

  const result = raycaster.findTargetPoint(camera, player, [wallMesh]);

  assert(result.hit === false, 'Target at 87.5m from player is rejected');
  assert(result.point === null, 'Rejected hit returns point: null');
  assert(result.normal === null, 'Rejected hit returns normal: null');
  assert(result.assisted === false, 'Rejected hit returns assisted: false');
  assert(result.distance === null, 'Rejected hit returns distance: null');
}

// ----------------------------------------------------
// TEST 4: Boundary Value Test at Exactly 85.0m Threshold
// ----------------------------------------------------
console.log('\n--- TEST 4: Boundary Value Test at 85.0m Threshold ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = {
    mesh: { position: new THREE.Vector3(0, 0, 0) },
  };

  // Target A: front face at Z = -84.9m (distance 84.9m <= 85.0m) -> ACCEPT
  const geoA = new THREE.BoxGeometry(2, 2, 0.2);
  const meshA = new THREE.Mesh(geoA, new THREE.MeshBasicMaterial());
  meshA.position.set(0, 0, -85.0); // front face at -84.9m
  meshA.updateMatrixWorld(true);

  const resA = raycaster.findTargetPoint(camera, player, [meshA]);
  assert(resA.hit === true, 'Target at 84.9m is accepted');
  assert(resA.assisted === false, 'Direct hit at 84.9m is unassisted');
  assertClose(resA.distance, 84.9, 0.05, 'Distance is ~84.9m');

  // Target B: front face at Z = -85.1m (distance 85.1m > 85.0m) -> REJECT
  const geoB = new THREE.BoxGeometry(2, 2, 0.2);
  const meshB = new THREE.Mesh(geoB, new THREE.MeshBasicMaterial());
  meshB.position.set(0, 0, -85.2); // front face at -85.1m
  meshB.updateMatrixWorld(true);

  const resB = raycaster.findTargetPoint(camera, player, [meshB]);
  assert(resB.hit === false, 'Target at 85.1m is rejected');
  assert(resB.point === null, 'Target at 85.1m returns point: null');
}

// ----------------------------------------------------
// TEST 5: Near Miss Caught by 1.5° Cone Ring (assisted: true)
// ----------------------------------------------------
console.log('\n--- TEST 5: Near Miss Caught by 1.5° Cone Ring ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = {
    mesh: { position: new THREE.Vector3(0, 0, 0) },
  };

  // Camera forward is (0, 0, -1). u = (1, 0, 0), v = (0, 1, 0).
  // At distance Z = -40, angle alpha = 1.5 degrees:
  // tan(1.5°) = 0.0261859...
  // For k = 0 (phi = 0): X = 40 * tan(1.5°) = 1.0474m, Y = 0.
  const distZ = 40.0;
  const alphaRad = (1.5 * Math.PI) / 180;
  const offsetX = distZ * Math.tan(alphaRad); // ~1.0474m

  // Place a small target box (size 0.3x0.3x0.3) at (offsetX, 0, -distZ)
  // Center ray along (0, 0, -1) passes at X=0, Y=0 (misses box which starts at X = 1.0474 - 0.15 = 0.8974m)
  const targetGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const targetMesh = new THREE.Mesh(targetGeo, new THREE.MeshBasicMaterial());
  targetMesh.position.set(offsetX, 0, -distZ);
  targetMesh.updateMatrixWorld(true);

  const result = raycaster.findTargetPoint(camera, player, [targetMesh]);

  assert(result.hit === true, '1.5° cone ray successfully hits target');
  assert(result.assisted === true, 'Cone catch returns assisted: true');
  assert(result.point instanceof THREE.Vector3, 'Hit point is a THREE.Vector3');
  assertClose(result.point.x, offsetX, 0.15, `Hit point X matches cone offset ~${offsetX.toFixed(3)}m`);
  assertClose(result.distance, distZ, 0.5, 'Hit distance is close to 40m');
  assert(result.distance <= CONFIG.GRAPPLE.MAX_RANGE, 'Distance is within 85.0m');
}

// ----------------------------------------------------
// TEST 6: Further Miss Caught by 3.0° Cone Ring (assisted: true)
// ----------------------------------------------------
console.log('\n--- TEST 6: Further Miss Caught by 3.0° Cone Ring ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = {
    mesh: { position: new THREE.Vector3(0, 0, 0) },
  };

  // At distance Z = -40, angle alpha = 3.0 degrees:
  // tan(3.0°) = 0.0524077...
  // For k = 0 (phi = 0): X = 40 * tan(3.0°) = 2.0963m, Y = 0.
  const distZ = 40.0;
  const alphaRad = (3.0 * Math.PI) / 180;
  const offsetX = distZ * Math.tan(alphaRad); // ~2.0963m

  // Place small box at (offsetX, 0, -distZ).
  // Center ray misses (X=0). 1.5° ray misses (X~1.05m). 3.0° ray hits!
  const targetGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const targetMesh = new THREE.Mesh(targetGeo, new THREE.MeshBasicMaterial());
  targetMesh.position.set(offsetX, 0, -distZ);
  targetMesh.updateMatrixWorld(true);

  const result = raycaster.findTargetPoint(camera, player, [targetMesh]);

  assert(result.hit === true, '3.0° cone ray successfully hits target');
  assert(result.assisted === true, '3.0° cone catch returns assisted: true');
  assertClose(result.point.x, offsetX, 0.15, `Hit point X matches 3.0° offset ~${offsetX.toFixed(3)}m`);
  assertClose(result.distance, distZ, 0.5, 'Hit distance is close to 40m');
}

// ----------------------------------------------------
// TEST 7: Angular Priority: 1.5° Hit Preferred Over 3.0° Hit
// ----------------------------------------------------
console.log('\n--- TEST 7: Angular Priority (Smallest Angular Deviation) ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = {
    mesh: { position: new THREE.Vector3(0, 0, 0) },
  };

  const distZ = 40.0;
  const alpha1 = (1.5 * Math.PI) / 180;
  const alpha2 = (3.0 * Math.PI) / 180;

  const target1Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  target1Mesh.position.set(distZ * Math.tan(alpha1), 0, -distZ);
  target1Mesh.updateMatrixWorld(true);

  const target2Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  target2Mesh.position.set(distZ * Math.tan(alpha2), 0, -distZ);
  target2Mesh.updateMatrixWorld(true);

  // Both targets are in the scene. Center ray misses both.
  const result = raycaster.findTargetPoint(camera, player, [target1Mesh, target2Mesh]);

  assert(result.hit === true, 'One of the targets was hit');
  assert(result.assisted === true, 'Assisted hit');
  assertClose(
    result.point.x,
    distZ * Math.tan(alpha1),
    0.15,
    'Algorithm selected the 1.5° target due to smaller angular deviation from forward'
  );
}

// ----------------------------------------------------
// TEST 8: Full Radial Ring Coverage (All 8 Rays in 1.5° Ring)
// ----------------------------------------------------
console.log('\n--- TEST 8: Full Radial Ring Coverage (All 8 Rays in 1.5° Ring) ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = { mesh: { position: new THREE.Vector3(0, 0, 0) } };
  const distZ = 40.0;
  const alpha = (1.5 * Math.PI) / 180;
  const tanAlpha = Math.tan(alpha);

  for (let k = 0; k < 8; k++) {
    const phi = k * (Math.PI / 4);
    const targetX = distZ * tanAlpha * Math.cos(phi);
    const targetY = distZ * tanAlpha * Math.sin(phi);

    const testMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
    testMesh.position.set(targetX, targetY, -distZ);
    testMesh.updateMatrixWorld(true);

    const res = raycaster.findTargetPoint(camera, player, [testMesh]);
    assert(
      res.hit === true && res.assisted === true,
      `Cone ray k=${k} (angle ${(phi * 180 / Math.PI).toFixed(0)}°) caught target at (${targetX.toFixed(2)}, ${targetY.toFixed(2)})`
    );
  }
}

// ----------------------------------------------------
// TEST 9: Total Miss Returns hit: false
// ----------------------------------------------------
console.log('\n--- TEST 9: Total Miss Returns hit: false ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = { mesh: { position: new THREE.Vector3(0, 0, 0) } };

  // Place mesh at 6.0° off center (well outside the 3.0° max ring)
  const distZ = 40.0;
  const alpha = (6.0 * Math.PI) / 180;
  const targetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  targetMesh.position.set(distZ * Math.tan(alpha), 0, -distZ);
  targetMesh.updateMatrixWorld(true);

  const result = raycaster.findTargetPoint(camera, player, [targetMesh]);
  assert(result.hit === false, 'Target at 6.0° is missed by all rays');
  assert(result.point === null, 'Total miss point is null');
  assert(result.normal === null, 'Total miss normal is null');
  assert(result.assisted === false, 'Total miss assisted is false');
  assert(result.distance === null, 'Total miss distance is null');

  // Empty mesh array
  const emptyResult = raycaster.findTargetPoint(camera, player, []);
  assert(emptyResult.hit === false, 'Empty meshes returns hit: false');
}

// ----------------------------------------------------
// TEST 10: Surface Normal World-Space Transformation
// ----------------------------------------------------
console.log('\n--- TEST 10: Surface Normal World-Space Transformation ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = { mesh: { position: new THREE.Vector3(0, 0, 0) } };

  // Box centered at (0, 0, -30).
  // Front face in local space has normal (0, 0, 1).
  // When unrotated, front face normal in world space is (0, 0, 1).
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial());
  boxMesh.position.set(0, 0, -30);
  boxMesh.updateMatrixWorld(true);

  const resUnrotated = raycaster.findTargetPoint(camera, player, [boxMesh]);
  assert(resUnrotated.hit === true, 'Hit unrotated box');
  assertClose(resUnrotated.normal.x, 0.0, 1e-3, 'Unrotated normal X is 0');
  assertClose(resUnrotated.normal.y, 0.0, 1e-3, 'Unrotated normal Y is 0');
  assertClose(resUnrotated.normal.z, 1.0, 1e-3, 'Unrotated normal Z is +1');

  // Rotate box 90° around Y axis:
  const rotatedBox = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial());
  rotatedBox.position.set(30, 0, 0);
  rotatedBox.rotation.y = -Math.PI / 2; // Local +Z rotates to world -X (pointing toward origin)
  rotatedBox.updateMatrixWorld(true);

  const sideCamera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  sideCamera.position.set(0, 0, 0);
  sideCamera.lookAt(30, 0, 0); // look along +X
  sideCamera.updateMatrixWorld(true);

  const resRotated = raycaster.findTargetPoint(sideCamera, player, [rotatedBox]);
  assert(resRotated.hit === true, 'Hit rotated box');
  assertClose(resRotated.normal.x, -1.0, 1e-3, 'Rotated normal X is -1 (facing origin)');
  assertClose(resRotated.normal.y, 0.0, 1e-3, 'Rotated normal Y is 0');
  assertClose(resRotated.normal.z, 0.0, 1e-3, 'Rotated normal Z is 0');
  assertClose(resRotated.normal.length(), 1.0, 1e-3, 'Transformed normal is unit length');
}

// ----------------------------------------------------
// TEST 11: True Zero Steady-State Allocations (Rigorous GC Verification)
// ----------------------------------------------------
console.log('\n--- TEST 11: True Zero Steady-State Allocations (Rigorous GC Verification) ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = { mesh: { position: new THREE.Vector3(0, 0, 0) } };
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial());
  wallMesh.position.set(0, 0, -40);
  wallMesh.geometry.computeBoundingSphere();
  wallMesh.updateMatrixWorld(true);

  const outResult = {
    hit: false,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    assisted: false,
    distance: 0,
  };

  // Warm-up pass
  raycaster.findTargetPoint(camera, player, [wallMesh], outResult);

  // Track any Vector3.clone calls directly originating from GrappleRaycaster.js
  let directGrappleClones = 0;
  const origClone = THREE.Vector3.prototype.clone;
  THREE.Vector3.prototype.clone = function (...args) {
    const err = new Error();
    const immediateCaller = err.stack ? err.stack.split('\n')[2] : '';
    if (immediateCaller && immediateCaller.includes('GrappleRaycaster.js')) {
      directGrappleClones++;
    }
    return origClone.apply(this, args);
  };

  // 1. Run 100 continuous hits with outResult: GrappleRaycaster must perform 0 Vector3 clones
  for (let i = 0; i < 100; i++) {
    raycaster.findTargetPoint(camera, player, [wallMesh], outResult);
  }
  assert(
    directGrappleClones === 0,
    `Zero direct Vector3 clones inside GrappleRaycaster across 100 hit frames with outResult (count: ${directGrappleClones})`
  );

  // 2. Run 100 continuous miss frames with outResult: GrappleRaycaster must perform 0 Vector3 clones
  for (let i = 0; i < 100; i++) {
    raycaster.findTargetPoint(camera, player, [], outResult);
  }
  assert(
    directGrappleClones === 0,
    `Zero direct Vector3 clones inside GrappleRaycaster across 100 miss frames with outResult (count: ${directGrappleClones})`
  );

  // 3. Alternate hit -> miss -> hit -> miss for 50 cycles
  // This verifies that _scratchPoint / _scratchNormal preserve references across miss cycles!
  const originalPointRef = outResult._scratchPoint;
  const originalNormalRef = outResult._scratchNormal;

  for (let i = 0; i < 50; i++) {
    raycaster.findTargetPoint(camera, player, [wallMesh], outResult); // hit
    assert(outResult.point === originalPointRef, `Hit frame ${i} preserved preallocated point reference`);
    assert(outResult.normal === originalNormalRef, `Hit frame ${i} preserved preallocated normal reference`);

    raycaster.findTargetPoint(camera, player, [], outResult); // miss
    assert(outResult.point === null, `Miss frame ${i} correctly reports point: null`);
    assert(outResult.normal === null, `Miss frame ${i} correctly reports normal: null`);
  }

  assert(
    directGrappleClones === 0,
    `Zero direct Vector3 clones inside GrappleRaycaster during 50 alternating hit/miss transition cycles (count: ${directGrappleClones})`
  );

  // Restore clone method
  THREE.Vector3.prototype.clone = origClone;
}

// ----------------------------------------------------
// TEST 12: Player Representation Compatibility
// ----------------------------------------------------
console.log('\n--- TEST 12: Player Representation Compatibility ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial());
  wallMesh.position.set(0, 0, -30);
  wallMesh.updateMatrixWorld(true);

  // Case A: player.mesh.position
  const resA = raycaster.findTargetPoint(camera, { mesh: { position: new THREE.Vector3(0, 0, 0) } }, [wallMesh]);
  assert(resA.hit === true, 'Compatible with player.mesh.position');

  // Case B: player.body.position (CANNON-style)
  const resB = raycaster.findTargetPoint(camera, { body: { position: { x: 0, y: 0, z: 0 } } }, [wallMesh]);
  assert(resB.hit === true, 'Compatible with player.body.position');

  // Case C: player.position
  const resC = raycaster.findTargetPoint(camera, { position: new THREE.Vector3(0, 0, 0) }, [wallMesh]);
  assert(resC.hit === true, 'Compatible with player.position');

  // Case D: player as THREE.Vector3 directly
  const resD = raycaster.findTargetPoint(camera, new THREE.Vector3(0, 0, 0), [wallMesh]);
  assert(resD.hit === true, 'Compatible with THREE.Vector3 player');

  // Case E: standalone exported function findTargetPoint
  const resE = findTargetPoint(camera, new THREE.Vector3(0, 0, 0), [wallMesh]);
  assert(resE.hit === true, 'Compatible with exported findTargetPoint helper');
}

// ----------------------------------------------------
// TEST 13: Container Format Compatibility
// ----------------------------------------------------
console.log('\n--- TEST 13: Container Format Compatibility ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = new THREE.Vector3(0, 0, 0);
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial());
  wallMesh.position.set(0, 0, -30);
  wallMesh.updateMatrixWorld(true);

  // Array of meshes
  const res1 = raycaster.findTargetPoint(camera, player, [wallMesh]);
  assert(res1.hit === true, 'Passes raw array of meshes');

  // Object with grappleableMeshes property (like LevelGenerator)
  const res2 = raycaster.findTargetPoint(camera, player, { grappleableMeshes: [wallMesh] });
  assert(res2.hit === true, 'Passes object with grappleableMeshes property');

  // Scene/Group with children
  const group = new THREE.Group();
  group.add(wallMesh);
  group.updateMatrixWorld(true);
  const res3 = raycaster.findTargetPoint(camera, player, group);
  assert(res3.hit === true, 'Passes THREE.Group with children');
}

// ----------------------------------------------------
// TEST 14: Single Bare THREE.Mesh Input (Not in Array)
// ----------------------------------------------------
console.log('\n--- TEST 14: Single Bare THREE.Mesh Input ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = new THREE.Vector3(0, 0, 0);
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial());
  wallMesh.position.set(0, 0, -40);
  wallMesh.updateMatrixWorld(true);

  // Pass single bare Mesh directly (not [wallMesh])
  const res = raycaster.findTargetPoint(camera, player, wallMesh);
  assert(res.hit === true, 'Bare THREE.Mesh successfully detected and raycasted');
  assertClose(res.point.z, -39.5, 0.01, 'Hit point Z matches front face of bare mesh');
}

// ----------------------------------------------------
// TEST 15: Camera Hierarchy World Position Resolution
// ----------------------------------------------------
console.log('\n--- TEST 15: Camera Hierarchy World Position Resolution ---');
{
  // Camera placed inside a parent rig/pivot
  const rigGroup = new THREE.Group();
  rigGroup.position.set(10, 20, 30);

  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0); // Local position (0, 0, 0) relative to rig
  rigGroup.add(camera);
  rigGroup.updateMatrixWorld(true);

  const player = new THREE.Vector3(10, 20, 30);

  // Target placed in front of world camera position (10, 20, 30) along -Z
  const targetMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 1), new THREE.MeshBasicMaterial());
  targetMesh.position.set(10, 20, -10); // 40m in front of camera in world space
  targetMesh.updateMatrixWorld(true);

  const res = raycaster.findTargetPoint(camera, player, [targetMesh]);
  assert(res.hit === true, 'Camera in parent hierarchy correctly resolves world origin');
  assertClose(res.point.x, 10.0, 0.01, 'Hit point X matches world camera X (10.0)');
  assertClose(res.point.y, 20.0, 0.01, 'Hit point Y matches world camera Y (20.0)');
  assertClose(res.point.z, -9.5, 0.01, 'Hit point Z matches front face in world space');
}

// ----------------------------------------------------
// TEST 16: Player Hierarchy World Position Resolution
// ----------------------------------------------------
console.log('\n--- TEST 16: Player Hierarchy World Position Resolution ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  // Player mesh inside a parent vehicle/platform group
  const parentGroup = new THREE.Group();
  parentGroup.position.set(0, 0, -20);

  const playerMesh = new THREE.Group();
  playerMesh.position.set(0, 0, 0);
  parentGroup.add(playerMesh);
  parentGroup.updateMatrixWorld(true);

  const player = { mesh: playerMesh };

  // Target at Z = -60 (distance to camera is 60m, distance to player is 40m)
  const targetMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 1), new THREE.MeshBasicMaterial());
  targetMesh.position.set(0, 0, -60);
  targetMesh.updateMatrixWorld(true);

  const res = raycaster.findTargetPoint(camera, player, [targetMesh]);
  assert(res.hit === true, 'Player inside hierarchy correctly resolves world position');
  assertClose(res.distance, 39.5, 0.1, 'Distance accurately measured from player world position (~39.5m)');
}

// ----------------------------------------------------
// TEST 17: Custom MAGNETISM_RAYS_PER_RING Full 360° Distribution
// ----------------------------------------------------
console.log('\n--- TEST 17: Custom MAGNETISM_RAYS_PER_RING Full 360° Distribution ---');
{
  const customConfig = {
    GRAPPLE: {
      MAX_RANGE: 85.0,
      MAGNETISM_ANGLES_DEG: [1.5],
      MAGNETISM_RAYS_PER_RING: 12, // 12 rays per ring (30° increments)
    },
    CAMERA: { ARM_DISTANCE: 6.5 },
  };

  const customRaycaster = new GrappleRaycaster(customConfig);
  assert(customRaycaster._coneSamples.length === 12, 'Precomputed 12 rays for custom config');

  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = new THREE.Vector3(0, 0, 0);
  const distZ = 30.0;
  const alpha = (1.5 * Math.PI) / 180;
  const tanAlpha = Math.tan(alpha);

  // Verify ray at k = 3 (angle = 3 * (2*PI/12) = PI/2 = 90°)
  const targetX = distZ * tanAlpha * Math.cos(Math.PI / 2); // ~0
  const targetY = distZ * tanAlpha * Math.sin(Math.PI / 2); // ~distZ * tanAlpha

  const targetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  targetMesh.position.set(targetX, targetY, -distZ);
  targetMesh.updateMatrixWorld(true);

  const res = customRaycaster.findTargetPoint(camera, player, [targetMesh]);
  assert(res.hit === true, 'Custom 12-ray cone caught 90° target successfully');
}

// ----------------------------------------------------
// TEST 18: Unsorted MAGNETISM_ANGLES_DEG Sorts and Prioritizes Smallest Angle
// ----------------------------------------------------
console.log('\n--- TEST 18: Unsorted MAGNETISM_ANGLES_DEG Sorts and Prioritizes Smallest Angle ---');
{
  // Config passed with reverse angle order: [3.0, 1.5]
  const reverseConfig = {
    GRAPPLE: {
      MAX_RANGE: 85.0,
      MAGNETISM_ANGLES_DEG: [3.0, 1.5],
      MAGNETISM_RAYS_PER_RING: 8,
    },
    CAMERA: { ARM_DISTANCE: 6.5 },
  };

  const sortedRaycaster = new GrappleRaycaster(reverseConfig);

  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = new THREE.Vector3(0, 0, 0);
  const distZ = 40.0;
  const alpha1 = (1.5 * Math.PI) / 180;
  const alpha2 = (3.0 * Math.PI) / 180;

  const target1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  target1.position.set(distZ * Math.tan(alpha1), 0, -distZ);
  target1.updateMatrixWorld(true);

  const target2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  target2.position.set(distZ * Math.tan(alpha2), 0, -distZ);
  target2.updateMatrixWorld(true);

  const res = sortedRaycaster.findTargetPoint(camera, player, [target1, target2]);
  assert(res.hit === true, 'Raycaster with reverse angles hits target');
  assertClose(
    res.point.x,
    distZ * Math.tan(alpha1),
    0.15,
    'Algorithm prioritized smaller angle (1.5°) even when config specified [3.0, 1.5]'
  );
}

// ----------------------------------------------------
// TEST 19: Degenerate Zero-Vector Camera Direction Safeguard
// ----------------------------------------------------
console.log('\n--- TEST 19: Degenerate Zero-Vector Camera Direction Safeguard ---');
{
  // Mock camera that returns a zero vector for getWorldDirection
  const badCamera = {
    getWorldPosition(target) {
      return target.set(0, 0, 0);
    },
    getWorldDirection(target) {
      return target.set(0, 0, 0); // Degenerate zero vector
    },
  };

  const player = new THREE.Vector3(0, 0, 0);
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 1), new THREE.MeshBasicMaterial());
  wallMesh.position.set(0, 0, -30);
  wallMesh.updateMatrixWorld(true);

  const res = raycaster.findTargetPoint(badCamera, player, [wallMesh]);
  assert(!isNaN(raycaster._forward.x), 'Forward vector X is not NaN on degenerate camera');
  assert(!isNaN(raycaster._forward.y), 'Forward vector Y is not NaN on degenerate camera');
  assert(!isNaN(raycaster._forward.z), 'Forward vector Z is not NaN on degenerate camera');
  assert(res.hit === true, 'Safeguard gracefully recovered and hit target along default (0, 0, -1)');
}

// ----------------------------------------------------
// TEST 20: Performance Early-Exit Optimization
// ----------------------------------------------------
console.log('\n--- TEST 20: Performance Early-Exit Optimization ---');
{
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -100);
  camera.updateMatrixWorld(true);

  const player = new THREE.Vector3(0, 0, 0);

  // Target that only ring 0 (1.5°) hits
  const distZ = 40.0;
  const alpha1 = (1.5 * Math.PI) / 180;
  const target1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial());
  target1.position.set(distZ * Math.tan(alpha1), 0, -distZ);
  target1.updateMatrixWorld(true);

  let intersectCalls = 0;
  const origIntersect = THREE.Raycaster.prototype.intersectObjects;
  THREE.Raycaster.prototype.intersectObjects = function (...args) {
    intersectCalls++;
    return origIntersect.apply(this, args);
  };

  raycaster.findTargetPoint(camera, player, [target1]);

  // Center ray = 1 call. Ring 0 = 8 calls. Total should be 9 calls (Ring 1 skipped).
  // Without early-exit, it would be 1 + 8 + 8 = 17 calls.
  assert(
    intersectCalls <= 9,
    `Early-exit reduced total raycasts from 17 to ${intersectCalls} when inner ring hit`
  );

  THREE.Raycaster.prototype.intersectObjects = origIntersect;
}

console.log('\n====================================================');
console.log('🎉 ALL 20 AERO-HOOK GRAPPLE TARGETING TESTS PASSED!');
console.log('====================================================');
