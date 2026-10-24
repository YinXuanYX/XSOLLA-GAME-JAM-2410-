import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { PlayerController } from './PlayerController.js';
import { CameraController } from './CameraController.js';
import { GrappleSystem } from './GrappleSystem.js';
import { LevelGenerator } from './LevelGenerator.js';
import { UIManager } from './UIManager.js';
import { AudioSynth } from './AudioSynth.js';

/**
 * ============================================================================
 * AERO-HOOK // MASTER GAME ENTRY POINT & FSM GAME LOOP (VERSION 4.0)
 * ============================================================================
 */

// 1. Three.js Core Scene & Perspective Camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.COLORS.SKY_BOTTOM);
scene.fog = new THREE.FogExp2(CONFIG.COLORS.FOG, 0.0048);

const camera = new THREE.PerspectiveCamera(
  CONFIG.CAMERA.BASE_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  1200
);

// 2. High-Performance WebGL Renderer with Shadows & Tone Mapping
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  logarithmicDepthBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const container = document.getElementById('game-container') || document.body;
container.appendChild(renderer.domElement);

// 2b. Post-Processing Pipeline (UnrealBloomPass + OutputPass)
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

export const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CONFIG.BLOOM?.STRENGTH ?? 0.65,
  CONFIG.BLOOM?.RADIUS ?? 0.28,
  CONFIG.BLOOM?.THRESHOLD ?? 0.82
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// 3. Directional & Atmospheric Lighting
const hemiLight = new THREE.HemisphereLight(
  CONFIG.COLORS.SKY_TOP,
  CONFIG.COLORS.SKY_BOTTOM,
  0.85
);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff7ed, 1.4);
sunLight.position.set(70, 140, 60);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 400;
sunLight.shadow.camera.left = -60;
sunLight.shadow.camera.right = 60;
sunLight.shadow.camera.top = 60;
sunLight.shadow.camera.bottom = -60;
sunLight.shadow.bias = -0.0004;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
fillLight.position.set(-60, -40, -50);
scene.add(fillLight);

// 4. Subsystem Instantiations
export const physicsWorld = new PhysicsWorld();
export const levelGen = new LevelGenerator(scene, physicsWorld);
export const player = new PlayerController(scene, physicsWorld);
export const cameraCtrl = new CameraController(camera, renderer.domElement);
export const grapple = new GrappleSystem(scene, camera, player, CONFIG);
export const ui = new UIManager();
export const audio = new AudioSynth();

// 5. Game State Machine (FSM)
// States: 'MENU', 'READY', 'RUNNING', 'DYING', 'DEAD', 'FINISHING', 'FINISHED'
export let gameState = 'MENU';
export let finishAnimStartTime = 0;
export let pendingFinishData = null;
export let currentCourseId = 1;
export let runStartTime = 0;
export let runElapsedTime = 0;
export let maxEndlessDistance = 0;
export let deathStartTime = 0;
export let deathOverlayShownTime = 0;

// Input State
const keys = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false,
};

// Global context menu prevention for right-click grapple (Mouse2)
window.addEventListener('contextmenu', (e) => e.preventDefault());

/**
 * Initializes and unlocks Web Audio on first user gesture.
 */
function unlockAudio() {
  audio.init();
}
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

/**
 * Triggers the player death sequence into the 'DYING' state.
 * Releases grapple lines, plays death audio, cuts wind/reel sounds,
 * and shatters the player avatar into 32 Red/Blue octahedron shards.
 *
 * @param {string} [reason='Void Fall'] Cause of death for diagnostics
 */
export function triggerPlayerDeath(reason = 'Void Fall') {
  if (gameState === 'DYING' || gameState === 'DEAD') return;

  console.warn(`[AERO-HOOK] Player death: ${reason} at pos: (${player.body.position.x.toFixed(1)}, ${player.body.position.y.toFixed(1)}, ${player.body.position.z.toFixed(1)})`);
  gameState = 'DYING';
  deathStartTime = performance.now();
  deathOverlayShownTime = 0;
  grapple.releaseAll();
  audio.playDeath();
  audio.updateWindAndReel(0, false, false);
  player.triggerExplosion();
}

/**
 * Backward-compatible death trigger alias.
 */
export function triggerDeath(reason = 'Void Fall') {
  triggerPlayerDeath(reason);
}

/**
 * Enters the 'FINISHING' state when the player is captured by the Black Hole.
 * The speedrun time is frozen at this exact moment; the implosion/supernova
 * animation does not count toward it. The win overlay opens once it completes.
 */
export function triggerCourseClear() {
  if (gameState !== 'RUNNING') return;

  const nowMs = performance.now();
  const finalTimeMs = nowMs - runStartTime;
  runElapsedTime = finalTimeMs / 1000;

  gameState = 'FINISHING';
  finishAnimStartTime = nowMs;
  pendingFinishData = {
    time: runElapsedTime,
    courseId: currentCourseId,
    course: levelGen.currentCourse,
    medal: ui.calculateMedal(currentCourseId, runElapsedTime),
  };

  grapple.releaseAll();
  player.body.velocity.set(0, 0, 0);
  player.body.force.set(0, 0, 0);
  if (player.body.angularVelocity) player.body.angularVelocity.set(0, 0, 0);

  levelGen.triggerBlackHoleExplosion();
  audio.playBlackHoleExplosion ? audio.playBlackHoleExplosion() : audio.playCourseClear();
  audio.updateWindAndReel(0, false, false);
}

/**
 * Instantly resets course back to 'READY' state in < 50ms without reloading the page.
 *
 * @param {boolean} [recenterCamera=true]
 */
export function restartCourse(recenterCamera = true) {
  deathStartTime = 0;
  deathOverlayShownTime = 0;
  finishAnimStartTime = 0;
  pendingFinishData = null;
  levelGen.resetBlackHole();
  grapple.reset();
  player.reset(0, 3, 0);

  if (recenterCamera) {
    cameraCtrl.reset(0, 0.28); // Aim upwards towards arch/monolith for immediate grapple feedback
  }

  runStartTime = 0;
  runElapsedTime = 0;
  maxEndlessDistance = 0;
  gameState = 'READY';

  ui.hideOverlay();
  ui.updateHUD({
    speed: 0,
    leftActive: false,
    rightActive: false,
    targetInfo: null,
    elapsedTime: 0,
    courseId: currentCourseId,
    distanceTraveled: 0,
    sessionStatus: 'READY',
  });
}

/**
 * Switches the active course preset, regenerates chunks, and resets player.
 *
 * @param {number} presetId 1, 2, 3, or 4
 */
export function switchCourse(presetId = 1) {
  if (presetId < 1 || presetId > 4) return;
  currentCourseId = presetId;

  levelGen.loadCourse(presetId);
  ui.setCourse(presetId);
  restartCourse(true);
}

// 6. Hazard Body Contact Listener
player.body.addEventListener('collide', (event) => {
  if (gameState !== 'RUNNING' && gameState !== 'READY') return;
  const otherBody = event.body;
  if (
    otherBody?.userData?.type === 'HAZARD' ||
    levelGen.hazardBodies.includes(otherBody)
  ) {
    triggerPlayerDeath('Contact with orange neon lava hazard tile');
  }
});

// 7. Input Event Listeners
window.addEventListener('keydown', (e) => {
  if (e.code in keys) {
    keys[e.code] = true;
  }

  // [R] Quick Restart
  if (e.code === 'KeyR') {
    restartCourse();
  }

  // [1-4] Course Presets Switcher
  if (e.code === 'Digit1') switchCourse(1);
  if (e.code === 'Digit2') switchCourse(2);
  if (e.code === 'Digit3') switchCourse(3);
  if (e.code === 'Digit4') switchCourse(4);

  // [Enter] or [Space] on Menu to Launch
  if (gameState === 'MENU' && (e.code === 'Enter' || e.code === 'Space')) {
    requestPointerLockAndLaunch();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code in keys) {
    keys[e.code] = false;
  }
});

window.addEventListener('mousedown', (e) => {
  unlockAudio();

  // If in overlay menu, clicking requests pointer lock and begins course
  if (gameState === 'MENU') {
    requestPointerLockAndLaunch();
    return;
  }

  // If in the DYING animation, ignore clicks so the shatter explosion plays out cleanly
  if (gameState === 'DYING' || gameState === 'FINISHING') {
    return;
  }

  // If in DEAD or FINISHED overlay, allow restart on click with a 250ms debouncing delay
  if (gameState === 'DEAD' || gameState === 'FINISHED') {
    if (performance.now() - deathOverlayShownTime < 250) {
      return;
    }
    if (!document.pointerLockElement) {
      document.body.requestPointerLock();
    }
    restartCourse();
    return;
  }

  // PointerLock check: only fire hooks when mouse is locked
  if (!document.pointerLockElement) {
    document.body.requestPointerLock();
    return;
  }

  if (gameState === 'READY' || gameState === 'RUNNING') {
    const side = e.button === 0 ? 'left' : (e.button === 2 ? 'right' : null);
    if (!side) return;

    const attached = grapple.tryFireHook(side, levelGen.grappleableMeshes);
    if (attached) {
      audio.playHookFire(side);
      audio.playHookHit();

      // Successful hook attachment immediately starts the speedrun timer
      if (gameState === 'READY') {
        gameState = 'RUNNING';
        runStartTime = performance.now();
      }
    }
  }
});

window.addEventListener('mouseup', (e) => {
  const side = e.button === 0 ? 'left' : (e.button === 2 ? 'right' : null);
  if (side) {
    grapple.releaseHook(side);
  }
});

// Pointer Lock State Changes
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    if (gameState === 'MENU') {
      gameState = 'READY';
      restartCourse(false);
    }
  }
});

function requestPointerLockAndLaunch() {
  document.body.requestPointerLock();
  if (gameState === 'MENU') {
    gameState = 'READY';
    restartCourse(false);
  }
}

// 8. Bind UI DOM Action Buttons
const btnPlay = document.getElementById('btn-play');
if (btnPlay) btnPlay.addEventListener('click', requestPointerLockAndLaunch);

const btnRetry = document.getElementById('btn-retry');
if (btnRetry) btnRetry.addEventListener('click', () => restartCourse());

const btnClearRetry = document.getElementById('btn-clear-retry');
if (btnClearRetry) btnClearRetry.addEventListener('click', () => restartCourse());

const btnNextCourse = document.getElementById('btn-next-course');
if (btnNextCourse) {
  btnNextCourse.addEventListener('click', () => {
    const nextId = (currentCourseId % 4) + 1;
    switchCourse(nextId);
  });
}

const pill1 = document.getElementById('pill-course-1');
const pill2 = document.getElementById('pill-course-2');
const pill3 = document.getElementById('pill-course-3');
const pill4 = document.getElementById('pill-course-4');
if (pill1) pill1.addEventListener('click', () => switchCourse(1));
if (pill2) pill2.addEventListener('click', () => switchCourse(2));
if (pill3) pill3.addEventListener('click', () => switchCourse(3));
if (pill4) pill4.addEventListener('click', () => switchCourse(4));

// Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(window.innerWidth, window.innerHeight);
});

// Load Course 1 initially
levelGen.loadCourse(1);
ui.setCourse(1);
ui.showOverlay('MENU');

// 9. Master requestAnimationFrame Loop
let lastTime = performance.now();

export function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // 1. Menu State: Slow cinematic camera orbit around player on start pad
  if (gameState === 'MENU') {
    cameraCtrl.yaw += dt * 0.22;
    cameraCtrl.pitch = -0.18;
    cameraCtrl.update(dt, player.mesh.position, 0, levelGen.grappleableMeshes);
    player.updateVisuals(dt, cameraCtrl.yaw, grapple.hooks);
    levelGen.update(dt, player.body.position, now * 0.001);
    composer.render();
    return;
  }

  // 2. Dying State: Red/Blue 32-shard explosion plays for 1150ms before DEAD overlay
  if (gameState === 'DYING') {
    player.updateVisuals(dt, cameraCtrl.yaw, grapple.hooks);
    grapple.updateVisuals(levelGen.grappleableMeshes, dt);
    levelGen.updateAbyss(dt, now * 0.001, player.body.position);
    cameraCtrl.update(dt, player.mesh.position, 0, levelGen.grappleableMeshes);

    ui.updateHUD({
      speed: 0,
      leftActive: false,
      rightActive: false,
      targetInfo: null,
      elapsedTime: runElapsedTime,
      courseId: currentCourseId,
      distanceTraveled: maxEndlessDistance,
      sessionStatus: 'DYING',
    });

    const deathDelay = CONFIG.FX?.DEATH_DELAY_MS || 1150;
    if (now - deathStartTime >= deathDelay) {
      gameState = 'DEAD';
      deathOverlayShownTime = now;
      ui.showOverlay('DEAD', {
        time: runElapsedTime,
        courseId: currentCourseId,
        course: levelGen.currentCourse,
      });
    }

    composer.render();
    return;
  }

  // 2b. Finishing State: Black Hole implosion + supernova plays before the FINISHED overlay
  if (gameState === 'FINISHING') {
    if (player.updateSuction && levelGen.finishGate) player.updateSuction(dt, levelGen.finishGate);
    player.updateVisuals(dt, cameraCtrl.yaw, grapple.hooks);
    grapple.updateVisuals(levelGen.grappleableMeshes, dt);
    levelGen.updateAbyss(dt, now * 0.001, player.body.position);
    cameraCtrl.update(dt, levelGen.finishGate, 0, levelGen.grappleableMeshes);

    ui.updateHUD({
      speed: 0,
      leftActive: false,
      rightActive: false,
      targetInfo: null,
      elapsedTime: runElapsedTime,
      courseId: currentCourseId,
      distanceTraveled: maxEndlessDistance,
      sessionStatus: 'FINISHING',
    });

    if (now - finishAnimStartTime >= (CONFIG.FX?.FINISHING_DELAY_MS || 1350)) {
      gameState = 'FINISHED';
      deathOverlayShownTime = now;
      ui.showOverlay('FINISHED', pendingFinishData);
    }

    composer.render();
    return;
  }

  // 3. Physics & Player Sub-steps
  if (gameState === 'READY' || gameState === 'RUNNING') {
    grapple.fixedUpdate(dt);
    player.fixedUpdate(dt, keys, cameraCtrl.yaw);
    physicsWorld.step(dt);

    // Leaving Start Pad cylinder (r > 8.0m) triggers RUNNING state
    if (gameState === 'READY') {
      const horizontalDist = Math.hypot(player.body.position.x, player.body.position.z);
      if (horizontalDist > 8.0) {
        gameState = 'RUNNING';
        runStartTime = performance.now();
      }
    }

    // Update live timer when RUNNING
    if (gameState === 'RUNNING') {
      runElapsedTime = (performance.now() - runStartTime) / 1000;
    }

    // Void Fall Instant Death Check
    if (player.body.position.y < CONFIG.LEVEL.VOID_DEATH_Y) {
      triggerPlayerDeath(`Void Fall (fell to ${player.body.position.y.toFixed(1)}m below lava limit)`);
    }

    // Hazard collision check (via LevelGenerator sphere-to-box volume test)
    if (levelGen.checkHazardCollision(player.body.position, CONFIG.PHYSICS.PLAYER_RADIUS)) {
      triggerPlayerDeath('Contact with orange neon hazard volume');
    }

    // Finish Gate Passage Check (Courses 1-3)
    if (currentCourseId !== 4 && gameState === 'RUNNING') {
      const gate = levelGen.finishGate;
      if (gate && gate.mesh && !gate.exploding) {
        const dx = player.body.position.x - gate.x;
        const dy = player.body.position.y - gate.y;
        const dz = player.body.position.z - gate.z;
        const inCaptureSphere = Math.hypot(dx, dy, dz) < 20.0;
        const passedGatePlane = player.body.position.z <= gate.z && Math.hypot(dx, dy) <= gate.radius;
        if (inCaptureSphere || passedGatePlane) {
          triggerCourseClear();
        }
      }
    }

    // Endless Mode Chunk Spawner & Distance Tracker
    if (currentCourseId === 4 && gameState === 'RUNNING') {
      const currentDist = Math.abs(player.body.position.z);
      maxEndlessDistance = Math.max(maxEndlessDistance, currentDist);
      levelGen.updateEndless(player.body.position.z);
    }
  }

  // 4. Visual & Audio Synchronizations
  const playerSpeed = player.getSpeed();
  player.updateVisuals(dt, cameraCtrl.yaw, grapple.hooks);
  cameraCtrl.update(dt, player.mesh.position, playerSpeed, levelGen.grappleableMeshes);
  grapple.updateVisuals(levelGen.grappleableMeshes, dt);
  levelGen.update(dt, player.body.position, now * 0.001);

  // Sync HUD telemetry
  ui.updateHUD({
    speed: playerSpeed,
    leftActive: grapple.isHookActive('left'),
    rightActive: grapple.isHookActive('right'),
    targetInfo: grapple.targetInfo,
    elapsedTime: runElapsedTime,
    courseId: currentCourseId,
    distanceTraveled: maxEndlessDistance,
    sessionStatus: gameState,
  });

  // Sync procedural wind and reel turbine audio
  audio.updateWindAndReel(
    playerSpeed,
    grapple.isHookActive('left'),
    grapple.isHookActive('right')
  );

  // 5. Render Master Scene (Post-Processing Bloom Pipeline)
  composer.render();
}

// Start game loop
requestAnimationFrame(animate);

console.log('⚡ AERO-HOOK Master Loop Running');
