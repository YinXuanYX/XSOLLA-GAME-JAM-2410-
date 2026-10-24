import { strict as assert } from 'node:assert';
import CONFIG, {
  PHYSICS,
  MOVEMENT,
  GRAPPLE,
  CAMERA,
  LEVEL,
  COLORS,
  FX,
  COURSES,
} from './src/config.js';

console.log('====================================================');
console.log('🧪 TESTING AERO-HOOK CONFIGURATION V3.0 SPECIFICATION');
console.log('====================================================\n');

// 1. Structure and Named Exports
console.log('--- TEST 1: Named & Default Exports ---');
assert.equal(CONFIG.PHYSICS, PHYSICS, 'PHYSICS named export matches CONFIG.PHYSICS');
assert.equal(CONFIG.MOVEMENT, MOVEMENT, 'MOVEMENT named export matches CONFIG.MOVEMENT');
assert.equal(CONFIG.GRAPPLE, GRAPPLE, 'GRAPPLE named export matches CONFIG.GRAPPLE');
assert.equal(CONFIG.CAMERA, CAMERA, 'CAMERA named export matches CONFIG.CAMERA');
assert.equal(CONFIG.LEVEL, LEVEL, 'LEVEL named export matches CONFIG.LEVEL');
assert.equal(CONFIG.COLORS, COLORS, 'COLORS named export matches CONFIG.COLORS');
assert.equal(CONFIG.FX, FX, 'FX named export matches CONFIG.FX');
assert.equal(CONFIG.COURSES, COURSES, 'COURSES named export matches CONFIG.COURSES');
console.log('✅ All 8 named exports and default export verified');

// 2. CONFIG.PHYSICS Parameters
console.log('\n--- TEST 2: CONFIG.PHYSICS Parameters ---');
assert.equal(PHYSICS.TIMESTEP, 1 / 60);
assert.equal(PHYSICS.MAX_SUBSTEPS, 3);
assert.equal(PHYSICS.GRAVITY, -24.0);
assert.equal(PHYSICS.PLAYER_MASS, 70.0);
assert.equal(PHYSICS.PLAYER_RADIUS, 1.0);
assert.equal(PHYSICS.LINEAR_DAMPING, 0.08);
assert.equal(PHYSICS.WALL_FRICTION, 0.0);
assert.equal(PHYSICS.WALL_RESTITUTION, 0.1);
assert.equal(PHYSICS.MAX_SPEED, 75.0);
console.log('✅ All PHYSICS parameters verified');

// 3. CONFIG.MOVEMENT Parameters
console.log('\n--- TEST 3: CONFIG.MOVEMENT Parameters ---');
assert.equal(MOVEMENT.AIR_STRAFE_ACCEL, 14.0);
assert.equal(MOVEMENT.AIR_STRAFE_MAX_SPEED, 20.0);
console.log('✅ All MOVEMENT parameters verified');

// 4. CONFIG.GRAPPLE Parameters
console.log('\n--- TEST 4: CONFIG.GRAPPLE Parameters ---');
assert.equal(GRAPPLE.MAX_RANGE, 85.0);
assert.equal(GRAPPLE.MIN_DETACH_DIST, 2.5);
assert.equal(GRAPPLE.SINGLE_PULL_ACCEL, 58.0);
assert.equal(GRAPPLE.DUAL_PULL_ACCEL, 37.7);
assert.equal(GRAPPLE.TENSION_DAMPING, 8.5);
assert.deepEqual(GRAPPLE.MAGNETISM_ANGLES_DEG, [1.5, 3.0]);
assert.equal(GRAPPLE.MAGNETISM_RAYS_PER_RING, 8);
assert.equal(GRAPPLE.ROPE_RADIUS, 0.045);
console.log('✅ All GRAPPLE parameters verified');

// 5. CONFIG.CAMERA Parameters
console.log('\n--- TEST 5: CONFIG.CAMERA Parameters ---');
assert.equal(CAMERA.BASE_FOV, 70);
assert.equal(CAMERA.MAX_FOV, 98);
assert.equal(CAMERA.FOV_MIN_SPEED, 15.0);
assert.equal(CAMERA.FOV_LERP_SPEED, 8.0);
assert.equal(CAMERA.ARM_DISTANCE, 6.5);
assert.equal(CAMERA.ARM_HEIGHT, 1.8);
assert.equal(CAMERA.SHOULDER_OFFSET, 0.65);
assert.equal(CAMERA.SENSITIVITY, 0.0022);
assert.equal(CAMERA.PITCH_MIN, -Math.PI * 0.44);
assert.equal(CAMERA.PITCH_MAX, Math.PI * 0.44);
console.log('✅ All CAMERA parameters verified');

// 6. CONFIG.LEVEL Parameters
console.log('\n--- TEST 6: CONFIG.LEVEL Parameters ---');
assert.equal(LEVEL.VOID_DEATH_Y, -36.0);
assert.equal(LEVEL.ABYSS_VISUAL_Y, -35.0);
assert.equal(LEVEL.STANDARD_CHUNK_COUNT, 8);
assert.equal(LEVEL.ENDLESS_ACTIVE_CHUNKS, 5);
console.log('✅ All LEVEL parameters verified');

// 7. CONFIG.COLORS Palette (V3.0 Tron / City / Black Hole / Hazards / Legacy)
console.log('\n--- TEST 7: CONFIG.COLORS Tron / City / Black Hole Palette ---');
const expectedColors = {
  SKY_TOP: 0x020308,
  SKY_BOTTOM: 0x060b18,
  FOG: 0x040711,
  HOOK_LEFT: 0xff0044,
  HOOK_RIGHT: 0x00aaff,
  BLOCK_BASE: 0x0d1017,
  BLOCK_STRIPE_CYAN: 0x00f0ff,
  BLOCK_STRIPE_BLUE: 0x0077ff,
  BLOCK_STRIPE_RED: 0xff0055,
  BLOCK_NEON_EDGE: 0x00f0ff,
  BLOCK_NEON_ALT: 0x0077ff,
  CITY_SILHOUETTE: 0x070a12,
  CITY_WINDOW_NEON: 0x00d8ff,
  START_PAD_BASE: 0x0d1017,
  START_PAD_NEON: 0x00ffcc,
  FINISH_GATE: 0x00f0ff,
  BLACKHOLE_CORE: 0x000000,
  BLACKHOLE_HALO: 0x7b2cbf,
  BLACKHOLE_DISK: 0x00f0ff,
  HAZARD_LAVA: 0xff5500,
  HAZARD_GRID: 0xffaa00,
  SPARK_WHITE: 0xd8f8ff,
  // Legacy aliases
  STONE_PRIMARY: 0x0d1017,
  STONE_SECONDARY: 0x161c28,
  START_PAD: 0x00ffcc,
};

for (const [key, expectedValue] of Object.entries(expectedColors)) {
  assert.equal(
    COLORS[key],
    expectedValue,
    `COLORS.${key} is 0x${expectedValue.toString(16)} (got 0x${COLORS[key]?.toString(16)})`
  );
}
console.log('✅ All 24 colors including City, Black Hole, and legacy aliases verified');

// 8. CONFIG.FX Parameters (V3.0 additions: FINISHING_DELAY_MS, TRAIL_POINTS)
console.log('\n--- TEST 8: CONFIG.FX Parameters ---');
const expectedFX = {
  DEATH_DELAY_MS: 1150,
  FINISHING_DELAY_MS: 1350,
  SHATTER_COUNT: 32,
  SHATTER_DURATION: 1.15,
  SHATTER_GRAVITY: 18.0,
  IMPACT_POOL_SIZE: 6,
  IMPACT_PARTICLE_COUNT: 18,
  IMPACT_DURATION: 0.38,
  TRAIL_POINTS: 36,
};

for (const [key, expectedValue] of Object.entries(expectedFX)) {
  assert.equal(
    FX[key],
    expectedValue,
    `FX.${key} is ${expectedValue} (got ${FX[key]})`
  );
}
assert.equal(FX.FINISHING_DELAY_MS, 1350, 'FINISHING_DELAY_MS === 1350');
assert.equal(FX.TRAIL_POINTS, 36, 'TRAIL_POINTS === 36');
console.log('✅ All 9 FX parameters verified (including FINISHING_DELAY_MS & TRAIL_POINTS)');

// 9. CONFIG.COURSES Presets
console.log('\n--- TEST 9: CONFIG.COURSES Presets ---');
assert.deepEqual(COURSES[1], {
  id: 1,
  name: 'Skyline Sprint',
  seed: 1042,
  chunks: [1, 2, 3, 4, 5, 6],
  authorTime: 22.0,
  goldTime: 26.0,
  silverTime: 32.0,
  bronzeTime: 40.0,
  isEndless: false,
});
assert.deepEqual(COURSES[2], {
  id: 2,
  name: 'Citadel Ascent',
  seed: 8821,
  chunks: [1, 3, 2, 4, 3, 5, 2, 6],
  authorTime: 31.0,
  goldTime: 36.0,
  silverTime: 44.0,
  bronzeTime: 55.0,
  isEndless: false,
});
assert.deepEqual(COURSES[3], {
  id: 3,
  name: 'Hyperion Gauntlet',
  seed: 9999,
  chunks: [2, 5, 3, 4, 5, 2, 4, 5, 3, 6],
  authorTime: 42.0,
  goldTime: 49.0,
  silverTime: 60.0,
  bronzeTime: 75.0,
  isEndless: false,
});
assert.deepEqual(COURSES[4], {
  id: 4,
  name: 'Endless Abyss',
  seed: 0,
  chunks: [],
  isEndless: true,
});
console.log('✅ Standard courses 1-3 and Endless course 4 verified with exact V3 chunk sequences');

// 10. Non-Enumerable Helpers and Iterator on CONFIG.COURSES
console.log('\n--- TEST 10: Non-Enumerable Helpers on CONFIG.COURSES ---');
const keys = Object.keys(COURSES);
assert.deepEqual(keys, ['1', '2', '3', '4'], 'Only course IDs are enumerable on COURSES');

const helpers = ['find', 'filter', 'map', 'forEach', 'some', 'list'];
for (const helper of helpers) {
  const desc = Object.getOwnPropertyDescriptor(COURSES, helper);
  assert.ok(desc, `Helper ${helper} is defined on COURSES`);
  assert.equal(desc.enumerable, false, `Helper ${helper} is non-enumerable`);
  assert.equal(desc.configurable, true, `Helper ${helper} is configurable`);
  if ('writable' in desc) {
    assert.equal(desc.writable, true, `Helper ${helper} is writable`);
  }
}
const iterDesc = Object.getOwnPropertyDescriptor(COURSES, Symbol.iterator);
assert.ok(iterDesc, 'Symbol.iterator is defined on COURSES');
assert.equal(iterDesc.enumerable, false, 'Symbol.iterator is non-enumerable');
assert.equal(iterDesc.configurable, true, 'Symbol.iterator is configurable');
assert.equal(iterDesc.writable, true, 'Symbol.iterator is writable');

// Test Symbol.iterator
const spreadCourses = [...COURSES];
assert.equal(spreadCourses.length, 4, 'Iterator spreads 4 courses');
assert.equal(spreadCourses[0].id, 1);
assert.equal(spreadCourses[3].id, 4);

// Test find
const c2 = COURSES.find((c) => c.id === 2);
assert.equal(c2.name, 'Citadel Ascent', 'find locates course 2');

// Test filter
const timedCourses = COURSES.filter((c) => !c.isEndless);
assert.equal(timedCourses.length, 3, 'filter returns 3 timed courses');

// Test map
const names = COURSES.map((c) => c.name);
assert.deepEqual(
  names,
  ['Skyline Sprint', 'Citadel Ascent', 'Hyperion Gauntlet', 'Endless Abyss'],
  'map extracts all course names'
);

// Test forEach
let visitedCount = 0;
COURSES.forEach((c) => {
  assert.ok(c.id >= 1 && c.id <= 4);
  visitedCount++;
});
assert.equal(visitedCount, 4, 'forEach visited all 4 courses');

// Test some
assert.equal(COURSES.some((c) => c.isEndless), true, 'some detects endless course');
assert.equal(COURSES.some((c) => c.id === 99), false, 'some returns false for missing course');

// Test thisArg support
const context = { threshold: 30 };
const fastCourses = COURSES.filter(function (c) {
  return c.authorTime && c.authorTime < this.threshold;
}, context);
assert.equal(fastCourses.length, 1, 'filter respects thisArg');
assert.equal(fastCourses[0].name, 'Skyline Sprint');

// Test list getter
assert.equal(Array.isArray(COURSES.list), true, 'COURSES.list returns an Array');
assert.equal(COURSES.list.length, 4, 'COURSES.list has 4 items');

// Test immutability / defensive copy on .list
const listCopy = COURSES.list;
listCopy.pop();
assert.equal(listCopy.length, 3, 'Caller mutated their list copy');
assert.equal(COURSES.list.length, 4, 'COURSES.list was not corrupted by caller pop');
assert.equal([...COURSES].length, 4, 'COURSES iterator was not corrupted');

// Test dynamic addition and removal of course 5
COURSES[5] = { id: 5, name: 'Quantum Void', seed: 4242, chunks: [1, 3, 5], isEndless: false };
assert.equal(COURSES.list.length, 5, 'COURSES.list dynamically reflects added course 5');
assert.equal(COURSES.find((c) => c.id === 5)?.name, 'Quantum Void', 'find locates added course 5');
assert.equal([...COURSES].length, 5, 'Iterator yields added course 5');

delete COURSES[5];
assert.equal(COURSES.list.length, 4, 'COURSES.list reflects deleted course 5');
assert.equal(COURSES.find((c) => c.id === 5), undefined, 'find returns undefined after deletion');

console.log('✅ Non-enumerable helpers passed all functional and edge-case tests');

console.log('\n====================================================');
console.log('🎉 ALL V3.0 CONFIGURATION SPECIFICATION TESTS PASSED!');
console.log('====================================================');
