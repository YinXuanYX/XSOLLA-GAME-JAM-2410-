import fs from 'fs';
import path from 'path';
import { UIManager } from './src/UIManager.js';
import { AudioSynth } from './src/AudioSynth.js';
import { CONFIG } from './src/config.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log('====================================================');
console.log('🧪 TESTING AERO-HOOK UI & AUDIO SUBSYSTEMS (PHASE 2B)');
console.log('====================================================\n');

// 1. Verify index.html & style.css files on disk
console.log('--- TEST 1: HTML & CSS Asset Integrity ---');
const htmlContent = fs.readFileSync(path.resolve('./index.html'), 'utf8');
const cssContent = fs.readFileSync(path.resolve('./style.css'), 'utf8');

const requiredHtmlIds = [
  'game-container',
  'speed-lines',
  'hud',
  'timer-display',
  'pb-display',
  'medal-targets',
  'crosshair',
  'bracket-left',
  'reticle-dot',
  'bracket-right',
  'range-readout',
  'speed-value',
  'speed-kmh',
  'speed-bar-fill',
  'overlay-screen',
  'view-menu',
  'view-death',
  'view-clear',
  'pill-course-1',
  'pill-course-2',
  'pill-course-3',
  'pill-course-4',
];

for (const id of requiredHtmlIds) {
  assert(htmlContent.includes(`id="${id}"`), `index.html contains #${id}`);
}

assert(cssContent.includes('JetBrains Mono'), 'style.css includes JetBrains Mono font');
assert(cssContent.includes('--cyan-hook: #00f0ff'), 'style.css contains cyan hook token');
assert(cssContent.includes('--orange-hook: #ff6b00'), 'style.css contains orange hook token');
assert(cssContent.includes('.bracket-left.active'), 'style.css contains active left bracket style');
assert(cssContent.includes('.bracket-right.active'), 'style.css contains active right bracket style');
assert(cssContent.includes('.speed-bar-fill.overdrive'), 'style.css contains speedometer overdrive style');

// 2. Test UIManager Class & Logic
console.log('\n--- TEST 2: UIManager Logic & Calculations ---');
const ui = new UIManager();

// Time Formatting
assert(ui.formatTime(0) === '00:00.000', 'formatTime(0) is 00:00.000');
assert(ui.formatTime(24.512) === '00:24.512', 'formatTime(24.512) is 00:24.512');
assert(ui.formatTime(65.100) === '01:05.100', 'formatTime(65.100) is 01:05.100');

// Medal Calculations (Course 1: author 22.0, gold 26.0, silver 32.0, bronze 40.0)
const mAuthor = ui.calculateMedal(1, 21.5);
assert(mAuthor.type === 'author', '21.5s earns Author Medal');
assert(mAuthor.icon === '💎', 'Author Medal has diamond icon');

const mGold = ui.calculateMedal(1, 25.8);
assert(mGold.type === 'gold', '25.8s earns Gold Medal');
assert(mGold.icon === '🥇', 'Gold Medal has gold icon');

const mSilver = ui.calculateMedal(1, 31.0);
assert(mSilver.type === 'silver', '31.0s earns Silver Medal');

const mBronze = ui.calculateMedal(1, 38.5);
assert(mBronze.type === 'bronze', '38.5s earns Bronze Medal');

const mClear = ui.calculateMedal(1, 45.0);
assert(mClear.type === 'clear', '45.0s earns Course Clear');

// Personal Best Persistence Simulation
console.log('\n--- TEST 3: Personal Best Logic (Standard vs Endless) ---');
// Mock global localStorage
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = v.toString(); },
  clear() { this.store = {}; }
};

// Course 1 (Time-trial: Lower is better)
localStorage.clear();
const pb1 = ui.savePersonalBest(1, 25.5);
assert(pb1.isNewPB === true, 'First run is new PB');
assert(pb1.currentPB === 25.5, 'Current PB is 25.5s');

const pb2 = ui.savePersonalBest(1, 28.0);
assert(pb2.isNewPB === false, 'Slower run (28.0s) is NOT new PB');
assert(pb2.currentPB === 25.5, 'Current PB remains 25.5s');

const pb3 = ui.savePersonalBest(1, 23.2);
assert(pb3.isNewPB === true, 'Faster run (23.2s) IS new PB');
assert(pb3.currentPB === 23.2, 'Current PB updated to 23.2s');

// Course 4 (Endless: Higher distance is better)
const pbe1 = ui.savePersonalBest(4, 500);
assert(pbe1.isNewPB === true, 'First endless run (500m) is new PB');

const pbe2 = ui.savePersonalBest(4, 450);
assert(pbe2.isNewPB === false, 'Lower endless run (450m) is NOT new PB');

const pbe3 = ui.savePersonalBest(4, 1200);
assert(pbe3.isNewPB === true, 'Higher endless run (1200m) IS new PB');
assert(pbe3.currentPB === 1200, 'Endless PB updated to 1200m');

// 3. Test updateHUD State Transitions
console.log('\n--- TEST 4: updateHUD State Mapping ---');
// Mock DOM elements in ui
ui.dom = {
  timerDisplay: { textContent: '' },
  pbDisplay: { textContent: '' },
  medalTargets: { innerHTML: '' },
  speedValue: { textContent: '' },
  speedKmh: { textContent: '' },
  speedBarFill: { style: { width: '0%' }, className: '' },
  bracketLeft: { classList: { toggle(cls, active) { this[cls] = active; } } },
  bracketRight: { classList: { toggle(cls, active) { this[cls] = active; } } },
  reticleDot: { className: '' },
  rangeReadout: { textContent: '', className: '' },
  sessionStatus: { textContent: '' },
  overlayScreen: { classList: { add() {}, remove() {} } },
  viewMenu: { classList: { add() {}, remove() {} } },
  viewDeath: { classList: { add() {}, remove() {} } },
  viewClear: { classList: { add() {}, remove() {} } },
};

// Test High Speed & Active Hooks
ui.updateHUD({
  speed: 62.0,
  leftActive: true,
  rightActive: false,
  targetInfo: { hit: true, distance: 54.2, assisted: false },
  elapsedTime: 12.345,
  courseId: 1,
});

assert(ui.dom.timerDisplay.textContent === '00:12.345', 'Timer formatted in HUD');
assert(ui.dom.bracketLeft.classList.active === true, 'Left bracket set active when left hook fires');
assert(ui.dom.bracketRight.classList.active === false, 'Right bracket inactive');
assert(ui.dom.rangeReadout.textContent === '54m', 'Range readout displays 54m');
assert(ui.dom.reticleDot.className === 'reticle-dot target-locked', 'Reticle dot shows target locked');
assert(ui.dom.speedValue.textContent === '62', 'Speed display shows 62');
assert(ui.dom.speedBarFill.className === 'speed-bar-fill overdrive', 'Speed > 55 sets overdrive class');

// Test Magnetism Snap & Out of Range
ui.updateHUD({
  speed: 28.0,
  leftActive: false,
  rightActive: true,
  targetInfo: { hit: true, distance: 75.0, assisted: true },
  elapsedTime: 15.0,
  courseId: 1,
});

assert(ui.dom.rangeReadout.textContent === 'SNAP', 'Magnetism assist shows SNAP');
assert(ui.dom.reticleDot.className === 'reticle-dot target-magnet', 'Reticle dot shows target magnet');
assert(ui.dom.bracketRight.classList.active === true, 'Right bracket set active');
assert(ui.dom.speedBarFill.className === 'speed-bar-fill', 'Speed < 35 sets baseline fill');

// 4. Test AudioSynth Subsystem
console.log('\n--- TEST 5: AudioSynth Web Audio Node Graph ---');
// Mock Web Audio API for headless environment
class MockAudioNode {
  constructor() {
    this.connectedTo = [];
    this.value = 0;
  }
  connect(dest) {
    this.connectedTo.push(dest);
    return dest;
  }
  setValueAtTime(v, t) { this.value = v; }
  exponentialRampToValueAtTime(v, t) { this.value = v; }
  linearRampToValueAtTime(v, t) { this.value = v; }
  setTargetAtTime(v, t, timeConstant) { this.value = v; }
}

class MockAudioParam extends MockAudioNode {}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam();
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor() {
    super();
    this.frequency = new MockAudioParam();
    this.Q = new MockAudioParam();
    this.type = 'lowpass';
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.frequency = new MockAudioParam();
    this.type = 'sine';
    this.started = false;
    this.stopped = false;
  }
  start(t) { this.started = true; }
  stop(t) { this.stopped = true; }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.started = false;
  }
  start(t) { this.started = true; }
  stop(t) { this.stopped = true; }
}

class MockAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.data = new Float32Array(length);
  }
  getChannelData() { return this.data; }
}

class MockAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 10.0;
    this.destination = new MockAudioNode();
    this.state = 'running';
  }
  createGain() { return new MockGainNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createBufferSource() { return new MockAudioBufferSourceNode(); }
  createBuffer(c, l, s) { return new MockAudioBuffer(c, l, s); }
  resume() { this.state = 'running'; }
}

// Inject mock into global window
global.window = { AudioContext: MockAudioContext };

const audio = new AudioSynth();
audio.init();

assert(audio.isInitialized === true, 'AudioSynth initialized');
assert(audio.masterGain !== null, 'Master gain node connected');
assert(audio.windSource !== null, 'Continuous wind noise buffer node created');
assert(audio.windFilter.type === 'bandpass', 'Wind filter configured as bandpass');
assert(audio.turbineOsc !== null, 'Reel turbine oscillator created');

// Test Hook Fire Audio (Left +10%, Right -10%)
audio.playHookFire('left');
audio.playHookFire('right');
console.log('✅ playHookFire executed for Left and Right');

// Test Hook Hit Metallic Ping
audio.playHookHit();
console.log('✅ playHookHit executed');

// Test Wind & Reel dynamic modulation
audio.updateWindAndReel(60.0, true, false);
assert(audio.windGain.gain.value > 0, 'Wind gain increases at high speed (60 m/s)');
assert(audio.windFilter.frequency.value > 800, 'Wind bandpass frequency rises at high speed');
assert(audio.turbineGain.gain.value > 0, 'Turbine gain activates when left hook is active');

// Test Clear & Death Audio
audio.playCourseClear();
console.log('✅ playCourseClear arpeggiated synth executed');

audio.playDeath();
console.log('✅ playDeath sub-bass drop executed');

console.log('\n====================================================');
console.log('🎉 ALL PHASE 2B TESTS PASSED SUCCESSFULLY!');
console.log('====================================================');
