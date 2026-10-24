import { CONFIG } from './config.js';

/**
 * UIManager handles all 2D HUD components, speedometers, dynamic crosshairs,
 * radial speed-lines canvas fx, Personal Best localStorage persistence, and modal overlays.
 */
export class UIManager {
  constructor() {
    this.currentCourseId = 1;
    this.dom = {};
    this.initDOM();
    this.initSpeedLines();
    this.setCourse(1);
  }

  /**
   * Caches all critical DOM element references.
   */
  initDOM() {
    // If running in headless node environment, provide mock DOM
    if (typeof document === 'undefined') {
      this.dom = {
        timerDisplay: { textContent: '' },
        pbDisplay: { textContent: '' },
        medalTargets: { innerHTML: '' },
        speedValue: { textContent: '' },
        speedKmh: { textContent: '' },
        speedBarFill: { style: { width: '0%' }, className: '' },
        bracketLeft: { classList: { toggle: () => {} } },
        bracketRight: { classList: { toggle: () => {} } },
        reticleDot: { className: '' },
        rangeReadout: { textContent: '', className: '' },
        overlayScreen: { classList: { add: () => {}, remove: () => {} } },
        viewMenu: { classList: { add: () => {}, remove: () => {} } },
        viewDeath: { classList: { add: () => {}, remove: () => {} } },
        viewClear: { classList: { add: () => {}, remove: () => {} } },
        deathSplitTime: { textContent: '' },
        clearTime: { textContent: '' },
        clearPbDelta: { textContent: '', className: '' },
        clearMedalEmblem: { textContent: '' },
        clearMedalName: { textContent: '', className: '' },
        clearCourseName: { textContent: '' },
        sessionStatus: { textContent: '' },
        pills: [],
      };
      return;
    }

    this.dom = {
      // Top bar & Timer
      timerDisplay: document.getElementById('timer-display'),
      pbDisplay: document.getElementById('pb-display'),
      medalTargets: document.getElementById('medal-targets'),
      sessionStatus: document.getElementById('session-status'),

      // Crosshair Reticle
      crosshair: document.getElementById('crosshair'),
      bracketLeft: document.getElementById('bracket-left'),
      bracketRight: document.getElementById('bracket-right'),
      reticleDot: document.getElementById('reticle-dot'),
      rangeReadout: document.getElementById('range-readout'),

      // Speedometer
      speedValue: document.getElementById('speed-value'),
      speedKmh: document.getElementById('speed-kmh'),
      speedBarFill: document.getElementById('speed-bar-fill'),

      // Modals & Overlays
      overlayScreen: document.getElementById('overlay-screen'),
      viewMenu: document.getElementById('view-menu'),
      viewDeath: document.getElementById('view-death'),
      viewClear: document.getElementById('view-clear'),

      // Death & Clear stats
      deathSplitTime: document.getElementById('death-split-time'),
      clearTime: document.getElementById('clear-time'),
      clearPbDelta: document.getElementById('clear-pb-delta'),
      clearMedalEmblem: document.getElementById('clear-medal-emblem'),
      clearMedalName: document.getElementById('clear-medal-name'),
      clearCourseName: document.getElementById('clear-course-name'),

      // Buttons
      btnPlay: document.getElementById('btn-play'),
      btnRetry: document.getElementById('btn-retry'),
      btnClearRetry: document.getElementById('btn-clear-retry'),
      btnNextCourse: document.getElementById('btn-next-course'),

      // Course selection pills
      pills: [
        document.getElementById('pill-course-1'),
        document.getElementById('pill-course-2'),
        document.getElementById('pill-course-3'),
        document.getElementById('pill-course-4'),
      ].filter(Boolean),
    };
  }

  /**
   * Initializes the radial speed-lines streaming canvas effect.
   */
  initSpeedLines() {
    this.speedLines = [];
    const numLines = 55;

    // Create randomized radial particles with alternating Red, Cyan, Blue colors
    for (let i = 0; i < numLines; i++) {
      this.speedLines.push({
        angle: Math.random() * Math.PI * 2,
        dist: 0.15 + Math.random() * 0.85,
        length: 25 + Math.random() * 85,
        speed: 0.015 + Math.random() * 0.035,
        alpha: 0.2 + Math.random() * 0.8,
        width: 1.0 + Math.random() * 2.2,
        colorIndex: i % 3,
      });
    }

    if (typeof document === 'undefined') return;

    this.speedCanvas = document.getElementById('speed-lines');
    if (!this.speedCanvas) return;

    this.speedCtx = this.speedCanvas.getContext('2d');

    this.resizeCanvas = () => {
      this.speedCanvas.width = window.innerWidth;
      this.speedCanvas.height = window.innerHeight;
    };
    window.addEventListener('resize', this.resizeCanvas);
    this.resizeCanvas();
  }

  /**
   * Renders radiating speed streaks on canvas when player exceeds 40 m/s.
   * Streaks alternate between subtle neon Red, Cyan, and Blue.
   * Opacity smoothly transitions from 0.0 at 40 m/s to 0.75 at 75 m/s.
   *
   * @param {number} speed Velocity magnitude in m/s
   */
  renderSpeedLines(speed) {
    if (!this.speedCtx || !this.speedCanvas) return;

    const w = this.speedCanvas.width;
    const h = this.speedCanvas.height;

    // Clear canvas
    this.speedCtx.clearRect(0, 0, w, h);

    if (speed <= 40.0) return;

    // Intensity ratio in [0, 1]
    const intensity = Math.min(1.0, (speed - 40.0) / 35.0);
    const centerX = w / 2;
    const centerY = h / 2;
    const maxRadius = Math.hypot(centerX, centerY);

    this.speedCtx.save();
    this.speedCtx.lineCap = 'round';

    const colors = [
      '255, 0, 68',   // Subtle neon Red (Beat Saber Crimson)
      '0, 240, 255',  // Subtle neon Cyan (Tron Cyan)
      '0, 170, 255',  // Subtle neon Blue (Beat Saber Electric Blue)
    ];

    for (const line of this.speedLines) {
      // Advance distance along streak trajectory
      line.dist += line.speed * (1.0 + intensity * 2.5);
      if (line.dist > 1.2) {
        line.dist = 0.15 + Math.random() * 0.25;
        line.angle = Math.random() * Math.PI * 2;
      }

      const r1 = line.dist * maxRadius;
      const r2 = r1 + line.length * (0.8 + intensity * 1.4);

      const x1 = centerX + Math.cos(line.angle) * r1;
      const y1 = centerY + Math.sin(line.angle) * r1;
      const x2 = centerX + Math.cos(line.angle) * r2;
      const y2 = centerY + Math.sin(line.angle) * r2;

      const alpha = line.alpha * intensity * 0.75;
      const rgb = colors[line.colorIndex % 3];
      this.speedCtx.strokeStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
      this.speedCtx.lineWidth = line.width;

      this.speedCtx.beginPath();
      this.speedCtx.moveTo(x1, y1);
      this.speedCtx.lineTo(x2, y2);
      this.speedCtx.stroke();
    }

    this.speedCtx.restore();
  }

  /**
   * Formats a duration in seconds into MM:SS.mmm format.
   *
   * @param {number} totalSeconds Time in seconds
   * @returns {string} e.g. "01:23.456"
   */
  formatTime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const totalMs = Math.round(totalSeconds * 1000);
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;

    const mm = mins.toString().padStart(2, '0');
    const ss = secs.toString().padStart(2, '0');
    const mmm = ms.toString().padStart(3, '0');
    return `${mm}:${ss}.${mmm}`;
  }

  /**
   * Retrieves the stored personal best for a course from localStorage.
   *
   * @param {number} courseId
   * @returns {number|null} Time in seconds, or distance in meters for Endless
   */
  getPersonalBest(courseId) {
    try {
      if (typeof localStorage === 'undefined') return null;
      const val = localStorage.getItem(`aerohook_pb_course_${courseId}`);
      return val ? parseFloat(val) : null;
    } catch {
      return null;
    }
  }

  /**
   * Evaluates and stores personal best.
   * For standard courses: lower time is better.
   * For endless mode: higher distance is better.
   *
   * @param {number} courseId
   * @param {number} result Time in seconds or distance in meters
   * @returns {{ isNewPB: boolean, previousPB: number|null, currentPB: number }}
   */
  savePersonalBest(courseId, result) {
    const isEndless = courseId === 4;
    const prev = this.getPersonalBest(courseId);

    let isNewPB = false;
    if (prev === null) {
      isNewPB = true;
    } else if (isEndless) {
      isNewPB = result > prev;
    } else {
      isNewPB = result < prev;
    }

    const currentPB = isNewPB ? result : prev;

    if (isNewPB && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`aerohook_pb_course_${courseId}`, currentPB.toString());
      } catch (err) {
        console.warn('Could not write PB to localStorage:', err);
      }
    }

    return { isNewPB, previousPB: prev, currentPB };
  }

  /**
   * Computes the earned medal for a clear time.
   *
   * @param {number} courseId
   * @param {number} time
   * @returns {{ type: string, name: string, icon: string, color: string }}
   */
  calculateMedal(courseId, time) {
    const course = CONFIG.COURSES[courseId];
    if (!course || course.isEndless) {
      return { type: 'endless', name: 'SURVIVOR', icon: '⚡', color: '#00f0ff' };
    }

    if (time <= course.authorTime) {
      return { type: 'author', name: 'AUTHOR MEDAL', icon: '💎', color: '#00f0ff' };
    }
    if (time <= course.goldTime) {
      return { type: 'gold', name: 'GOLD MEDAL', icon: '🥇', color: '#facc15' };
    }
    if (time <= course.silverTime) {
      return { type: 'silver', name: 'SILVER MEDAL', icon: '🥈', color: '#cbd5e1' };
    }
    if (time <= course.bronzeTime) {
      return { type: 'bronze', name: 'BRONZE MEDAL', icon: '🥉', color: '#d97706' };
    }
    return { type: 'clear', name: 'COURSE CLEAR', icon: '🏁', color: '#10b981' };
  }

  /**
   * Sets the active course preset, updating pills, PB display, and target split splits.
   *
   * @param {number} courseId 1, 2, 3, or 4
   */
  setCourse(courseId) {
    this.currentCourseId = courseId;
    const course = CONFIG.COURSES[courseId] || CONFIG.COURSES[1];

    // 1. Update navigation pill highlights
    if (this.dom.pills) {
      this.dom.pills.forEach((pill, idx) => {
        if (pill) {
          const isActive = idx + 1 === courseId;
          pill.classList.toggle('active', isActive);
        }
      });
    }

    // 2. Update PB readout and split targets
    const pb = this.getPersonalBest(courseId);
    if (course.isEndless) {
      if (this.dom.pbDisplay) {
        this.dom.pbDisplay.textContent = pb !== null
          ? `BEST: ${Math.round(pb).toLocaleString()} M`
          : 'BEST: -- M';
      }
      if (this.dom.medalTargets) {
        this.dom.medalTargets.innerHTML = `<span class="medal-target author">⚡ SURVIVE THE ABYSS</span>`;
      }
    } else {
      if (this.dom.pbDisplay) {
        this.dom.pbDisplay.textContent = pb !== null
          ? `PB: ${this.formatTime(pb)}`
          : 'PB: --:--.---';
      }
      if (this.dom.medalTargets) {
        this.dom.medalTargets.innerHTML = `
          <span class="medal-target author" title="Author Target">💎 ${course.authorTime.toFixed(2)}s</span>
          <span class="medal-target gold" title="Gold Target">🥇 ${course.goldTime.toFixed(2)}s</span>
          <span class="medal-target silver" title="Silver Target">🥈 ${course.silverTime.toFixed(2)}s</span>
          <span class="medal-target bronze" title="Bronze Target">🥉 ${course.bronzeTime.toFixed(2)}s</span>
        `;
      }
    }
  }

  /**
   * Real-time HUD update called every animation frame.
   *
   * @param {Object} state
   * @param {number} [state.speed=0] Velocity magnitude in m/s
   * @param {boolean} [state.leftActive=false] Left hook pulling state
   * @param {boolean} [state.rightActive=false] Right hook pulling state
   * @param {Object} [state.hooks=null] Optional direct reference to { left: { active }, right: { active } }
   * @param {Object|null} [state.targetInfo=null] Reticle raycast info: { hit, distance, assisted }
   * @param {number} [state.elapsedTime=0] Time in seconds
   * @param {number} [state.courseId=1] Current course preset
   * @param {number} [state.distanceTraveled=0] Traveled distance in meters (for Endless)
   * @param {string} [state.sessionStatus] e.g. "RUNNING", "READY", etc.
   */
  updateHUD({
    speed = 0,
    leftActive = false,
    rightActive = false,
    hooks = null,
    targetInfo = null,
    elapsedTime = 0,
    courseId = this.currentCourseId,
    distanceTraveled = 0,
    sessionStatus = 'RUNNING',
  } = {}) {
    // 1. Timer / Distance display
    if (this.dom.timerDisplay) {
      if (courseId === 4) {
        this.dom.timerDisplay.textContent = `${Math.round(distanceTraveled).toLocaleString()} M`;
      } else {
        this.dom.timerDisplay.textContent = this.formatTime(elapsedTime);
      }
    }

    if (this.dom.sessionStatus && sessionStatus) {
      this.dom.sessionStatus.textContent = sessionStatus;
    }

    // 2. Reticle Hook Brackets (Beat Saber Crimson Red left, Electric Blue right)
    const isLeft = Boolean(hooks?.left?.active ?? leftActive);
    const isRight = Boolean(hooks?.right?.active ?? rightActive);

    if (this.dom.bracketLeft && this.dom.bracketLeft.classList) {
      this.dom.bracketLeft.classList.toggle('active', isLeft);
    }
    if (this.dom.bracketRight && this.dom.bracketRight.classList) {
      this.dom.bracketRight.classList.toggle('active', isRight);
    }

    // 3. Reticle Dot & Range Readout
    if (this.dom.reticleDot && this.dom.rangeReadout) {
      if (targetInfo && targetInfo.hit) {
        if (targetInfo.assisted) {
          this.dom.rangeReadout.textContent = 'SNAP';
          this.dom.rangeReadout.className = 'range-readout magnet-snap';
          this.dom.reticleDot.className = 'reticle-dot target-magnet';
        } else {
          this.dom.rangeReadout.textContent = `${Math.round(targetInfo.distance)}m`;
          this.dom.rangeReadout.className = 'range-readout in-range';
          this.dom.reticleDot.className = 'reticle-dot target-locked';
        }
      } else {
        this.dom.rangeReadout.textContent = '---';
        this.dom.rangeReadout.className = 'range-readout';
        this.dom.reticleDot.className = 'reticle-dot';
      }
    }

    // 4. Speedometer Readouts & Dynamic Bar
    const roundSpeed = Math.round(speed);
    if (this.dom.speedValue) {
      this.dom.speedValue.textContent = roundSpeed.toString().padStart(2, '0');
    }
    if (this.dom.speedKmh) {
      this.dom.speedKmh.textContent = `${Math.round(speed * 3.6)} KM/H`;
    }

    if (this.dom.speedBarFill) {
      const pct = Math.min(100, Math.max(0, (speed / CONFIG.PHYSICS.MAX_SPEED) * 100));
      this.dom.speedBarFill.style.width = `${pct}%`;

      if (speed > 55.0) {
        this.dom.speedBarFill.className = 'speed-bar-fill overdrive';
      } else if (speed > 35.0) {
        this.dom.speedBarFill.className = 'speed-bar-fill mid-speed';
      } else {
        this.dom.speedBarFill.className = 'speed-bar-fill';
      }
    }

    // 5. Speed Lines Canvas FX
    this.renderSpeedLines(speed);
  }

  /**
   * Displays modal overlay screen ('MENU', 'DEAD', 'FINISHED').
   *
   * @param {'MENU'|'DEAD'|'FINISHED'} type
   * @param {Object} [data]
   */
  showOverlay(type, data = {}) {
    if (!this.dom.overlayScreen) return;

    this.dom.overlayScreen.classList.remove('hidden');

    if (this.dom.viewMenu) this.dom.viewMenu.classList.add('hidden');
    if (this.dom.viewDeath) this.dom.viewDeath.classList.add('hidden');
    if (this.dom.viewClear) this.dom.viewClear.classList.add('hidden');

    switch (type) {
      case 'MENU':
        if (this.dom.viewMenu) this.dom.viewMenu.classList.remove('hidden');
        break;

      case 'DEAD':
        if (this.dom.viewDeath) {
          this.dom.viewDeath.classList.remove('hidden');
          if (this.dom.deathSplitTime && data.time !== undefined) {
            this.dom.deathSplitTime.textContent = this.formatTime(data.time);
          }
        }
        break;

      case 'FINISHED':
        if (this.dom.viewClear) {
          this.dom.viewClear.classList.remove('hidden');
          const time = data.time || 0;
          const courseId = data.courseId || this.currentCourseId;
          const course = CONFIG.COURSES[courseId] || CONFIG.COURSES[1];

          if (this.dom.clearCourseName) {
            this.dom.clearCourseName.textContent = course.name.toUpperCase();
          }
          if (this.dom.clearTime) {
            this.dom.clearTime.textContent = this.formatTime(time);
          }

          // Compute PB
          const pbResult = this.savePersonalBest(courseId, time);
          if (this.dom.clearPbDelta) {
            if (pbResult.isNewPB && pbResult.previousPB !== null) {
              const diff = time - pbResult.previousPB;
              this.dom.clearPbDelta.textContent = `${diff.toFixed(3)}s (NEW PB!)`;
              this.dom.clearPbDelta.className = 'stat-val font-mono text-green';
            } else if (pbResult.previousPB !== null) {
              const diff = time - pbResult.previousPB;
              this.dom.clearPbDelta.textContent = `+${diff.toFixed(3)}s (PB: ${this.formatTime(pbResult.previousPB)})`;
              this.dom.clearPbDelta.className = 'stat-val font-mono';
            } else {
              this.dom.clearPbDelta.textContent = 'FIRST RECORD!';
              this.dom.clearPbDelta.className = 'stat-val font-mono text-green';
            }
          }

          // Compute Medal
          const medal = this.calculateMedal(courseId, time);
          if (this.dom.clearMedalEmblem) {
            this.dom.clearMedalEmblem.textContent = medal.icon;
          }
          if (this.dom.clearMedalName) {
            this.dom.clearMedalName.textContent = medal.name;
            this.dom.clearMedalName.style.color = medal.color;
          }
        }
        break;
    }
  }

  /**
   * Hides the overlay modal screen.
   */
  hideOverlay() {
    if (this.dom.overlayScreen) {
      this.dom.overlayScreen.classList.add('hidden');
    }
  }
}

export default UIManager;
