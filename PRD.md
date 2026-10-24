# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Project Title:** AERO-HOOK  
**Document Version:** 1.0.0 (Master Specification for Autonomous Coding Agents)  
**Target Platform:** Desktop Web Browser (HTML5 / WebGL2)  
**Input Scheme:** Mouse (PointerLock) + Keyboard (WASD)  
**Tech Stack:** Vanilla JavaScript (ES Modules), Three.js (`^0.160.0`), `cannon-es` (`^0.20.0`), Vite (`^5.0.0`), Web Audio API  

---

## 1. PRODUCT OVERVIEW & CORE PILLARS

### 1.1 High-Concept Pitch
**AERO-HOOK** is a high-speed, 3D third-person momentum parkour time-trial game. The player traverses suspended low-poly sky-courses above a lethal abyss using **independent dual linear-pull grappling hooks** (Left Hook on `Mouse0`, Right Hook on `Mouse2`). 

### 1.2 Core Design Pillars (Strict Agent Constraints)
1. **Pure Hookshot Traversal:** The player **cannot jump** and **cannot air-dash**. Once leaving the starting platform, 100% of verticality and propulsion comes from firing, holding, and strategically releasing the Left and Right grappling hooks.
2. **Linear Pull + Conserved Momentum:** Hooks act as high-powered winches that pull the player directly toward the anchor point while held, cancelling downward fall slack and redirecting velocity. Releasing a hook (`mouseup`) immediately detaches the tether and **conserves 100% of the player's current velocity vector**.
3. **Floor is Lava (The Void):** Touching the abyss plane below the course ($Y < -30.0\text{ m}$) or colliding with red hazard blocks results in an instant **Void Death** and `< 50ms` instant restart via the `R` key.
4. **Zero External Assets:** All 3D geometry (character rig, ropes, monoliths, rings, hazard blocks, skybox) must be procedurally generated in code using flat-shaded low-poly `THREE.BufferGeometry` primitives. All audio effects must be synthesized in real time using the browser's native `AudioContext`.

---

## 2. SYSTEM ARCHITECTURE & FILE STRUCTURE

Coding agents must adhere to the following modular directory structure. Do not use React, Vue, or external CSS frameworks.

```text
/
├── index.html               # DOM structure, HUD overlays, SVG crosshair, menu modals
├── style.css                # HUD layout, animations, speed-lines overlay, typography
├── package.json             # Dependencies: three, cannon-es, vite
└── src/
    ├── main.js              # Application entry, GameState FSM, master requestAnimationFrame loop
    ├── config.js            # Single source of truth for all physics constants, colors, course seeds
    ├── PhysicsWorld.js      # cannon-es World initialization, materials, fixed-step solver
    ├── PlayerController.js  # Player physics sphere, procedural 3rd-person low-poly rig, air-strafe
    ├── GrappleSystem.js     # Dual-hook state machine, hybrid raycaster, pull force math, 3D ropes
    ├── CameraController.js  # PointerLock 3rd-person spring-arm camera, wall-clip raycast, dynamic FOV
    ├── LevelGenerator.js    # Seeded PRNG, 6 procedural chunk builders, course assembly, Endless queue
    ├── UIManager.js         # Millisecond speedrun timer, speedometer, crosshair state, PB localStorage
    └── AudioSynth.js        # Procedural Web Audio API sound generator (hooks, wind, win, death)
```

---

## 3. CONFIGURATION CONSTANTS (`src/config.js`)

All agents must import and reference this exact configuration object to ensure physics, camera, and level scaling remain synchronized across modules.

```javascript
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
    SKY_TOP: 0x0b1021,
    SKY_BOTTOM: 0x1e293b,
    FOG: 0x162032,
    HOOK_LEFT: 0x00f0ff,           // Cyan
    HOOK_RIGHT: 0xff6b00,          // Neon Orange
    STONE_PRIMARY: 0xd8dee9,       // Low-poly brutalist light slate
    STONE_SECONDARY: 0x4c566a,     // Low-poly dark slate accent
    START_PAD: 0x10b981,           // Emerald green
    FINISH_GATE: 0xfacc15,         // Gold
    HAZARD_LAVA: 0xff1e42,         // Crimson emissive
  }
};
```

---

## 4. DETAILED MODULE SPECIFICATIONS

### 4.1 Game State Machine (`src/main.js`)
The application operates on a strict 5-state finite state machine (`GameState`):
1. **`MENU`**: Initial title screen overlay. Camera slowly orbits the player standing on the Start Pad. Clicking `"PLAY COURSE"` requests `document.body.requestPointerLock()`.
2. **`READY`**: Player is spawned at `(0, 3, 0)` on the Start Pad. PointerLock is active. The player can look around and fire hooks. **The speedrun timer reads `00:00.000` and is paused.**
3. **`RUNNING`**: Triggered the exact millisecond the player either:
   * Successfully attaches a grapple hook (`Hook_L` or `Hook_R`), OR
   * Leaves the bounding cylinder of the Start Pad ($\sqrt{x^2 + z^2} > 8.0\text{ m}$).
   * The millisecond timer increments every frame via `performance.now() - runStartTime`.
4. **`DEAD`**: Triggered when `player.position.y < CONFIG.LEVEL.VOID_DEATH_Y` or upon contact with a `HAZARD` physics body.
   * Detaches all hooks immediately.
   * Plays synthesized death sound.
   * Displays `"VOID FALL — PRESS [R] OR [CLICK] TO RESTART"` overlay.
5. **`FINISHED`**: Triggered when the player passes through the Finish Gate Ring plane ($Z \le Z_{\text{finish}}$ and distance from gate center $< R_{\text{gate}}$).
   * Stops timer, compares against `localStorage` Personal Best (PB), awards Medal (**Author / Gold / Silver / Bronze**), and displays split summary.
   * Pressing `R` immediately resets back to `READY` state in `< 50ms` without reloading the page or regenerating static meshes.

---

### 4.2 Physics World & Collision Filtering (`src/PhysicsWorld.js`)
* Initialize `new CANNON.World()` with `SAPBroadphase` (Sweep-and-Prune) for fast raycasting and collision checks along the $-Z$ corridor.
* Define two `CANNON.Material` instances: `playerMaterial` and `worldMaterial`.
* Register a `CANNON.ContactMaterial(playerMaterial, worldMaterial, { friction: 0.0, restitution: 0.1 })`.
* **Why `friction: 0.0` is mandatory:** In a high-speed grapple game, if the player scrapes against the side of a pillar at `60 m/s`, standard friction will snag their sphere body and kill their run. Zero friction allows smooth wall-skimming.
* Tag every static level body with `body.userData = { type: 'GRAPPLEABLE' | 'HAZARD' | 'START_PAD' }`.

---

### 4.3 Player Controller & Procedural 3rd-Person Avatar (`src/PlayerController.js`)

#### A. Physics Body & Air-Strafe Logic
* Create a `CANNON.Body({ mass: 70, shape: new CANNON.Sphere(1.0), fixedRotation: true, linearDamping: 0.08 })`.
* **No Jump / No Dash:** Ignore `Space` and `Shift` during `RUNNING` state.
* **Air-Strafe Vector Math:**
  Given camera yaw angle $\theta$, compute horizontal unit vectors:
  $$\hat{f} = (-\sin\theta, 0, -\cos\theta), \quad \hat{r} = (\cos\theta, 0, -\sin\theta)$$
  From `WASD` state, compute desired horizontal direction $\hat{d}_{\text{wish}}$. If $\|\hat{d}_{\text{wish}}\| > 0$:
  * Project current horizontal velocity onto wish direction: $v_{\text{proj}} = \vec{v}_{xz} \cdot \hat{d}_{\text{wish}}$.
  * If $v_{\text{proj}} < \text{AIR\_STRAFE\_MAX\_SPEED}$ (`20.0 m/s`), apply force:
    $$\vec{F}_{\text{strafe}} = m \cdot \text{AIR\_STRAFE\_ACCEL} \cdot \hat{d}_{\text{wish}}$$

#### B. Procedural Low-Poly Character Mesh
Construct a hierarchical `THREE.Group` synced to the physics sphere position:
1. **Core Torso:** `THREE.ConeGeometry(0.45, 1.1, 6)` inverted, flat-shaded (`0x2e3440`), tilted forward based on horizontal speed.
2. **Head & Visor:** `THREE.OctahedronGeometry(0.28, 1)` (`0x4c566a`) with a glowing cyan visor `THREE.BoxGeometry(0.36, 0.1, 0.25)` (`0x00f0ff`).
3. **Hip ODM Launchers:** Left hip at `(-0.42, -0.1, 0)` and Right hip at `(+0.42, -0.1, 0)` using angled `THREE.BoxGeometry(0.18, 0.22, 0.45)` meshes. Store world-space helper `Object3D` nodes (`leftMuzzle`, `rightMuzzle`) inside these pods as the exact origin points for the 3D grapple ropes.
4. **Procedural Banking & Pitch Animation:**
   * **Yaw Alignment:** Smoothly slerp the character's yaw toward the horizontal velocity vector $\text{atan2}(-v_x, -v_z)$ when airborne, or toward camera yaw when stationary.
   * **Forward Pitch:** Pitch torso forward up to `0.65 rad` ($37^\circ$) proportional to $\|\vec{v}_{xz}\| / \text{MAX\_SPEED}$.
   * **Lateral Bank (Roll):** Roll the character mesh into turns and active single-hook pulls (`roll = clamp(-angularTurnRate * 0.4, -0.55, 0.55)`).
5. **High-Speed Ribbon Trail:**
   * Maintain a 24-point ring buffer of recent world positions of the player's back.
   * Update a dynamic `THREE.BufferGeometry` ribbon mesh with vertex alpha fading from `0.8` to `0.0` when $\|\vec{v}\| > 25\text{ m/s}$.

---

### 4.4 Dual-Hook Grapple System (`src/GrappleSystem.js`)

The `GrappleSystem` manages two independent hook channels:
* `hooks.left` (triggered by `Mouse0`, color `0x00f0ff`)
* `hooks.right` (triggered by `Mouse2`, color `0xff6b00`)

#### A. Input Handling & Context Menu Prevention
* Attach `window.addEventListener('contextmenu', e => e.preventDefault())` so right-clicking never opens the browser context menu or breaks `PointerLock`.
* On `mousedown`:
  * `event.button === 0`: Call `tryFireHook('left')`
  * `event.button === 2`: Call `tryFireHook('right')`
* On `mouseup`:
  * `event.button === 0`: Call `releaseHook('left')`
  * `event.button === 2`: Call `releaseHook('right')`

#### B. Hybrid Raycast + Magnetism Cone Targeting Algorithm
Run `findTargetPoint()` every frame (for live HUD reticle feedback) and on hook fire:
1. **Center-Screen Direct Raycast:**
   * Origin: `camera.position`
   * Direction: `camera.getWorldDirection(forward)`
   * Max Raycaster Distance: `CONFIG.GRAPPLE.MAX_RANGE + CONFIG.CAMERA.ARM_DISTANCE` (`91.5m` from camera, then verify distance from `player.position` to `hit.point` is $\le 85.0\text{ m}$).
   * Filter: Intersect ONLY `levelGenerator.grappleableMeshes` (never intersect player mesh, ropes, skybox, or hazard lava).
   * If valid hit found $\rightarrow$ Return `{ hit: true, point: hit.point, normal: hit.face.normal, assisted: false, distance }`.
2. **Magnetism Cone Fallback (If Center Ray Misses):**
   * Construct two orthogonal basis vectors $\hat{u}, \hat{v}$ perpendicular to camera `forward`.
   * For each ring angle $\alpha \in \{1.5^\circ, 3.0^\circ\}$ and for $k \in \{0 \dots 7\}$ ($\phi_k = k \frac{\pi}{4}$):
     $$\vec{d}_{\text{cone}} = \text{normalize}\big(\text{forward} + \tan(\alpha)(\cos\phi_k \hat{u} + \sin\phi_k \hat{v})\big)$$
   * Cast ray along $\vec{d}_{\text{cone}}$. Collect all valid hits within `85.0m` of the player.
   * Pick the hit with the **smallest angular deviation** from `forward` $\rightarrow$ Return `{ hit: true, point: bestHit.point, normal: bestHit.face.normal, assisted: true, distance }`.
3. **Miss:** Return `{ hit: false }`.

#### C. Dual-Hook Physics Pull & Slack-Cancellation Math
Inside `fixedUpdate(dt)`, count active hooks $N_{\text{active}} \in \{0, 1, 2\}$.
For each active hook $i \in \{\text{left}, \text{right}\}$ anchored at world point $\vec{A}_i$:

1. **Vector to Anchor:**
   $$\vec{d}_i = \vec{A}_i - \vec{P}_{\text{player}}, \quad L_i = \|\vec{d}_i\|, \quad \hat{u}_i = \frac{\vec{d}_i}{L_i}$$
2. **Base Winch Acceleration:**
   $$a_{\text{pull}} = \begin{cases} 58.0\text{ m/s}^2 & \text{if } N_{\text{active}} = 1 \\ 37.7\text{ m/s}^2 & \text{if } N_{\text{active}} = 2 \end{cases}$$
   *Proximity Softening:* If $L_i < 2.5\text{ m}$, scale $a_{\text{pull}}$ by $(L_i / 2.5)$ so the player doesn't violently oscillate around the anchor point if they hold the button too long.
3. **Slack / Fall Cancellation Force (Critical for Crisp Swinging):**
   Compute the player's radial velocity along the rope vector:
   $$v_{\text{radial}} = \vec{v}_{\text{player}} \cdot \hat{u}_i$$
   If $v_{\text{radial}} < 0$ (meaning the player is falling or moving *away* from the anchor point), apply an immediate counter-tension force opposing that outward velocity:
   $$\vec{F}_{\text{tension}, i} = m \cdot (-v_{\text{radial}} \cdot 8.5) \cdot \hat{u}_i$$
   If $v_{\text{radial}} \ge 0$, $\vec{F}_{\text{tension}, i} = \vec{0}$.
4. **Total Force Applied to Player Body:**
   $$\vec{F}_{\text{total}, i} = \left(m \cdot a_{\text{pull}} \cdot \hat{u}_i\right) + \vec{F}_{\text{tension}, i}$$
   Call `playerBody.applyForce(F_total_i, playerBody.position)`.
5. **Release & Momentum Conservation:**
   When `releaseHook(side)` is called on `mouseup`, set `hook.active = false`. **Do not damp or modify `playerBody.velocity`**. The conserved velocity vector $\vec{v}$ naturally launches the player along their tangent trajectory.

#### D. 3D Rope & Anchor Visuals
* Each hook owns:
  1. A `THREE.Mesh` using `CylinderGeometry(0.045, 0.045, 1, 6, 1)` rotated so its length aligns with $+Z$, scaled dynamically on $Z$ by $L_i$, positioned at the midpoint $\frac{1}{2}(\vec{M}_i + \vec{A}_i)$, and oriented via `ropeMesh.lookAt(anchorPoint)`.
  2. An emissive `THREE.OctahedronGeometry(0.35, 0)` anchor claw mesh placed at $\vec{A}_i$.
* **Surface Preview Ring:** A subtle glowing `THREE.RingGeometry(0.4, 0.65, 16)` aligned to the hit surface normal at the current crosshair raycast target so the player can judge depth against low-poly walls.

---

### 4.5 Third-Person Spring-Arm Camera (`src/CameraController.js`)
* Track `yaw` and `pitch` from `mousemove` events while `document.pointerLockElement` is active.
* **Desired Camera Position Calculation:**
  Given player position $\vec{P}$, camera rotation matrix $R(\text{yaw}, \text{pitch})$, camera backward vector $\hat{b}$, and camera right vector $\hat{r}$:
  $$\vec{C}_{\text{pivot}} = \vec{P} + (0, 1.8, 0) + 0.65 \cdot \hat{r}$$
  $$\vec{C}_{\text{desired}} = \vec{C}_{\text{pivot}} + 6.5 \cdot \hat{b}$$
* **Wall-Collision Anti-Clip Raycast:**
  Cast a ray from $\vec{C}_{\text{pivot}}$ toward $\hat{b}$ up to `6.5m` against `levelGenerator.grappleableMeshes`. If hit at distance $d_{\text{hit}}$, set actual camera distance to $\max(1.2, d_{\text{hit}} - 0.35)$.
* **Dynamic Speed FOV:**
  Compute player speed $s = \|\vec{v}\|$.
  $$\text{targetFOV} = 70 + \text{clamp}\left(\frac{s - 15.0}{75.0 - 15.0}, 0, 1\right) \times (98 - 70)$$
  Interpolate `camera.fov` toward `targetFOV` and call `camera.updateProjectionMatrix()`.

---

### 4.6 Seeded Procedural Level Generator (`src/LevelGenerator.js`)

#### A. Deterministic PRNG (Mulberry32)
Implement a seeded PRNG (`mulberry32(seed)`) so Course 1, Course 2, and Course 3 generate **100% identical layouts on every run**, enabling fair speedrun competition and PB tracking, while Endless Mode (`Course 4`) uses a random seed and recycles chunks behind the player.

#### B. Course Presets
| Preset Key | Course Name | Seed | Length | Chunk Sequence | Author Medal | Gold Medal |
|---|---|---|---|---|---|---|
| **``** | **Skyline Sprint (Beginner)** | `1042` | 6 Chunks (~900m) | `` | `22.00s` | `26.00s` |
| **`[2]`** | **Citadel Ascent (Intermediate)** | `8821` | 8 Chunks (~1250m) | `` | `31.00s` | `36.00s` |
| **`[3]`** | **Hyperion Gauntlet (Expert)** | `9999` | 10 Chunks (~1600m) | `[2, 5, 3, 4, 5, 2, 4, 5, 3, 6]` | `42.00s` | `49.00s` |
| **`[4]`** | **Endless Abyss (Survival)** | `Date.now()` | Infinite | Dynamic rolling window of 5 chunks | Distance (`m`) | `2000m+` |

#### C. Exact Specifications of the 6 Procedural Chunk Archetypes
Each chunk builder receives a cursor `(cursorX, cursorY, cursorZ)` pointing in the $-Z$ forward direction, spawns low-poly beveled/faceted blocks (both Three.js mesh and `CANNON.Box` body), and returns the exit cursor `(nextX, nextY, nextZ)` for the next chunk:

1. **Chunk 1 — The Twin Spires (Cadence Corridor, Length `150m`):**
   * Spawns 6 alternating pairs of tall brutalist monoliths (`width: 14m, height: 65m, depth: 16m`) at $X = \pm(18\text{ to }26)\text{ m}$ every `25m` along $-Z$.
   * Includes horizontal floating crossbar beams high up ($Y + 28\text{ m}$) for high-line dual-hook players.
2. **Chunk 2 — The Under-Bridge Dive (Vertical High-Low Transfer, Length `160m`):**
   * Spawns a massive wide ceiling barrier wall (`width: 70m, height: 40m, depth: 20m`) blocking the upper path, with a `16m`-tall grappleable stalactite underside at $Y - 8\text{ m}$, plus a red `HAZARD` laser bar across the very top so players *must* dive under the bridge and swing back up to a floating citadel platform at $Y + 22\text{ m}$.
3. **Chunk 3 — The Threading Octagon Rings (Precision Momentum, Length `165m`):**
   * Spawns 3 giant hollow octagonal stone rings (`outerRadius: 22m, innerHoleRadius: 13m, thickness: 8m`) Constructed from 8 rotated box segments arranged in a circle, spaced `55m` apart with alternating vertical offsets ($\Delta Y = \pm 12\text{ m}$).
4. **Chunk 4 — The Split Canyon & Hazard Pillar (Risk/Reward Route, Length `155m`):**
   * Central red emissive `HAZARD` obelisk in the middle of the lane flanked by curved outer canyon walls. Players can either take the safe outer single-hook curve or thread a narrow high-speed gap above the hazard obelisk.
5. **Chunk 5 — The Sky Stepping Stones (Sparse Long-Range Gap, Length `175m`):**
   * No large walls. Spawns 5 suspended low-poly crystal/stone polyhedrons (`8x12x8m`) spaced `35m` apart at varying heights. Requires accurate crosshair/magnetism aiming and releasing at an upward $35^\circ$ angle to avoid dropping into the void.
6. **Chunk 6 — The Slingshot Catapult Finale (Length `140m`):**
   * Two monumental twin obelisks (`16x80x16m`) positioned symmetrically at $X = -20\text{ m}$ and $X = +20\text{ m}$, `60m` ahead of the **Finish Gate Ring** (or next booster jump in Endless Mode), inviting a simultaneous Left+Right dual-hook slingshot through the goal.

---

### 4.7 HUD & User Interface (`index.html`, `style.css`, `src/UIManager.js`)

The UI must be sleek, futuristic, high-contrast, and non-intrusive:

1. **Top Bar:**
   * **Left:** Current Course Name & Preset Switcher (` Sprint  [2] Citadel  [3] Gauntlet  [4] Endless`) + `[R] Quick Restart`.
   * **Center:** Giant monospace Speedrun Timer (`00:00.000`) + Personal Best comparison delta (`PB: 00:24.190`). In Endless Mode, displays **Distance Traveled (`1,420 m`)** and **Best Distance**.
2. **Center Dynamic Crosshair:**
   * Central dot + Left bracket `(` and Right bracket `)`.
   * **Range Readout:** Small digital label below reticle showing exact target distance (`54m` in bright green when in range, `---` when out of range, or `SNAP` in cyan when magnetism cone is active).
   * **Active Hook Indicators:** Left bracket glows solid **Cyan (`#00f0ff`)** and scales up when Left Hook is pulling; Right bracket glows solid **Orange (`#ff6b00`)** when Right Hook is pulling.
3. **Bottom Speedometer:**
   * Displays live speed in `m/s` and `km/h` with a horizontal fill bar that shifts from cyan (`< 35 m/s`) to yellow (`35–55 m/s`) to magenta overdrive (`> 55 m/s`).
4. **Screen-Edge Speed Lines Overlay:**
   * A full-screen `<canvas>` or radial CSS gradient overlay whose opacity scales from `0.0` (below `40 m/s`) to `0.65` (at `75 m/s`) to convey visceral velocity.

---

### 4.8 Procedural Web Audio Synthesizer (`src/AudioSynth.js`)
Use `window.AudioContext` to generate all audio with zero external files:
* **`playHookFire(side)`:** High-to-low frequency sweep (`800Hz -> 220Hz` over `90ms`, sawtooth + bandpass noise burst) pitched slightly higher for Left Hook and lower for Right Hook.
* **`playHookHit()`:** Metallic clank (`1200Hz` triangle ping + short `60ms` high-pass noise transient).
* **`updateWindAndReel(speed, leftActive, rightActive)`:** Continuous looping white-noise buffer routed through a Biquad bandpass filter whose center frequency (`200Hz -> 1400Hz`) and gain (`0.0 -> 0.25`) modulate dynamically with player speed $\|\vec{v}\|$, plus a subtle rising turbine pitch while hooks are actively reeling.
* **`playCourseClear()`:** Arpeggiated major chord synth chime (`C5 - E5 - G5 - C6`).
* **`playDeath()`:** Sub-bass drop (`160Hz -> 35Hz` sawtooth over `400ms`).

---

## 5. DEFINITION OF DONE & AGENT VERIFICATION CHECKLIST

Before marking the implementation complete, the coding agent must verify all 10 criteria:
- [ ] **1. Zero Console Errors / Zero Asset 404s:** Game loads cleanly in Vite with only `three` and `cannon-es`.
- [ ] **2. Right-Click Grapple Works Without Context Menu:** Holding and releasing `Mouse2` fires and detaches the Right Hook without triggering the browser right-click menu.
- [ ] **3. Pure Hookshot Constraint:** Pressing `Space` does not make the player jump; all upward motion comes from grappling.
- [ ] **4. Slack Cancellation Feels Snappy:** Firing a hook while falling downward immediately arrests the downward fall and pulls the player cleanly toward the anchor point.
- [ ] **5. 100% Momentum Conservation:** Releasing `Mouse0`/`Mouse2` mid-pull preserves the player's full velocity vector, launching them forward/upward along their arc.
- [ ] **6. Dual-Hook Slingshot Boost:** Holding both `Mouse0` and `Mouse2` on two separate pillars pulls the player along the bisector vector at ~1.3x single-hook acceleration.
- [ ] **7. Hybrid Raycast + Magnetism Cone:** Aiming directly at any building surface attaches at that exact point; aiming slightly off the edge of a pillar within $3^\circ$ snaps cleanly via the magnetism cone and lights up the reticle.
- [ ] **8. 3rd-Person Camera & Avatar:** Low-poly character mesh is visible in front of the camera, banks into turns, trails a high-speed ribbon, and ropes visibly connect the player's left/right hip pods to the world anchor points.
- [ ] **9. Instant `< 50ms` Restart (`R` Key):** Falling below $Y = -30\text{ m}$ or pressing `R` at any time resets the player to the Start Pad at `00:00.000` instantaneously.
- [ ] **10. All 4 Modes Playable:** Keys `1`, `2`, `3` load the deterministic seeded Time-Trial courses with working Finish Gates and PB saving, and key `4` loads Endless Mode with rolling chunk generation.
