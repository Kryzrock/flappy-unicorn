(() => {
  'use strict';

  const STORAGE_KEY_BEST = 'flappy_unicorn_best_score_v1';
  const STORAGE_KEY_MUTED = 'flappy_unicorn_muted_v1';
  const MUSHROOM_GOAL = 15;

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // UI Elements
  const startOverlay = document.getElementById('startOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const victoryOverlay = document.getElementById('victoryOverlay');
  const exitOverlay = document.getElementById('exitOverlay');
  const gameFrame = document.getElementById('gameFrame');

  const hudCenter = document.getElementById('hudCenter');
  const currentScoreEl = document.getElementById('currentScore');
  const mushroomCountEl = document.getElementById('mushroomCount');
  const mushroomTargetEl = document.getElementById('mushroomTarget');
  const queenBanner = document.getElementById('queenBanner');

  const startBestScoreEl = document.getElementById('startBestScore');
  const finalScoreEl = document.getElementById('finalScore');
  const finalMushroomsEl = document.getElementById('finalMushrooms');
  const finalBestScoreEl = document.getElementById('finalBestScore');
  const newRecordBadge = document.getElementById('newRecordBadge');
  const medalIconEl = document.getElementById('medalIcon');
  const medalNameEl = document.getElementById('medalName');

  const victoryScoreEl = document.getElementById('victoryScore');
  const victoryBestScoreEl = document.getElementById('victoryBestScore');

  const speedBadge = document.getElementById('speedBadge');
  const speedText = document.getElementById('speedText');

  const soundBtn = document.getElementById('soundBtn');
  const soundIcon = document.getElementById('soundIcon');
  const pauseBtn = document.getElementById('pauseBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const fullscreenIcon = document.getElementById('fullscreenIcon');
  const exitBtn = document.getElementById('exitBtn');

  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartFromPauseBtn = document.getElementById('restartFromPauseBtn');
  const restartBtn = document.getElementById('restartBtn');
  const victoryRestartBtn = document.getElementById('victoryRestartBtn');
  const returnToGameBtn = document.getElementById('returnToGameBtn');

  mushroomTargetEl.textContent = String(MUSHROOM_GOAL);

  // Logical coordinate space
  const WORLD = {
    width: 420,
    height: 740,
    groundHeight: 86,
  };

  // Physics & acceleration constants
  const PHYSICS = {
    gravity: 1680,
    flapVelocity: -520,
    maxFallSpeed: 760,
    baseScrollSpeed: 195,
    maxBoostMultiplier: 1.68,
    boostPerFlap: 0.42,
    boostDecayRate: 1.15,
    progressiveSpeedCap: 1.25,
  };

  const PIPE_CFG = {
    width: 68,
    gapBase: 178,
    gapMin: 144,
    spacing: 255,
    minTop: 72,
  };

  const STATES = {
    START: 'start',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover',
    VICTORY: 'victory',
  };

  const RAINBOW_COLORS = [
    '#ff5e7e',
    '#ff9f43',
    '#fde047',
    '#4ade80',
    '#38bdf8',
    '#a855f7',
  ];

  // 8-bit / 16-bit Chiptune Sound & Music Engine (Web Audio API)
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.noiseBuffer = null;
      this.musicTimer = null;
      this.musicStep = 0;
      this.isMusicPlaying = false;
      this.muted = localStorage.getItem(STORAGE_KEY_MUTED) === '1';
      this.syncUI();
    }

    ensureContext() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
          this.noiseBuffer = this.createNoiseBuffer(this.ctx);
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    createNoiseBuffer(ac) {
      const length = Math.floor(ac.sampleRate * 0.4);
      const buffer = ac.createBuffer(1, length, ac.sampleRate);
      const data = buffer.getChannelData(0);
      // Stepped pseudo-random noise for authentic 8-bit NES/GameBoy grit
      let last = 0;
      for (let i = 0; i < length; i++) {
        if (i % 4 === 0) {
          last = Math.random() * 2 - 1;
        }
        data[i] = last;
      }
      return buffer;
    }

    playTone(freq, type, startTime, duration, volume, endFreq = null) {
      const ac = this.ctx;
      if (!ac || this.muted) return;

      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      if (endFreq !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration);
      }

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    }

    playNoise(startTime, duration, volume, filterFreq = 800, endFilterFreq = 240) {
      const ac = this.ctx;
      if (!ac || !this.noiseBuffer || this.muted) return;

      const src = ac.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, startTime);
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, endFilterFreq), startTime + duration);
      filter.Q.value = 1.6;

      const gain = ac.createGain();
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      src.start(startTime);
      src.stop(startTime + duration + 0.02);
    }

    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem(STORAGE_KEY_MUTED, this.muted ? '1' : '0');
      this.syncUI();
      if (this.muted) {
        this.stopMusic();
      } else if (state === STATES.PLAYING) {
        this.startMusic();
      }
    }

    syncUI() {
      soundIcon.textContent = this.muted ? '🔇' : '🔊';
      soundBtn.setAttribute('aria-label', this.muted ? 'Activar sonido' : 'Silenciar sonido');
    }

    startMusic() {
      if (this.muted || this.isMusicPlaying) return;
      const ac = this.ensureContext();
      if (!ac) return;

      this.isMusicPlaying = true;
      // Upbeat 8-bit/16-bit chiptune loop (140 BPM -> ~107ms per 16th/8th step)
      const leadNotes = [
        523.25, 0, 659.25, 783.99, 1046.5, 0, 783.99, 659.25,
        587.33, 0, 698.46, 880.0, 987.77, 0, 880.0, 698.46,
        523.25, 659.25, 783.99, 0, 880.0, 1046.5, 987.77, 783.99,
        659.25, 587.33, 523.25, 0, 392.0, 440.0, 493.88, 0,
      ];
      const bassNotes = [
        130.81, 0, 196.0, 0, 130.81, 0, 196.0, 0,
        146.83, 0, 220.0, 0, 146.83, 0, 220.0, 0,
        130.81, 0, 196.0, 0, 174.61, 0, 196.0, 0,
        130.81, 0, 196.0, 0, 130.81, 146.83, 164.81, 196.0,
      ];

      const stepMs = 135;
      const tick = () => {
        if (!this.isMusicPlaying || this.muted || !this.ctx) return;
        const now = this.ctx.currentTime;
        const idx = this.musicStep % leadNotes.length;
        const lead = leadNotes[idx];
        const bass = bassNotes[idx];

        if (lead > 0) {
          this.playTone(lead, 'square', now, 0.1, 0.032);
        }
        if (bass > 0) {
          this.playTone(bass, 'triangle', now, 0.12, 0.055);
        }
        if (idx % 4 === 2) {
          this.playNoise(now, 0.035, 0.018, 2200, 1400);
        }

        this.musicStep += 1;
      };

      tick();
      this.musicTimer = setInterval(tick, stepMs);
    }

    stopMusic() {
      this.isMusicPlaying = false;
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    }

    playFartFlap(boostLevel) {
      const ac = this.ensureContext();
      if (!ac) return;

      const now = ac.currentTime;
      const pitchShift = (boostLevel - 1) * 45;

      // 8-bit noise puff + stepped sawtooth flatulence propulsion
      this.playNoise(now, 0.14, 0.14, 520 + pitchShift, 150);
      this.playTone(150 + pitchShift, 'sawtooth', now, 0.13, 0.11, 58);

      // 8-bit square-wave upward arpeggio for wing lift + turbo boost
      const arp = [392 + pitchShift * 1.5, 523.25 + pitchShift * 1.5, 659.25 + pitchShift * 1.5];
      arp.forEach((f, idx) => {
        this.playTone(f, 'square', now + idx * 0.032, 0.055, 0.065);
      });
    }

    playMushroom() {
      const ac = this.ensureContext();
      if (!ac) return;
      const now = ac.currentTime;
      // Classic 8-bit/16-bit power-up arpeggio
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        this.playTone(freq, 'square', now + idx * 0.04, 0.09, 0.08);
        this.playTone(freq * 0.5, 'triangle', now + idx * 0.04, 0.09, 0.06);
      });
    }

    playScore() {
      const ac = this.ensureContext();
      if (!ac) return;
      const now = ac.currentTime;
      // Classic 8-bit coin/point double blip
      this.playTone(987.77, 'square', now, 0.065, 0.07);
      this.playTone(1318.51, 'square', now + 0.065, 0.14, 0.07);
    }

    playQueenAppear() {
      const ac = this.ensureContext();
      if (!ac) return;
      const now = ac.currentTime;
      // 16-bit royal fanfare
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const t = now + idx * 0.085;
        this.playTone(freq, 'square', t, 0.18, 0.085);
        this.playTone(freq * 0.5, 'triangle', t, 0.22, 0.09);
      });
    }

    playVictory() {
      const ac = this.ensureContext();
      if (!ac) return;
      const now = ac.currentTime;
      // Celebratory 8-bit/16-bit victory jingle
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51];
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.085;
        const dur = idx === notes.length - 1 ? 0.36 : 0.11;
        this.playTone(freq, 'square', t, dur, 0.09);
        this.playTone(freq * 0.5, 'triangle', t, dur, 0.08);
      });
    }

    playCrash() {
      const ac = this.ensureContext();
      if (!ac) return;
      const now = ac.currentTime;
      // 8-bit noise explosion + descending square wave
      this.playNoise(now, 0.28, 0.2, 950, 110);
      this.playTone(240, 'square', now, 0.28, 0.11, 48);
    }
  }

  const sfx = new SoundFX();

  // Game state
  let state = STATES.START;
  let score = 0;
  let mushroomsCollected = 0;
  let bestScore = Number(localStorage.getItem(STORAGE_KEY_BEST) || 0);
  let gameOverAt = 0;
  let lastFrameTime = 0;
  let animTime = 0;

  let speedMultiplier = 1.0;
  let groundOffset = 0;
  let screenShake = 0;

  // Unicorn entity
  const unicorn = {
    x: 112,
    y: WORLD.height * 0.44,
    vy: 0,
    radius: 17,
    rotation: 0,
    wingPhase: 0,
    wingFlapBurst: 0,
    blinkTimer: 2.5,
    isBlinking: false,
    trail: [],
  };

  // Mushroom Queen finale entity
  const queen = {
    active: false,
    x: WORLD.width + 130,
    y: WORLD.height * 0.42,
    radius: 44,
  };

  let pipes = [];
  let mushrooms = [];
  let gasPuffs = [];
  let particles = [];
  let floatingTexts = [];
  let speedLines = [];
  let clouds = [];
  let stars = [];

  function initBackdrop() {
    clouds = Array.from({ length: 7 }, (_, i) => ({
      x: (i * 95) % (WORLD.width + 100),
      y: 70 + (i % 4) * 72 + Math.random() * 22,
      scale: 0.65 + (i % 3) * 0.25,
      speed: 18 + (i % 3) * 10,
    }));

    stars = Array.from({ length: 28 }, () => ({
      x: Math.random() * WORLD.width,
      y: Math.random() * (WORLD.height * 0.55),
      size: 1 + Math.random() * 2,
      twinkleOffset: Math.random() * Math.PI * 2,
    }));
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function resetGame() {
    score = 0;
    mushroomsCollected = 0;
    speedMultiplier = 1.0;
    screenShake = 0;
    pipes = [];
    mushrooms = [];
    gasPuffs = [];
    particles = [];
    floatingTexts = [];
    speedLines = [];

    queen.active = false;
    queen.x = WORLD.width + 130;
    queen.y = WORLD.height * 0.42;
    queenBanner.hidden = true;

    unicorn.y = WORLD.height * 0.44;
    unicorn.vy = 0;
    unicorn.rotation = 0;
    unicorn.wingPhase = 0;
    unicorn.wingFlapBurst = 0;
    unicorn.trail = [];

    currentScoreEl.textContent = '0';
    mushroomCountEl.textContent = '0';
    updateSpeedHUD();
  }

  function spawnPipe(xPos) {
    if (queen.active) return;

    const playableHeight = WORLD.height - WORLD.groundHeight;
    const dynamicGap = Math.max(PIPE_CFG.gapMin, PIPE_CFG.gapBase - score * 0.8);
    const maxTop = playableHeight - PIPE_CFG.minTop - dynamicGap;
    const topHeight = PIPE_CFG.minTop + Math.random() * Math.max(40, maxTop - PIPE_CFG.minTop);

    pipes.push({
      x: xPos,
      topHeight,
      gap: dynamicGap,
      passed: false,
    });

    // Spawn a collectible magical mushroom inside or just after the gap
    const inGap = Math.random() > 0.35;
    const mX = inGap
      ? xPos + PIPE_CFG.width * 0.5
      : xPos + PIPE_CFG.width + PIPE_CFG.spacing * 0.42;
    const mY = inGap
      ? topHeight + dynamicGap * (0.32 + Math.random() * 0.36)
      : 120 + Math.random() * (playableHeight - 240);

    mushrooms.push({
      x: mX,
      baseY: mY,
      y: mY,
      radius: 15,
      phase: Math.random() * Math.PI * 2,
      variant: Math.random() > 0.7 ? 'gold' : 'red',
      collected: false,
    });
  }

  function spawnFlatulenceBurst() {
    // Rainbow flatulence cloud puffs shooting backward from unicorn's rear
    for (let i = 0; i < 6; i++) {
      const color = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
      gasPuffs.push({
        x: unicorn.x - 24 - Math.random() * 6,
        y: unicorn.y + 6 + (Math.random() - 0.5) * 10,
        vx: -110 - Math.random() * 90,
        vy: 15 + (Math.random() - 0.5) * 55,
        radius: 7 + Math.random() * 8,
        color,
        life: 0.45 + Math.random() * 0.2,
        maxLife: 0.65,
      });
    }

    // Extra stardust sparkles
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * 1.1;
      const speed = 75 + Math.random() * 140;
      particles.push({
        x: unicorn.x - 22,
        y: unicorn.y + 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 20,
        size: 2.5 + Math.random() * 3.8,
        color: RAINBOW_COLORS[i % RAINBOW_COLORS.length],
        life: 0.45 + Math.random() * 0.2,
        maxLife: 0.65,
        isStar: true,
      });
    }

    // Wind speed lines
    for (let i = 0; i < 4; i++) {
      speedLines.push({
        x: WORLD.width + Math.random() * 60,
        y: 60 + Math.random() * (WORLD.height - WORLD.groundHeight - 100),
        len: 35 + Math.random() * 55,
        life: 0.4,
      });
    }
  }

  function spawnSparkles(x, y, count, palette) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 190;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4.5,
        color: palette[i % palette.length],
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
        isStar: true,
      });
    }
  }

  function flapAndAccelerate() {
    if (state === STATES.START) {
      startGame();
    } else if (state !== STATES.PLAYING) {
      return;
    }

    unicorn.vy = PHYSICS.flapVelocity;
    unicorn.wingFlapBurst = 1.0;

    // Accelerate horizontally on action press
    speedMultiplier = Math.min(
      PHYSICS.maxBoostMultiplier,
      Math.max(1.22, speedMultiplier + PHYSICS.boostPerFlap)
    );
    updateSpeedHUD();
    spawnFlatulenceBurst();
    sfx.playFartFlap(speedMultiplier);
  }

  function startGame() {
    resetGame();
    state = STATES.PLAYING;
    startOverlay.hidden = true;
    pauseOverlay.hidden = true;
    gameOverOverlay.hidden = true;
    victoryOverlay.hidden = true;
    hudCenter.hidden = false;
    speedBadge.hidden = false;
    pauseBtn.hidden = false;

    spawnPipe(WORLD.width + 120);
    spawnPipe(WORLD.width + 120 + PIPE_CFG.spacing);
    spawnPipe(WORLD.width + 120 + PIPE_CFG.spacing * 2);
    sfx.startMusic();
  }

  function togglePause() {
    if (state === STATES.PLAYING) {
      state = STATES.PAUSED;
      pauseOverlay.hidden = false;
      sfx.stopMusic();
    } else if (state === STATES.PAUSED) {
      state = STATES.PLAYING;
      pauseOverlay.hidden = true;
      lastFrameTime = performance.now();
      sfx.startMusic();
    }
  }

  function getMedal(points) {
    if (points >= 35) return { icon: '🌈', name: 'Leyenda Arcoíris' };
    if (points >= 22) return { icon: '💎', name: 'Unicornio Diamante' };
    if (points >= 14) return { icon: '🥇', name: 'Alas de Oro' };
    if (points >= 7) return { icon: '🥈', name: 'Corcel de Plata' };
    if (points >= 3) return { icon: '🥉', name: 'Estrella de Bronce' };
    return { icon: '🪽', name: 'Aprendiz del cielo' };
  }

  function saveBestScore() {
    const isNewRecord = score > bestScore;
    if (isNewRecord) {
      bestScore = score;
      localStorage.setItem(STORAGE_KEY_BEST, String(bestScore));
    }
    startBestScoreEl.textContent = String(bestScore);
    return isNewRecord;
  }

  function triggerGameOver() {
    if (state === STATES.GAMEOVER || state === STATES.VICTORY) return;
    state = STATES.GAMEOVER;
    gameOverAt = performance.now();
    screenShake = 12;
    spawnSparkles(unicorn.x, unicorn.y, 22, RAINBOW_COLORS);
    sfx.stopMusic();
    sfx.playCrash();

    const isNewRecord = saveBestScore();
    finalScoreEl.textContent = String(score);
    finalMushroomsEl.textContent = String(mushroomsCollected);
    finalBestScoreEl.textContent = String(bestScore);
    newRecordBadge.hidden = !isNewRecord;

    const medal = getMedal(score);
    medalIconEl.textContent = medal.icon;
    medalNameEl.textContent = medal.name;

    pauseBtn.hidden = true;
    speedBadge.hidden = true;
    queenBanner.hidden = true;
    gameOverOverlay.hidden = false;
  }

  function triggerVictory() {
    if (state === STATES.VICTORY) return;
    state = STATES.VICTORY;
    gameOverAt = performance.now();
    score += 10; // Royal completion bonus!
    currentScoreEl.textContent = String(score);
    saveBestScore();
    spawnSparkles(queen.x, queen.y, 38, RAINBOW_COLORS);
    sfx.stopMusic();
    sfx.playVictory();

    victoryScoreEl.textContent = String(score);
    victoryBestScoreEl.textContent = String(bestScore);

    pauseBtn.hidden = true;
    speedBadge.hidden = true;
    queenBanner.hidden = true;
    victoryOverlay.hidden = false;
  }

  function updateSpeedHUD() {
    const progressive = 1 + Math.min(0.25, score * 0.008);
    const effective = speedMultiplier * progressive;
    speedText.textContent = `${effective.toFixed(1)}x`;
    speedBadge.classList.toggle('is-boosting', speedMultiplier > 1.08);
  }

  function update(dt) {
    animTime += dt;

    // Blink logic
    unicorn.blinkTimer -= dt;
    if (unicorn.blinkTimer <= 0) {
      if (unicorn.isBlinking) {
        unicorn.isBlinking = false;
        unicorn.blinkTimer = 2.2 + Math.random() * 2.8;
      } else {
        unicorn.isBlinking = true;
        unicorn.blinkTimer = 0.11;
      }
    }

    // Wing flapping animation
    const flapSpeed = state === STATES.GAMEOVER
      ? 0
      : 11 + unicorn.wingFlapBurst * 18 + (speedMultiplier - 1) * 10;
    unicorn.wingPhase += dt * flapSpeed;
    unicorn.wingFlapBurst = Math.max(0, unicorn.wingFlapBurst - dt * 2.8);

    // Clouds drift
    for (const c of clouds) {
      c.x -= (c.speed * (state === STATES.PLAYING ? speedMultiplier : 1)) * dt;
      if (c.x < -110) {
        c.x = WORLD.width + 90;
      }
    }

    // Gas puffs update
    for (let i = gasPuffs.length - 1; i >= 0; i--) {
      const g = gasPuffs[i];
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.radius += dt * 16;
      g.life -= dt;
      if (g.life <= 0) gasPuffs.splice(i, 1);
    }

    // Particles update
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Floating texts update
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const f = floatingTexts[i];
      f.y -= 42 * dt;
      f.life -= dt;
      if (f.life <= 0) floatingTexts.splice(i, 1);
    }

    // Speed lines update
    for (let i = speedLines.length - 1; i >= 0; i--) {
      const l = speedLines[i];
      l.x -= 680 * speedMultiplier * dt;
      l.life -= dt;
      if (l.life <= 0 || l.x + l.len < 0) speedLines.splice(i, 1);
    }

    if (screenShake > 0) {
      screenShake = Math.max(0, screenShake - dt * 36);
    }

    if (state === STATES.START || state === STATES.VICTORY) {
      unicorn.y = WORLD.height * 0.43 + Math.sin(animTime * 3.2) * 10;
      unicorn.rotation = Math.sin(animTime * 3.2) * 0.06;
      groundOffset = (groundOffset + PHYSICS.baseScrollSpeed * 0.55 * dt) % 48;
      return;
    }

    if (state === STATES.PAUSED) {
      return;
    }

    if (state === STATES.GAMEOVER) {
      const groundY = WORLD.height - WORLD.groundHeight - unicorn.radius;
      if (unicorn.y < groundY) {
        unicorn.vy = Math.min(PHYSICS.maxFallSpeed, unicorn.vy + PHYSICS.gravity * dt);
        unicorn.y = Math.min(groundY, unicorn.y + unicorn.vy * dt);
        unicorn.rotation = Math.min(Math.PI * 0.48, unicorn.rotation + dt * 5);
      }
      return;
    }

    // PLAYING state
    if (speedMultiplier > 1.0) {
      speedMultiplier = Math.max(1.0, speedMultiplier - PHYSICS.boostDecayRate * dt);
      updateSpeedHUD();
    }

    const progressive = 1 + Math.min(PHYSICS.progressiveSpeedCap - 1, score * 0.008);
    const currentScrollSpeed = PHYSICS.baseScrollSpeed * progressive * speedMultiplier;

    groundOffset = (groundOffset + currentScrollSpeed * dt) % 48;

    // Vertical physics
    unicorn.vy = Math.min(PHYSICS.maxFallSpeed, unicorn.vy + PHYSICS.gravity * dt);
    unicorn.y += unicorn.vy * dt;

    const targetRot = unicorn.vy < 0
      ? -0.34
      : Math.min(0.85, (unicorn.vy / PHYSICS.maxFallSpeed) * 1.15);
    unicorn.rotation += (targetRot - unicorn.rotation) * Math.min(1, dt * 10);

    // Rainbow ribbon trail
    unicorn.trail.unshift({ x: unicorn.x - 18, y: unicorn.y + 2 });
    for (let i = 0; i < unicorn.trail.length; i++) {
      unicorn.trail[i].x -= currentScrollSpeed * dt;
    }
    if (unicorn.trail.length > 18) unicorn.trail.pop();

    // Ceiling clamp
    if (unicorn.y < unicorn.radius + 6) {
      unicorn.y = unicorn.radius + 6;
      unicorn.vy = 0;
    }

    // Ground collision
    const groundY = WORLD.height - WORLD.groundHeight;
    if (unicorn.y + unicorn.radius >= groundY) {
      unicorn.y = groundY - unicorn.radius;
      triggerGameOver();
      return;
    }

    // Collectible mushrooms update & pickup
    for (let i = mushrooms.length - 1; i >= 0; i--) {
      const m = mushrooms[i];
      m.x -= currentScrollSpeed * dt;
      m.y = m.baseY + Math.sin(animTime * 4 + m.phase) * 7;

      const dx = unicorn.x - m.x;
      const dy = unicorn.y - m.y;
      const dist = Math.hypot(dx, dy);

      if (!m.collected && dist < unicorn.radius + m.radius + 4) {
        m.collected = true;
        mushroomsCollected += 1;
        const pts = m.variant === 'gold' ? 2 : 1;
        score += pts;

        currentScoreEl.textContent = String(score);
        mushroomCountEl.textContent = String(Math.min(MUSHROOM_GOAL, mushroomsCollected));

        spawnSparkles(m.x, m.y, 12, ['#fde047', '#f472b6', '#4ade80']);
        floatingTexts.push({
          x: m.x,
          y: m.y - 10,
          text: `+1 🍄`,
          life: 0.75,
        });
        sfx.playMushroom();

        if (!queen.active && mushroomsCollected >= MUSHROOM_GOAL) {
          queen.active = true;
          queen.x = WORLD.width + 200;
          queenBanner.hidden = false;
          sfx.playQueenAppear();
        }

        mushrooms.splice(i, 1);
        continue;
      }

      if (m.x < -40) {
        mushrooms.splice(i, 1);
      }
    }

    // Pipes movement & collision
    for (let i = pipes.length - 1; i >= 0; i--) {
      const pipe = pipes[i];
      pipe.x -= currentScrollSpeed * dt;

      if (!pipe.passed && pipe.x + PIPE_CFG.width < unicorn.x) {
        pipe.passed = true;
        score += 1;
        currentScoreEl.textContent = String(score);
        sfx.playScore();
      }

      const inPipeX =
        unicorn.x + unicorn.radius > pipe.x + 3 &&
        unicorn.x - unicorn.radius < pipe.x + PIPE_CFG.width - 3;

      if (inPipeX) {
        const hitTop = unicorn.y - unicorn.radius < pipe.topHeight;
        const hitBottom = unicorn.y + unicorn.radius > pipe.topHeight + pipe.gap;
        if (hitTop || hitBottom) {
          triggerGameOver();
          return;
        }
      }

      if (pipe.x + PIPE_CFG.width < -40) {
        pipes.splice(i, 1);
      }
    }

    // Spawn new pipes only before Reina Hongo appears
    if (!queen.active) {
      const lastPipe = pipes[pipes.length - 1];
      if (lastPipe && lastPipe.x < WORLD.width - PIPE_CFG.spacing + 80) {
        spawnPipe(lastPipe.x + PIPE_CFG.spacing);
      }
    } else {
      // Reina Hongo glides in once pipes are clearing
      queen.x -= currentScrollSpeed * 0.55 * dt;
      queen.y = WORLD.height * 0.42 + Math.sin(animTime * 2.2) * 28;
      if (queen.x < WORLD.width * 0.72) {
        queen.x = Math.max(unicorn.x + 12, queen.x);
      }

      const distQueen = Math.hypot(unicorn.x - queen.x, unicorn.y - queen.y);
      if (distQueen < unicorn.radius + queen.radius) {
        triggerVictory();
      }
    }
  }

  // Drawing helpers
  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD.height - WORLD.groundHeight);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.45, '#4c1d95');
    grad.addColorStop(0.82, '#be185d');
    grad.addColorStop(1, '#fb923c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    for (const s of stars) {
      const alpha = 0.35 + 0.55 * Math.abs(Math.sin(animTime * 1.8 + s.twinkleOffset));
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of clouds) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.arc(24, -8, 22, 0, Math.PI * 2);
      ctx.arc(46, 2, 20, 0, Math.PI * 2);
      ctx.arc(-22, 4, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (speedLines.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const l of speedLines) {
        ctx.globalAlpha = Math.max(0, l.life * 2);
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.len, l.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPipeColumn(x, y, w, h, isTop) {
    if (h <= 0) return;

    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#7e22ce');
    grad.addColorStop(0.35, '#c084fc');
    grad.addColorStop(0.75, '#9333ea');
    grad.addColorStop(1, '#581c87');

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(x + 8, y, 8, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    const capH = 22;
    const capX = x - 5;
    const capW = w + 10;
    const capY = isTop ? y + h - capH : y;

    const capGrad = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    capGrad.addColorStop(0, '#ec4899');
    capGrad.addColorStop(0.5, '#fde047');
    capGrad.addColorStop(1, '#38bdf8');

    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.roundRect(capX, capY, capW, capH, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.stroke();
  }

  function drawPipes() {
    const groundY = WORLD.height - WORLD.groundHeight;
    for (const pipe of pipes) {
      drawPipeColumn(pipe.x, 0, PIPE_CFG.width, pipe.topHeight, true);
      const bottomY = pipe.topHeight + pipe.gap;
      drawPipeColumn(pipe.x, bottomY, PIPE_CFG.width, groundY - bottomY, false);
    }
  }

  function drawMushrooms() {
    for (const m of mushrooms) {
      ctx.save();
      ctx.translate(m.x, m.y);

      // Soft magical aura
      ctx.fillStyle = m.variant === 'gold'
        ? 'rgba(253, 224, 71, 0.28)'
        : 'rgba(244, 114, 182, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.fill();

      // Stem
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.roundRect(-6, 1, 12, 13, 5);
      ctx.fill();

      // Cap
      ctx.fillStyle = m.variant === 'gold' ? '#facc15' : '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 2, 14, Math.PI, 0);
      ctx.closePath();
      ctx.fill();

      // Spots
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-5, -4, 3, 0, Math.PI * 2);
      ctx.arc(4, -6, 2.5, 0, Math.PI * 2);
      ctx.arc(7, -1, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawQueen() {
    if (!queen.active) return;

    ctx.save();
    ctx.translate(queen.x, queen.y);

    // Royal golden aura
    const aura = ctx.createRadialGradient(0, 0, 10, 0, 0, 68);
    aura.addColorStop(0, 'rgba(253, 224, 71, 0.55)');
    aura.addColorStop(0.6, 'rgba(244, 114, 182, 0.25)');
    aura.addColorStop(1, 'rgba(244, 114, 182, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.fill();

    // Floating cloud throne
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(-20, 34, 16, 0, Math.PI * 2);
    ctx.arc(0, 36, 20, 0, Math.PI * 2);
    ctx.arc(20, 34, 16, 0, Math.PI * 2);
    ctx.fill();

    // Queen stem / dress
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.roundRect(-18, -2, 36, 36, 14);
    ctx.fill();

    // Queen royal cap
    const capGrad = ctx.createLinearGradient(-34, -36, 34, 6);
    capGrad.addColorStop(0, '#db2777');
    capGrad.addColorStop(0.5, '#9333ea');
    capGrad.addColorStop(1, '#ec4899');
    ctx.fillStyle = capGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 36, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Cap spots
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(-16, -13, 5.5, 0, Math.PI * 2);
    ctx.arc(15, -15, 5, 0, Math.PI * 2);
    ctx.arc(0, -23, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Golden crown
    ctx.fillStyle = '#fde047';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-16, -34);
    ctx.lineTo(-18, -50);
    ctx.lineTo(-7, -40);
    ctx.lineTo(0, -54);
    ctx.lineTo(7, -40);
    ctx.lineTo(18, -50);
    ctx.lineTo(16, -34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cute royal face
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(-8, 12, 3, 0, Math.PI * 2);
    ctx.arc(8, 12, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 15, 6, 0.15, Math.PI - 0.15);
    ctx.stroke();

    ctx.restore();
  }

  function drawGround() {
    const groundY = WORLD.height - WORLD.groundHeight;

    const topGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 18);
    topGrad.addColorStop(0, '#f472b6');
    topGrad.addColorStop(1, '#9333ea');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, groundY, WORLD.width, 18);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, groundY, WORLD.width, 18);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let x = -48; x < WORLD.width + 48; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x - groundOffset, groundY + 18);
      ctx.lineTo(x + 10 - groundOffset, groundY);
      ctx.lineTo(x + 20 - groundOffset, groundY);
      ctx.lineTo(x + 10 - groundOffset, groundY + 18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, groundY + 18, WORLD.width, WORLD.groundHeight - 18);
  }

  function drawGasPuffs() {
    for (const g of gasPuffs) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, (g.life / g.maxLife) * 0.72);
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawRainbowTrail() {
    if (unicorn.trail.length < 2) return;
    ctx.save();
    for (let c = 0; c < RAINBOW_COLORS.length; c++) {
      ctx.strokeStyle = RAINBOW_COLORS[c];
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = speedMultiplier > 1.15 ? 0.8 : 0.45;
      ctx.beginPath();
      const offset = (c - 2.5) * 3;
      for (let i = 0; i < unicorn.trail.length; i++) {
        const pt = unicorn.trail[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y + offset);
        else ctx.lineTo(pt.x, pt.y + offset);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWing(flapAngle, isBackWing) {
    ctx.save();
    ctx.translate(isBackWing ? 2 : -4, isBackWing ? -5 : -2);
    ctx.rotate(flapAngle);

    ctx.fillStyle = isBackWing ? 'rgba(226, 232, 240, 0.85)' : '#ffffff';
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.6;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-18, -22, -30, -14, -24, 2);
    ctx.bezierCurveTo(-20, 8, -12, 10, -4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!isBackWing) {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6, -2);
      ctx.lineTo(-19, -8);
      ctx.moveTo(-6, 2);
      ctx.lineTo(-17, 1);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawUnicorn() {
    ctx.save();
    ctx.translate(unicorn.x, unicorn.y);
    ctx.rotate(unicorn.rotation);

    const wingWave = Math.sin(unicorn.wingPhase);
    const frontWingAngle = wingWave * 0.72 - 0.15;
    const backWingAngle = wingWave * 0.62 - 0.35;

    drawWing(backWingAngle, true);

    const tailWave = Math.sin(animTime * 10) * 3;
    RAINBOW_COLORS.slice(0, 4).forEach((color, idx) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-16, 2 + idx * 1.5);
      ctx.quadraticCurveTo(-28, -2 + idx * 2 + tailWave, -34, 6 + idx * 2 + tailWave);
      ctx.stroke();
    });

    const bodyGrad = ctx.createLinearGradient(-16, -12, 18, 16);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(1, '#f3e8ff');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#d8b4fe';
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.ellipse(-2, 3, 18, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.roundRect(-12, 12, 6, 6, 3);
    ctx.roundRect(4, 12, 6, 6, 3);
    ctx.fill();

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(12, -6, 12, 10, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fbcfe8';
    ctx.beginPath();
    ctx.ellipse(21, -4, 6.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, -14);
    ctx.lineTo(10, -23);
    ctx.lineTo(14, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    RAINBOW_COLORS.slice(0, 5).forEach((color, idx) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(3 - idx * 3.2, -13 + idx * 3.6, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    const hornGrad = ctx.createLinearGradient(12, -14, 24, -32);
    hornGrad.addColorStop(0, '#f59e0b');
    hornGrad.addColorStop(0.5, '#fde047');
    hornGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = hornGrad;
    ctx.beginPath();
    ctx.moveTo(13, -14);
    ctx.lineTo(25, -31);
    ctx.lineTo(19, -12);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(217, 119, 6, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(15, -17);
    ctx.lineTo(20, -16);
    ctx.moveTo(18, -22);
    ctx.lineTo(22, -21);
    ctx.stroke();

    if (state === STATES.GAMEOVER) {
      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(13, -10);
      ctx.lineTo(18, -5);
      ctx.moveTo(18, -10);
      ctx.lineTo(13, -5);
      ctx.stroke();
    } else if (unicorn.isBlinking) {
      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(13, -7);
      ctx.lineTo(19, -7);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(16, -7.5, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(17, -8.6, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
    ctx.beginPath();
    ctx.arc(15, -2, 3, 0, Math.PI * 2);
    ctx.fill();

    drawWing(frontWingAngle, false);

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        ctx.lineTo(Math.cos(angle) * p.size, Math.sin(angle) * p.size);
        ctx.lineTo(
          Math.cos(angle + Math.PI / 4) * (p.size * 0.4),
          Math.sin(angle + Math.PI / 4) * (p.size * 0.4)
        );
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFloatingTexts() {
    for (const f of floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  function render() {
    const scaleX = canvas.width / WORLD.width;
    const scaleY = canvas.height / WORLD.height;

    ctx.save();
    ctx.scale(scaleX, scaleY);

    if (screenShake > 0) {
      const dx = (Math.random() - 0.5) * screenShake;
      const dy = (Math.random() - 0.5) * screenShake;
      ctx.translate(dx, dy);
    }

    drawSky();
    drawPipes();
    drawMushrooms();
    drawQueen();
    drawRainbowTrail();
    drawGasPuffs();
    drawParticles();
    drawGround();
    drawUnicorn();
    drawFloatingTexts();

    ctx.restore();
  }

  function loop(now) {
    if (!lastFrameTime) lastFrameTime = now;
    const rawDt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    const dt = Math.min(0.05, Math.max(0, rawDt));

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // Event Listeners
  function handleActionInput(e) {
    if (e.target.closest('button')) return;
    if (e.type === 'pointerdown') {
      e.preventDefault();
    }
    flapAndAccelerate();
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (e.repeat) return;

      if (state === STATES.GAMEOVER || state === STATES.VICTORY) {
        if (performance.now() - gameOverAt > 350) {
          startGame();
          flapAndAccelerate();
        }
        return;
      }
      flapAndAccelerate();
    } else if (e.code === 'Enter' && (state === STATES.GAMEOVER || state === STATES.VICTORY)) {
      if (performance.now() - gameOverAt > 350) {
        startGame();
      }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === STATES.PLAYING || state === STATES.PAUSED) {
        togglePause();
      }
    } else if (e.code === 'KeyM') {
      sfx.toggleMute();
    } else if (e.code === 'KeyF') {
      toggleFullscreen();
    }
  });

  function toggleFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (!document.fullscreenElement) {
      (gameFrame.requestFullscreen ? gameFrame.requestFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  document.addEventListener('fullscreenchange', () => {
    const isFs = Boolean(document.fullscreenElement);
    fullscreenIcon.textContent = isFs ? '🗗' : '⛶';
    fullscreenBtn.setAttribute('aria-label', isFs ? 'Salir de pantalla completa' : 'Pantalla completa');
    resizeCanvas();
  });

  function exitApp() {
    sfx.stopMusic();
    state = STATES.START;
    hudCenter.hidden = true;
    speedBadge.hidden = true;
    pauseBtn.hidden = true;
    queenBanner.hidden = true;
    startOverlay.hidden = true;
    pauseOverlay.hidden = true;
    gameOverOverlay.hidden = true;
    victoryOverlay.hidden = true;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    // Works in installed PWAs, TWAs, popups, and WebViews; normal browser tabs fall back to exitOverlay
    window.close();
    exitOverlay.hidden = false;
  }

  function returnToStart() {
    exitOverlay.hidden = true;
    resetGame();
    state = STATES.START;
    startOverlay.hidden = false;
  }

  canvas.addEventListener('pointerdown', handleActionInput);

  startBtn.addEventListener('click', () => {
    startGame();
    flapAndAccelerate();
  });

  restartBtn.addEventListener('click', () => {
    startGame();
    flapAndAccelerate();
  });

  victoryRestartBtn.addEventListener('click', () => {
    startGame();
    flapAndAccelerate();
  });

  resumeBtn.addEventListener('click', togglePause);
  restartFromPauseBtn.addEventListener('click', () => {
    startGame();
    flapAndAccelerate();
  });

  pauseBtn.addEventListener('click', togglePause);
  soundBtn.addEventListener('click', () => sfx.toggleMute());
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  exitBtn.addEventListener('click', exitApp);
  returnToGameBtn.addEventListener('click', returnToStart);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === STATES.PLAYING) {
      togglePause();
    }
  });

  window.addEventListener('resize', resizeCanvas);

  // Register Service Worker for offline PWA & fullscreen installability
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // Initialize
  startBestScoreEl.textContent = String(bestScore);
  initBackdrop();
  resizeCanvas();
  resetGame();
  requestAnimationFrame(loop);
})();
