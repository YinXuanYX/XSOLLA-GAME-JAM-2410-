/**
 * AudioSynth generates 100% procedural sound effects and dynamic background
 * audio using the native Web Audio API, with zero external audio assets.
 */
export class AudioSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isInitialized = false;

    // Wind synthesis nodes
    this.windSource = null;
    this.windFilter = null;
    this.windGain = null;

    // Cable reel turbine synthesis nodes
    this.turbineOsc = null;
    this.turbineFilter = null;
    this.turbineGain = null;

    // Mute state
    this.isMuted = false;
  }

  /**
   * Lazily initializes or resumes the AudioContext upon user interaction.
   * Browsers block autoplay audio until a user gesture (click/keydown).
   */
  init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioContextClass = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : null;

    if (!AudioContextClass) return;

    try {
      this.ctx = new AudioContextClass();

      // Master Output Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // 1. Initialize Continuous Looping Wind Audio Stream
      this.initWindStream();

      // 2. Initialize Reel Turbine Audio Stream
      this.initTurbineStream();

      this.isInitialized = true;
    } catch (err) {
      console.warn('Web Audio initialization error:', err);
    }
  }

  /**
   * Builds the procedural continuous white-noise wind buffer and bandpass filter.
   */
  initWindStream() {
    if (!this.ctx) return;

    // Generate 2.0 seconds of uncompressed white noise
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    // Looping AudioBufferSourceNode
    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = noiseBuffer;
    this.windSource.loop = true;

    // Biquad Bandpass Filter (frequency modulated by player speed)
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.setValueAtTime(200, this.ctx.currentTime);
    this.windFilter.Q.setValueAtTime(2.6, this.ctx.currentTime);

    // Wind Volume Gain Node (initially 0.0)
    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    // Connect graph: Noise -> Bandpass -> Gain -> Master
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    this.windSource.start(0);
  }

  /**
   * Builds the procedural cable reel turbine oscillator.
   */
  initTurbineStream() {
    if (!this.ctx) return;

    // Turbine Sawtooth Oscillator
    this.turbineOsc = this.ctx.createOscillator();
    this.turbineOsc.type = 'sawtooth';
    this.turbineOsc.frequency.setValueAtTime(180, this.ctx.currentTime);

    // Lowpass filter to soften harshness
    this.turbineFilter = this.ctx.createBiquadFilter();
    this.turbineFilter.type = 'lowpass';
    this.turbineFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
    this.turbineFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    // Turbine Gain Node (initially 0.0)
    this.turbineGain = this.ctx.createGain();
    this.turbineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    // Connect graph: Osc -> Lowpass -> Gain -> Master
    this.turbineOsc.connect(this.turbineFilter);
    this.turbineFilter.connect(this.turbineGain);
    this.turbineGain.connect(this.masterGain);

    this.turbineOsc.start(0);
  }

  /**
   * Fires the grappling hook launch audio transient.
   * Sawtooth frequency sweep: 800Hz -> 220Hz over 90ms.
   * Left hook is pitched +10% higher, Right hook is pitched -10% lower.
   *
   * @param {'left'|'right'} side
   */
  playHookFire(side = 'left') {
    if (!this.ctx || this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    const duration = 0.09; // 90ms

    // Pitch modification: Left hook +10%, Right hook -10%
    const pitchMultiplier = side === 'left' ? 1.10 : 0.90;
    const startFreq = 800.0 * pitchMultiplier;
    const endFreq = 220.0 * pitchMultiplier;

    // 1. Sawtooth winch sweep
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);

    // 2. High-pass noise click for mechanical cable launch punch
    const clickBuffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.025), this.ctx.sampleRate);
    const clickData = clickBuffer.getChannelData(0);
    for (let i = 0; i < clickData.length; i++) {
      clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickData.length * 0.25));
    }

    const clickSource = this.ctx.createBufferSource();
    clickSource.buffer = clickBuffer;

    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.setValueAtTime(1600 * pitchMultiplier, now);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.25, now);

    clickSource.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.masterGain);

    clickSource.start(now);
  }

  /**
   * Plays a 1200Hz metallic triangle ping transient upon anchor surface contact.
   */
  playHookHit() {
    if (!this.ctx || this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    const duration = 0.06; // 60ms

    // Primary metallic ping
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + duration);

    // Overtone ping
    const overtone = this.ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(2450, now);
    overtone.frequency.exponentialRampToValueAtTime(1600, now + duration * 0.7);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    overtone.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + duration);
    overtone.stop(now + duration);
  }

  /**
   * Modulates wind frequency and reel turbine whine dynamically based on player speed and hook tension.
   *
   * @param {number} speed Velocity magnitude in m/s
   * @param {boolean} leftActive
   * @param {boolean} rightActive
   */
  updateWindAndReel(speed = 0, leftActive = false, rightActive = false) {
    if (!this.ctx || !this.windFilter || !this.windGain || this.isMuted) return;

    const now = this.ctx.currentTime;

    // 1. Wind Modulation: Bandpass 200Hz -> 1400Hz, Gain 0.0 -> 0.22
    const speedRatio = Math.min(1.0, Math.max(0.0, (speed - 5.0) / 70.0));
    const targetWindFreq = 200.0 + speedRatio * 1200.0;
    const targetWindGain = speedRatio * 0.22;

    this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.05);
    this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.05);

    // 2. Reel Turbine Modulation: Rises in pitch & gain when winches are active
    if (this.turbineGain && this.turbineOsc) {
      const activeCount = (leftActive ? 1 : 0) + (rightActive ? 1 : 0);
      const isReeling = activeCount > 0;

      const targetTurbineGain = isReeling ? (activeCount === 2 ? 0.16 : 0.11) : 0.0;
      const targetTurbineFreq = 180.0 + speedRatio * 380.0 + (isReeling ? 60.0 : 0.0);

      this.turbineGain.gain.setTargetAtTime(targetTurbineGain, now, 0.04);
      this.turbineOsc.frequency.setTargetAtTime(targetTurbineFreq, now, 0.04);
    }
  }

  /**
   * Plays the victory arpeggio: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz).
   */
  playCourseClear() {
    if (!this.ctx || this.isMuted) return;
    this.init();

    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = this.ctx.currentTime;
    const noteSpacing = 0.10; // 100ms stagger

    notes.forEach((freq, idx) => {
      const startTime = now + idx * noteSpacing;
      const noteDuration = 0.45;

      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.28, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });
  }

  /**
   * Plays the black hole finale: 0.35s rising vacuum charge, a sub-bass supernova boom,
   * and a crystalline victory chord.
   */
  playBlackHoleExplosion() {
    if (!this.ctx || this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    const chargeEnd = now + 0.35;
    const boomDuration = 1.0;

    const makeNoise = (seconds) => {
      const size = Math.ceil(this.ctx.sampleRate * seconds);
      const buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      return source;
    };

    // 1. Gravitational vacuum charge (0.0s - 0.35s)
    const chargeOsc = this.ctx.createOscillator();
    chargeOsc.type = 'sawtooth';
    chargeOsc.frequency.setValueAtTime(40, now);
    chargeOsc.frequency.exponentialRampToValueAtTime(520, chargeEnd);

    const chargeFilter = this.ctx.createBiquadFilter();
    chargeFilter.type = 'lowpass';
    chargeFilter.Q.setValueAtTime(6, now);
    chargeFilter.frequency.setValueAtTime(120, now);
    chargeFilter.frequency.exponentialRampToValueAtTime(2400, chargeEnd);

    const chargeGain = this.ctx.createGain();
    chargeGain.gain.setValueAtTime(0.001, now);
    chargeGain.gain.exponentialRampToValueAtTime(0.30, chargeEnd - 0.02);
    chargeGain.gain.exponentialRampToValueAtTime(0.001, chargeEnd + 0.03);

    chargeOsc.connect(chargeFilter);
    chargeFilter.connect(chargeGain);
    chargeGain.connect(this.masterGain);
    chargeOsc.start(now);
    chargeOsc.stop(chargeEnd + 0.04);

    const swell = makeNoise(0.4);
    const swellFilter = this.ctx.createBiquadFilter();
    swellFilter.type = 'bandpass';
    swellFilter.Q.setValueAtTime(2, now);
    swellFilter.frequency.setValueAtTime(200, now);
    swellFilter.frequency.exponentialRampToValueAtTime(3200, chargeEnd);

    const swellGain = this.ctx.createGain();
    swellGain.gain.setValueAtTime(0.001, now);
    swellGain.gain.exponentialRampToValueAtTime(0.22, chargeEnd - 0.02);
    swellGain.gain.exponentialRampToValueAtTime(0.001, chargeEnd + 0.03);

    swell.connect(swellFilter);
    swellFilter.connect(swellGain);
    swellGain.connect(this.masterGain);
    swell.start(now);
    swell.stop(chargeEnd + 0.04);

    // 2. Supernova sub-bass boom (starts at 0.35s)
    const boomOsc = this.ctx.createOscillator();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(90, chargeEnd);
    boomOsc.frequency.exponentialRampToValueAtTime(28, chargeEnd + boomDuration);

    const boomGain = this.ctx.createGain();
    boomGain.gain.setValueAtTime(0.001, chargeEnd);
    boomGain.gain.linearRampToValueAtTime(0.55, chargeEnd + 0.02);
    boomGain.gain.exponentialRampToValueAtTime(0.001, chargeEnd + boomDuration);

    boomOsc.connect(boomGain);
    boomGain.connect(this.masterGain);
    boomOsc.start(chargeEnd);
    boomOsc.stop(chargeEnd + boomDuration + 0.02);

    const boomNoise = makeNoise(boomDuration + 0.05);
    const boomNoiseFilter = this.ctx.createBiquadFilter();
    boomNoiseFilter.type = 'lowpass';
    boomNoiseFilter.Q.setValueAtTime(4, chargeEnd);
    boomNoiseFilter.frequency.setValueAtTime(900, chargeEnd);
    boomNoiseFilter.frequency.exponentialRampToValueAtTime(60, chargeEnd + boomDuration);

    const boomNoiseGain = this.ctx.createGain();
    boomNoiseGain.gain.setValueAtTime(0.001, chargeEnd);
    boomNoiseGain.gain.linearRampToValueAtTime(0.40, chargeEnd + 0.015);
    boomNoiseGain.gain.exponentialRampToValueAtTime(0.001, chargeEnd + boomDuration);

    boomNoise.connect(boomNoiseFilter);
    boomNoiseFilter.connect(boomNoiseGain);
    boomNoiseGain.connect(this.masterGain);
    boomNoise.start(chargeEnd);
    boomNoise.stop(chargeEnd + boomDuration + 0.05);

    // 3. Crystalline victory chord (starts at ~0.45s after the boom)
    const chordNotes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    const chordStart = chargeEnd + 0.10;
    const chordDuration = 1.2;

    chordNotes.forEach((freq, idx) => {
      const startTime = chordStart + idx * 0.045;
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.11, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + chordDuration);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(startTime);
      osc.stop(startTime + chordDuration + 0.02);
    });
  }

  /**
   * Plays the sub-bass sawtooth void death drop: 160Hz -> 35Hz over 400ms.
   */
  playDeath() {
    if (!this.ctx || this.isMuted) return;
    this.init();

    const now = this.ctx.currentTime;
    const duration = 0.40; // 400ms

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(70, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.linearRampToValueAtTime(0.50, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }
}

export default AudioSynth;
