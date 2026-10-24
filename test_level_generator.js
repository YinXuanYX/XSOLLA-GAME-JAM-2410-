import * as THREE from 'three';
import { PhysicsWorld } from './src/PhysicsWorld.js';
import { LevelGenerator, mulberry32 } from './src/LevelGenerator.js';
import { CONFIG } from './src/config.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('====================================================');
console.log('🧪 TESTING AERO-HOOK LEVEL GENERATOR (PHASE 2A)');
console.log('====================================================\n');

// 1. Deterministic PRNG mulberry32
console.log('--- TEST 1: mulberry32 Determinism ---');
const rng1 = mulberry32(1042);
const rng2 = mulberry32(1042);
const seq1 = [rng1(), rng1(), rng1(), rng1(), rng1()];
const seq2 = [rng2(), rng2(), rng2(), rng2(), rng2()];
assert(JSON.stringify(seq1) === JSON.stringify(seq2), 'Identical seeds produce identical sequence');

const rng3 = mulberry32(9999);
const seq3 = [rng3(), rng3(), rng3(), rng3(), rng3()];
assert(JSON.stringify(seq1) !== JSON.stringify(seq3), 'Different seeds produce different sequences');

// 2. Class LevelGenerator Initialization & Abyss
console.log('\n--- TEST 2: LevelGenerator Construction & Abyss Plane ---');
const scene = new THREE.Scene();
const physicsWorld = new PhysicsWorld();
const levelGen = new LevelGenerator(scene, physicsWorld);

assert(Array.isArray(levelGen.grappleableMeshes), 'grappleableMeshes is initialized array');
assert(Array.isArray(levelGen.activeChunks), 'activeChunks is initialized array');
assert(Array.isArray(levelGen.hazardBodies), 'hazardBodies is initialized array');
assert(levelGen.finishGate !== null, 'finishGate descriptor initialized');
assert(levelGen.finishGate.radius === 18, 'Initial finishGate radius is 18m');
assert(levelGen.abyssGroup !== null, 'abyssGroup created');
assert(levelGen.abyssGroup.position.y === CONFIG.LEVEL.ABYSS_VISUAL_Y, `abyssGroup at Y = ${CONFIG.LEVEL.ABYSS_VISUAL_Y}`);

// Check Abyss follow logic
levelGen.updateAbyss(-250, 1.0);
assert(levelGen.abyssGroup.position.z === -250, 'Abyss plane follows player Z position');

// 3. spawnBlock Helper
console.log('\n--- TEST 3: spawnBlock Helper (Standard vs Hazard) ---');
const prevGrappleCount = levelGen.grappleableMeshes.length;
const prevHazardCount = levelGen.hazardBodies.length;

const block1 = levelGen.spawnBlock({
  x: 10,
  y: 5,
  z: -50,
  w: 4,
  h: 6,
  d: 8,
  rx: 0.1,
  ry: 0.2,
  rz: 0.3,
  isHazard: false,
});
assert(block1.mesh.userData.type === 'GRAPPLEABLE', 'Normal block tagged GRAPPLEABLE');
assert(block1.body.userData.type === 'GRAPPLEABLE', 'Normal body tagged GRAPPLEABLE');
assert(levelGen.grappleableMeshes.length === prevGrappleCount + 1, 'Normal block pushed to grappleableMeshes');

const block2 = levelGen.spawnBlock({
  x: -10,
  y: 5,
  z: -50,
  w: 4,
  h: 6,
  d: 8,
  isHazard: true,
});
assert(block2.mesh.userData.type === 'HAZARD', 'Hazard block tagged HAZARD');
assert(block2.body.userData.type === 'HAZARD', 'Hazard body tagged HAZARD');
assert(levelGen.hazardBodies.length === prevHazardCount + 1, 'Hazard body pushed to hazardBodies');
assert(block2.mesh.material.emissive !== undefined, 'Hazard block uses emissive material');

// 4. Start Pad & Finish Gate
console.log('\n--- TEST 4: Start Pad and Finish Gate ---');
const startPad = levelGen.spawnStartPad();
assert(levelGen.startPad.meshes.length > 0, 'Start Pad visual meshes created');
assert(levelGen.startPad.bodies.length > 0, 'Start Pad collision body created');
assert(levelGen.startPad.bodies[0].userData.type === 'START_PAD', 'Start Pad body tagged START_PAD');

const finishGate = levelGen.spawnFinishGate(0, 10, -500);
assert(finishGate.radius === 18, 'Black Hole has 18m capture radius');
assert(finishGate.exploding === false && finishGate.explodeTimer === 0, 'Black Hole starts idle');
assert(finishGate.z === -500, 'Finish Gate at Z = -500');
assert(finishGate.mesh !== null, 'Finish Gate group attached');

// 5. The 6 Individual Chunk Builders
console.log('\n--- TEST 5: The 6 Procedural Chunk Archetypes ---');
const testChunkObj = (name, archetypeFn) => {
  const dummyChunk = { id: 99, meshes: [], bodies: [] };
  const cursor = { x: 0, y: 0, z: -100 };
  const rng = mulberry32(12345);
  const nextCursor = archetypeFn.call(levelGen, cursor, rng, dummyChunk);

  assert(dummyChunk.meshes.length > 0, `${name}: spawned meshes`);
  assert(dummyChunk.bodies.length > 0, `${name}: spawned bodies`);
  assert(nextCursor.z < cursor.z, `${name}: advanced cursor along -Z (${cursor.z} -> ${nextCursor.z})`);

  // Cleanup dummy objects
  levelGen.disposeChunk(dummyChunk);
  return nextCursor.z - cursor.z;
};

const len1 = testChunkObj('Chunk 1 (Twin Spires)', levelGen.buildChunk1_TwinSpires);
assert(len1 === -150, 'Chunk 1 length is 150m');

const len2 = testChunkObj('Chunk 2 (Under-Bridge Dive)', levelGen.buildChunk2_UnderBridgeDive);
assert(len2 === -160, 'Chunk 2 length is 160m');

const len3 = testChunkObj('Chunk 3 (Threading Rings)', levelGen.buildChunk3_ThreadingRings);
assert(len3 === -165, 'Chunk 3 length is 165m');

const len4 = testChunkObj('Chunk 4 (Split Canyon)', levelGen.buildChunk4_SplitCanyon);
assert(len4 === -155, 'Chunk 4 length is 155m');

const len5 = testChunkObj('Chunk 5 (Stepping Stones)', levelGen.buildChunk5_SteppingStones);
assert(len5 === -175, 'Chunk 5 length is 175m');

const len6 = testChunkObj('Chunk 6 (Slingshot Finale)', levelGen.buildChunk6_SlingshotFinale);
assert(len6 === -140, 'Chunk 6 length is 140m');

// 6. Course Presets 1, 2, 3 Loading
console.log('\n--- TEST 6: Course Presets 1, 2, 3 (Seeded & Deterministic) ---');
const c1 = levelGen.loadCourse(1);
assert(c1.chunkCount === 6, 'Course 1 (Skyline Sprint) loaded 6 chunks');
assert(levelGen.finishGate.z < -800, `Course 1 Finish Gate placed at Z = ${levelGen.finishGate.z}`);
const c1Meshes = levelGen.grappleableMeshes.length;
const c1Bodies = physicsWorld.bodies.length;

// Reload Course 1 and verify exact determinism
const c1_reload = levelGen.loadCourse(1);
assert(c1_reload.chunkCount === 6, 'Course 1 reloaded 6 chunks');
assert(levelGen.grappleableMeshes.length === c1Meshes, 'Deterministic mesh count identical on reload');
assert(physicsWorld.bodies.length === c1Bodies, 'Deterministic physics bodies count identical on reload');

// Course 2 (Citadel Ascent - 8 chunks)
const c2 = levelGen.loadCourse(2);
assert(c2.chunkCount === 8, 'Course 2 (Citadel Ascent) loaded 8 chunks');
assert(levelGen.finishGate.z < -1000, `Course 2 Finish Gate placed at Z = ${levelGen.finishGate.z}`);

// Course 3 (Hyperion Gauntlet - 10 chunks)
const c3 = levelGen.loadCourse(3);
assert(c3.chunkCount === 10, 'Course 3 (Hyperion Gauntlet) loaded 10 chunks');
assert(levelGen.finishGate.z < -1400, `Course 3 Finish Gate placed at Z = ${levelGen.finishGate.z}`);

// 7. Endless Mode (Preset 4) & Recycler
console.log('\n--- TEST 7: Endless Mode (Preset 4) & Dynamic Recycler ---');
const c4 = levelGen.loadCourse(4);
assert(c4.chunkCount === 5, 'Endless Mode loaded initial 5 chunks');
assert(levelGen.finishGate.z === -999999, 'Endless Mode has no near finish gate');

const initialFarthestZ = levelGen.farthestZ;
console.log(`Initial Endless farthestZ: ${initialFarthestZ}m`);

// Player moves forward along -Z toward edge
// Spawns chunk ahead when playerZ < farthestZ + 350
const triggerZ = initialFarthestZ + 300; // closer than 350m to edge
const preCount = levelGen.activeChunks.length;
levelGen.updateEndless(triggerZ);
assert(levelGen.farthestZ < initialFarthestZ, `Spawned new chunk ahead: new farthestZ = ${levelGen.farthestZ}m`);
assert(levelGen.activeChunks.length > 0, `Active chunks properly maintained in sliding window: count = ${levelGen.activeChunks.length}`);

// Now simulate player advancing deep into course (-1200m)
console.log('Simulating player advancing to Z = -1200m...');
levelGen.updateEndless(-1200);

// Chunks whose endZ > playerZ + 180 (i.e. > -1020m) should be recycled
const oldChunks = levelGen.activeChunks.filter(c => c.endZ > -1200 + 180);
assert(oldChunks.length === 0, 'All chunks > 180m behind player were safely recycled');
console.log(`Current active chunks count after recycling: ${levelGen.activeChunks.length}`);

// 8. Memory Leak / Course Switch Cleanup
console.log('\n--- TEST 8: Full Course Reset / Zero Orphan Objects ---');
levelGen.clearAllCourseObjects();
assert(levelGen.activeChunks.length === 0, 'activeChunks empty after clear');
assert(levelGen.grappleableMeshes.length === 0, 'grappleableMeshes empty after clear');
assert(levelGen.hazardBodies.length === 0, 'hazardBodies empty after clear');
assert(levelGen.finishGate.mesh === null, 'Finish Gate cleared');

console.log('\n====================================================');
console.log('🎉 ALL PHASE 2A TESTS PASSED SUCCESSFULLY!');
console.log('====================================================');
