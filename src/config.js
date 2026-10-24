/**
 * AERO-HOOK Configuration Constants (Version 3.0)
 * Master configuration object containing all physics constants, movement speeds,
 * grapple mechanics, camera tuning, level settings, colors, fx, and course presets.
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
    VOID_DEATH_Y: -36.0,           // Y threshold for instant death (-36.0m allows swings above lava abyss at -35.0m)
    ABYSS_VISUAL_Y: -35.0,         // Y position of animated low-poly lava/grid plane
    STANDARD_CHUNK_COUNT: 8,       // Number of chunks in a standard Time-Trial course
    ENDLESS_ACTIVE_CHUNKS: 5,      // Number of chunks kept alive simultaneously in Endless Mode
  },
  COLORS: {
    SKY_TOP: 0x020308,             // Deep Tron pitch black-blue
    SKY_BOTTOM: 0x060b18,          // Dark cyber city horizon
    FOG: 0x040711,                 // Deep void fog
    HOOK_LEFT: 0xff0044,           // Beat Saber Crimson Red (Left Hook / Left Side)
    HOOK_RIGHT: 0x00aaff,          // Beat Saber Electric Blue (Right Hook / Right Side)
    BLOCK_BASE: 0x0d1017,          // Solid matte dark obsidian architectural block
    BLOCK_STRIPE_CYAN: 0x00f0ff,   // Wide cyan neon slab stripe
    BLOCK_STRIPE_BLUE: 0x0077ff,   // Wide electric blue neon slab stripe
    BLOCK_STRIPE_RED: 0xff0055,    // Wide crimson accent slab stripe
    BLOCK_NEON_EDGE: 0x00f0ff,     // Legacy alias
    BLOCK_NEON_ALT: 0x0077ff,      // Legacy alias
    CITY_SILHOUETTE: 0x070a12,     // Minimalist background megacity building body
    CITY_WINDOW_NEON: 0x00d8ff,    // Minimalist city vertical light strip
    START_PAD_BASE: 0x0d1017,      // Dark obsidian start pad base
    START_PAD_NEON: 0x00ffcc,      // Cyber teal trim
    FINISH_GATE: 0x00f0ff,         // Accretion ring cyan
    BLACKHOLE_CORE: 0x000000,      // Pitch black event horizon sphere
    BLACKHOLE_HALO: 0x7b2cbf,      // Deep violet-blue gravitational lensing halo
    BLACKHOLE_DISK: 0x00f0ff,      // Bright cyan-white accretion disk
    HAZARD_LAVA: 0xff5500,         // Bright Neon Orange Lava Tile
    HAZARD_GRID: 0xffaa00,         // Glowing yellow-orange lava tile border
    SPARK_WHITE: 0xd8f8ff,         // Bright white-cyan spark dust
    STONE_PRIMARY: 0x0d1017,       // Legacy alias
    STONE_SECONDARY: 0x161c28,     // Legacy alias
    START_PAD: 0x00ffcc,           // Legacy alias
  },
  FX: {
    DEATH_DELAY_MS: 1150,          // Delay (ms) before showing DEAD modal after explosion
    FINISHING_DELAY_MS: 1350,      // Delay (ms) while Black Hole implodes & explodes before WIN modal
    SHATTER_COUNT: 32,             // Number of red/blue shards when player explodes
    SHATTER_DURATION: 1.15,        // Lifetime (s) of shatter explosion shards
    SHATTER_GRAVITY: 18.0,         // Downward acceleration (m/s^2) on explosion shards
    IMPACT_POOL_SIZE: 6,           // Number of pre-allocated dust burst emitters
    IMPACT_PARTICLE_COUNT: 18,     // Dust/spark particles spawned per grapple connect
    IMPACT_DURATION: 0.38,         // Lifetime (s) of grapple impact dust particles
    TRAIL_POINTS: 36,              // Number of nodes in each Tron light-wall ribbon
  },
  BLOOM: {
    STRENGTH: 0.65,                // UnrealBloomPass bloom strength
    RADIUS: 0.28,                  // UnrealBloomPass bloom radius (tight corona glow)
    THRESHOLD: 0.82,               // Bloom luminance threshold (only bright emissives bloom)
  },
  COURSES: {
    1: { id: 1, name: 'Skyline Sprint', seed: 1042, chunks: [1, 2, 3, 4, 5, 6], authorTime: 22.0, goldTime: 26.0, silverTime: 32.0, bronzeTime: 40.0, isEndless: false },
    2: { id: 2, name: 'Citadel Ascent', seed: 8821, chunks: [1, 3, 2, 4, 3, 5, 2, 6], authorTime: 31.0, goldTime: 36.0, silverTime: 44.0, bronzeTime: 55.0, isEndless: false },
    3: { id: 3, name: 'Hyperion Gauntlet', seed: 9999, chunks: [2, 5, 3, 4, 5, 2, 4, 5, 3, 6], authorTime: 42.0, goldTime: 49.0, silverTime: 60.0, bronzeTime: 75.0, isEndless: false },
    4: { id: 4, name: 'Endless Abyss', seed: 0, chunks: [], isEndless: true }
  }
};

/**
 * Helper to retrieve an ordered list of courses from CONFIG.COURSES.
 * Collects all enumerable course objects (sorted by numeric key if present).
 * Returns a defensive copy to prevent callers from corrupting the internal collection.
 *
 * @param {object} [target]
 * @returns {Array<object>}
 */
function getCourseList(target = CONFIG.COURSES) {
  const source = target && typeof target === 'object' ? target : CONFIG.COURSES;
  return Object.keys(source)
    .sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return String(a).localeCompare(String(b));
    })
    .map((k) => source[k]);
}

// Attach non-enumerable helpers to CONFIG.COURSES for ergonomics and compatibility
Object.defineProperties(CONFIG.COURSES, {
  [Symbol.iterator]: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function* () {
      yield* getCourseList(this);
    },
  },
  find: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function (predicate, thisArg) {
      return getCourseList(this).find(predicate, thisArg);
    },
  },
  filter: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function (predicate, thisArg) {
      return getCourseList(this).filter(predicate, thisArg);
    },
  },
  map: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function (callback, thisArg) {
      return getCourseList(this).map(callback, thisArg);
    },
  },
  forEach: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function (callback, thisArg) {
      getCourseList(this).forEach(callback, thisArg);
    },
  },
  some: {
    enumerable: false,
    configurable: true,
    writable: true,
    value: function (predicate, thisArg) {
      return getCourseList(this).some(predicate, thisArg);
    },
  },
  list: {
    enumerable: false,
    configurable: true,
    get: function () {
      return getCourseList(this);
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
  BLOOM,
  COURSES,
} = CONFIG;

export default CONFIG;
