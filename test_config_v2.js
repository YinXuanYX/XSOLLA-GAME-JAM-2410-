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
console.log('🧪 TESTING AERO-HOOK CONFIGURATION V2.0 SPECIFICATION');
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

// 2. CONFIG.COLORS Palette
console.log('\n--- TEST 2: CONFIG.COLORS Tron / Beat Saber Palette ---');
const expectedColors = {
  SKY_TOP: 0x020308,
  SKY_BOTTOM: 0x070b16,
  FOG: 0x040711,
  HOOK_LEFT: 0xff0044,
  HOOK_RIGHT: 0x00aaff,
  BLOCK_BASE: 0x10141f,
  BLOCK_NEON_EDGE: 0x00f0ff,
  BLOCK_NEON_ALT: 0x3b82f6,
  START_PAD_BASE: 0x10141f,
  START_PAD_NEON: 0x00ffcc,
  FINISH_GATE: 0xfacc15,
  HAZARD_LAVA: 0xff5500,
  HAZARD_GRID: 0xffaa00,
  SPARK_WHITE: 0xd8f8ff,
  // Backward compatibility legacy aliases
  STONE_PRIMARY: 0x10141f,
  STONE_SECONDARY: 0x1a2234,
  START_PAD: 0x00ffcc,
};

for (const [key, expectedValue] of Object.entries(expectedColors)) {
  assert.equal(
    COLORS[key],
    expectedValue,
    `COLORS.${key} is 0x${expectedValue.toString(16)} (got 0x${COLORS[key]?.toString(16)})`
  );
}
console.log('✅ All 14 Tron/Beat Saber colors and 3 legacy aliases verified');

// 3. CONFIG.FX Parameters
console.log('\n--- TEST 3: CONFIG.FX Parameters ---');
const expectedFX = {
  DEATH_DELAY_MS: 1150,
  SHATTER_COUNT: 32,
  SHATTER_DURATION: 1.15,
  SHATTER_GRAVITY: 18.0,
  IMPACT_POOL_SIZE: 6,
  IMPACT_PARTICLE_COUNT: 18,
  IMPACT_DURATION: 0.38,
};

for (const [key, expectedValue] of Object.entries(expectedFX)) {
  assert.equal(
    FX[key],
    expectedValue,
    `FX.${key} is ${expectedValue} (got ${FX[key]})`
  );
}
console.log('✅ All 7 FX parameters verified');

// 4. CONFIG.GRAPPLE.ROPE_RADIUS
console.log('\n--- TEST 4: CONFIG.GRAPPLE.ROPE_RADIUS ---');
assert.equal(GRAPPLE.ROPE_RADIUS, 0.045, 'ROPE_RADIUS is 0.045m');
console.log('✅ GRAPPLE.ROPE_RADIUS verified');

// 5. CONFIG.COURSES Presets
console.log('\n--- TEST 5: CONFIG.COURSES Presets ---');
assert.equal(COURSES[1].name, 'Skyline Sprint');
assert.equal(COURSES[2].name, 'Citadel Ascent');
assert.equal(COURSES[3].name, 'Hyperion Gauntlet');
assert.equal(COURSES[4].name, 'Endless Abyss');
assert.equal(COURSES[4].isEndless, true);
console.log('✅ Standard courses 1-3 and Endless course 4 verified');

// 6. Non-Enumerable Helpers on CONFIG.COURSES
console.log('\n--- TEST 6: Non-Enumerable Helpers on CONFIG.COURSES ---');
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

// Test dynamic addition of course 5
COURSES[5] = { id: 5, name: 'Secret Sector', seed: 4242, chunks: [1, 3, 5] };
assert.equal(COURSES.list.length, 5, 'COURSES.list dynamically reflects added course 5');
assert.equal(COURSES.find((c) => c.id === 5)?.name, 'Secret Sector', 'find locates added course 5');
assert.equal([...COURSES].length, 5, 'Iterator yields added course 5');

// Clean up added course 5
delete COURSES[5];
assert.equal(COURSES.list.length, 4, 'COURSES.list reflects deleted course 5');
assert.equal(COURSES.find((c) => c.id === 5), undefined, 'find returns undefined after deletion');

console.log('✅ Non-enumerable helpers passed all functional and edge-case tests');

console.log('\n====================================================');
console.log('🎉 ALL CONFIGURATION SPECIFICATION TESTS PASSED!');
console.log('====================================================');
