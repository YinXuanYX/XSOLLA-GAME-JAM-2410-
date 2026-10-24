/**
 * AERO-HOOK Configuration Constants
 * Master configuration object containing all physics constants, movement speeds,
 * grapple mechanics, camera tuning, level settings, colors, and course presets.
 */
export const CONFIG = {
  PHYSICS: {
    TIMESTEP: 1 / 60,
    MAX_SUBSTEPS: 3,
    GRAVITY: -24.0,                // m/s^2 (snappy arcade gravity)
    PLAYER_MASS: 70.0,             // kg
    PLAYER_RADIUS: 1.0,            // m (CANNON.Sphere radius)
    LINEAR_DAMPING: 0.08,          // Baseline air resistance
    WALL_FRICTION: 0.0,            // Zero friction so grazing walls preserves momentum
    WALL_RESTITUTION: 0.1,         // Slight bounce off surfaces
    MAX_SPEED: 75.0,               // Hard velocity clamp (m/s)
  },
  MOVEMENT: {
    AIR_STRAFE_ACCEL: 14.0,        // m/s^2 horizontal WASD nudge acceleration
    AIR_STRAFE_MAX_SPEED: 20.0,    // Max directional speed contribution from WASD alone
  },
  GRAPPLE: {
    MAX_RANGE: 85.0,               // Maximum hook attach distance from player (m)
    MIN_DETACH_DIST: 2.5,          // Distance from anchor where pull force softens (m)
    SINGLE_PULL_ACCEL: 58.0,       // Pull acceleration when 1 hook is active (m/s^2)
    DUAL_PULL_ACCEL: 37.7,         // Pull acceleration per hook when BOTH are active (1.3x combined)
    TENSION_DAMPING: 8.5,          // Multiplier to cancel velocity moving away from anchor
    MAGNETISM_ANGLES_DEG: [1.5, 3.0], // Cone assist angles when center raycast misses
    MAGNETISM_RAYS_PER_RING: 8,    // Number of radial rays per cone ring
    ROPE_RADIUS: 0.045,            // 3D cylinder radius for rendered grapple line
  },
  CAMERA: {
    BASE_FOV: 70,                  // Degrees at rest
    MAX_FOV: 98,                   // Degrees at MAX_SPEED
    FOV_MIN_SPEED: 15.0,           // Speed threshold where FOV starts widening
    FOV_LERP_SPEED: 8.0,           // Camera FOV interpolation speed
    ARM_DISTANCE: 6.5,             // Distance behind player (m)
    ARM_HEIGHT: 1.8,               // Vertical offset above player center (m)
    SHOULDER_OFFSET: 0.65,         // Right-shoulder offset so player doesn't block crosshair (m)
    SENSITIVITY: 0.0022,           // Mouse radians per pixel
    PITCH_MIN: -Math.PI * 0.44,    // -80 degrees
    PITCH_MAX: Math.PI * 0.44,     // +80 degrees
  },
  LEVEL: {
    VOID_DEATH_Y: -30.0,           // Y threshold for instant death
    ABYSS_VISUAL_Y: -35.0,         // Y position of animated low-poly lava/grid plane
    STANDARD_CHUNK_COUNT: 8,       // Number of chunks in a standard Time-Trial course
    ENDLESS_ACTIVE_CHUNKS: 5,      // Number of chunks kept alive simultaneously in Endless Mode
  },
  COLORS: {
    SKY_TOP: 0x020308,             // Deep Tron pitch black-blue
    SKY_BOTTOM: 0x070b16,          // Dark cyber horizon
    FOG: 0x040711,                 // Deep void fog
    HOOK_LEFT: 0xff0044,           // Beat Saber Crimson Red - Left Hook / Left Side
    HOOK_RIGHT: 0x00aaff,          // Beat Saber Electric Blue - Right Hook / Right Side
    BLOCK_BASE: 0x10141f,          // Dark obsidian futuristic monolith base
    BLOCK_NEON_EDGE: 0x00f0ff,     // Cyan Tron circuit wireframe edge
    BLOCK_NEON_ALT: 0x3b82f6,      // Electric blue secondary circuit stripe
    START_PAD_BASE: 0x10141f,      // Dark obsidian start pad base
    START_PAD_NEON: 0x00ffcc,      // Cyber teal trim
    FINISH_GATE: 0xfacc15,         // Neon gold finish ring
    HAZARD_LAVA: 0xff5500,         // Bright Neon Orange Lava Tile
    HAZARD_GRID: 0xffaa00,         // Glowing yellow-orange lava tile border
    SPARK_WHITE: 0xd8f8ff,         // Bright white-cyan spark dust
    // Legacy aliases for backward compatibility
    STONE_PRIMARY: 0x10141f,
    STONE_SECONDARY: 0x1a2234,
    START_PAD: 0x00ffcc,
  },
  FX: {
    DEATH_DELAY_MS: 1150,          // Delay ms before showing DEAD modal after explosion
    SHATTER_COUNT: 32,             // Number of red/blue shards when player explodes
    SHATTER_DURATION: 1.15,        // Lifetime in s of shatter explosion shards
    SHATTER_GRAVITY: 18.0,         // Downward acceleration m/s^2 on explosion shards
    IMPACT_POOL_SIZE: 6,           // Number of pre-allocated dust burst emitters
    IMPACT_PARTICLE_COUNT: 18,     // Dust/spark particles spawned per grapple connect
    IMPACT_DURATION: 0.38,         // Lifetime in s of grapple impact dust particles
  },
  COURSES: {
    1: {
      id: 1,
      name: 'Skyline Sprint',
      seed: 1042,
      chunks: [1, 2, 3, 4, 5, 6],
      authorTime: 22.0,
      goldTime: 26.0,
      silverTime: 32.0,
      bronzeTime: 40.0,
    },
    2: {
      id: 2,
      name: 'Citadel Ascent',
      seed: 8821,
      chunks: [1, 2, 3, 4, 2, 5, 3, 6],
      authorTime: 31.0,
      goldTime: 36.0,
      silverTime: 44.0,
      bronzeTime: 55.0,
    },
    3: {
      id: 3,
      name: 'Hyperion Gauntlet',
      seed: 9999,
      chunks: [2, 5, 3, 4, 5, 2, 4, 5, 3, 6],
      authorTime: 42.0,
      goldTime: 49.0,
      silverTime: 60.0,
      bronzeTime: 75.0,
    },
    4: {
      id: 4,
      name: 'Endless Abyss',
      seed: 0,
      chunks: [],
      isEndless: true,
    },
  },
};

// Course array helper for iteration
const COURSE_ARRAY = [
  CONFIG.COURSES[1],
  CONFIG.COURSES[2],
  CONFIG.COURSES[3],
  CONFIG.COURSES[4],
];

// Attach non-enumerable helpers to CONFIG.COURSES for ergonomics and compatibility
Object.defineProperties(CONFIG.COURSES, {
  [Symbol.iterator]: {
    enumerable: false,
    value: function* () {
      yield* COURSE_ARRAY;
    },
  },
  find: {
    enumerable: false,
    value: function (predicate) {
      return COURSE_ARRAY.find(predicate);
    },
  },
  filter: {
    enumerable: false,
    value: function (predicate) {
      return COURSE_ARRAY.filter(predicate);
    },
  },
  map: {
    enumerable: false,
    value: function (callback) {
      return COURSE_ARRAY.map(callback);
    },
  },
  forEach: {
    enumerable: false,
    value: function (callback) {
      COURSE_ARRAY.forEach(callback);
    },
  },
  some: {
    enumerable: false,
    value: function (predicate) {
      return COURSE_ARRAY.some(predicate);
    },
  },
  list: {
    enumerable: false,
    get: function () {
      return COURSE_ARRAY;
    },
  },
});

// Named exports for individual subsystems
export const {
  PHYSICS,
  MOVEMENT,
  GRAPPLE,
  CAMERA,
  LEVEL,
  COLORS,
  FX,
  COURSES,
} = CONFIG;

export default CONFIG;
