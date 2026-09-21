/* ============================================================
   🍪 쿠키런 - 웹 게임
   바닐라 JS + Canvas 로 만든 엔드리스 러너
   ============================================================ */
(() => {
  'use strict';

  /* ============================================================
     1. 상수 & 유틸
     ============================================================ */
  /* 화면 레이아웃 (가로/세로) — 방향에 따라 월드 크기와 지면 위치가 바뀐다 */
  const LAYOUTS = {
    landscape: { W: 960, ground: 442, playerX: 190, speed: 1 },
    portrait:  { W: 520, ground: 0,   playerX: 118, speed: 0.58 },
  };

  let VIEW_W = 960;
  let VIEW_H = 540;
  let GROUND_Y = 442;
  let PLAYER_X = 190;
  let SPEED_SCALE = 1;

  const GRAVITY = 2900;
  const MAX_FALL = 1800;
  const BASE_SPEED = 370;
  const MAX_SPEED = 880;
  const SPEED_ACCEL = 11;

  // 속도(난이도) 프리셋 — 배속 하나로 기본/최대 속도와 가속도가 함께 조절된다
  const SPEED_PRESETS = [
    { id: 'turtle', name: '아주 느긋', emo: '🐢', mul: 0.7 },
    { id: 'easy', name: '느긋', emo: '🚶', mul: 0.85 },
    { id: 'normal', name: '보통', emo: '🍪', mul: 1.0 },
    { id: 'fast', name: '빠름', emo: '⚡', mul: 1.3 },
    { id: 'insane', name: '미친 속도', emo: '🔥', mul: 1.6 },
  ];
  const SPEED_MIN = 0.4;
  const SPEED_MAX = 2.0;
  const SPEED_STEP = 0.05;

  const fmtMul = (v) => '×' + (Math.round(v * 100) / 100).toLocaleString('ko-KR');

  const JUMP_V = -1060;
  const JUMP_V2 = -920;
  const JUMP_CUT = 0.42;
  const SLIDE_TIME = 0.62;

  const METER = 40;            // 40px = 1m
  const HIT_DAMAGE = 25;
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lerp = (a, b, t) => a + (b - a) * t;

  /** 둥근 사각형 경로 */
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function ellipse(c, x, y, rx, ry) {
    c.beginPath();
    c.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, TAU);
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ============================================================
     2. DOM
     ============================================================ */
  const $ = (sel) => document.querySelector(sel);

  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const wrap = $('#game-wrap');
  const el = {
    hud: $('#hud'),
    score: $('#hudScore'),
    dist: $('#hudDist'),
    speed: $('#hudSpeed'),
    speedMul: $('#hudSpeedMul'),
    speedList: $('#speedList'),
    speedValue: $('#speedValue'),
    energyFill: $('#energyFill'),
    combo: $('#comboBadge'),
    comboNum: $('#comboNum'),
    chipMagnet: $('#chip-magnet'),
    chipStar: $('#chip-star'),
    chipMagnetBar: $('#chip-magnet i'),
    chipStarBar: $('#chip-star i'),
    menu: $('#screen-menu'),
    pause: $('#screen-pause'),
    over: $('#screen-over'),
    cookieList: $('#cookieList'),
    menuBest: $('#menuBest'),
    overScore: $('#overScore'),
    overDist: $('#overDist'),
    overJelly: $('#overJelly'),
    overBest: $('#overBest'),
    newRecord: $('#newRecord'),
    overTitle: $('#overTitle'),
    soundBtn: $('#btn-sound'),
  };

  /* ============================================================
     3. 사운드 (WebAudio 간단 신디)
     ============================================================ */
  const Sound = {
    ctx: null,
    master: null,
    muted: false,

    init() {
      if (this.ctx || this.failed) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.failed = true; return; }
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.failed = true;   // 오디오를 못 쓰는 환경이면 조용히 넘어간다
      }
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
    },

    tone(freq, dur, type = 'sine', vol = 0.16, slideTo = null) {
      if (this.muted) return;
      this.resume();
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },

    noise(dur = 0.2, vol = 0.18) {
      if (this.muted) return;
      this.resume();
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(this.master);
      src.start(t0);
    },

    jump() { this.tone(520, 0.16, 'square', 0.1, 900); },
    doubleJump() { this.tone(700, 0.18, 'square', 0.1, 1250); },
    slide() { this.noise(0.16, 0.1); },
    collect(combo) {
      const step = Math.min(combo, 14);
      this.tone(660 * Math.pow(1.0595, step * 1.6), 0.14, 'triangle', 0.13);
    },
    power() {
      this.tone(520, 0.1, 'triangle', 0.14);
      setTimeout(() => this.tone(780, 0.1, 'triangle', 0.14), 90);
      setTimeout(() => this.tone(1040, 0.18, 'triangle', 0.14), 180);
    },
    hit() {
      this.tone(220, 0.28, 'sawtooth', 0.16, 70);
      this.noise(0.22, 0.14);
    },
    over() {
      [520, 420, 330, 240].forEach((f, i) => setTimeout(() => this.tone(f, 0.24, 'triangle', 0.15), i * 130));
    },
  };

  const LS = {
    get(key, def) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    },
  };

  const KEY_BEST = 'cookierun.best';
  const KEY_COOKIE = 'cookierun.cookie';
  const KEY_MUTE = 'cookierun.muted';
  const KEY_SPEED = 'cookierun.speed';

  /* ============================================================
     4. 쿠키 캐릭터
     ============================================================ */
  const COOKIES = [
    {
      id: 'ginger', name: '진저브레드', tag: '균형형',
      desc: '기본에 충실한 쿠키. 처음이라면 이 친구!',
      body: '#d99554', bodyDark: '#a9682f', icing: '#fff4e2', icingDark: '#ffd9a8',
      eye: '#4a2c14', accent: '#ff6b6b', hat: 'none',
      jumpMul: 1, speedMul: 1, energy: 100,
    },
    {
      id: 'cocoa', name: '코코아', tag: '점프형',
      desc: '점프력이 높아 높은 장애물에 강해요.',
      body: '#95603f', bodyDark: '#6b4229', icing: '#ffe7c9', icingDark: '#ffc98c',
      eye: '#2a1a10', accent: '#ffb703', hat: 'scarf',
      jumpMul: 1.12, speedMul: 0.97, energy: 100,
    },
    {
      id: 'mint', name: '민트초코', tag: '체력형',
      desc: '에너지가 1.5배! 실수해도 버틸 수 있어요.',
      body: '#8fd6b4', bodyDark: '#5fae8a', icing: '#f6fffb', icingDark: '#c9f2e2',
      eye: '#1e4d3a', accent: '#6c5ce7', hat: 'leaf',
      jumpMul: 0.96, speedMul: 1, energy: 150,
    },
  ];

  /* ============================================================
     5. 게임 상태
     ============================================================ */
  const game = {
    state: 'menu',       // menu | playing | paused | dying | gameover
    time: 0,
    distance: 0,
    speed: BASE_SPEED,
    score: 0,
    jellyCount: 0,
    best: LS.get(KEY_BEST, 0),
    cookie: COOKIES[0],
    hitStun: 0,
    shakeT: 0,
    shakeMag: 0,
    deathTimer: 0,
    overDelay: 0,
    scrollX: 0,
    worldTime: 0,
    combo: 0,
    comboTimer: 0,
    speedMul: 1,       // 속도 배속 (사용자 조절)
    layout: 'landscape',
  };

  const player = {
    x: PLAYER_X,
    y: GROUND_Y,
    vy: 0,
    onGround: true,
    jumps: 0,
    coyote: 0,
    jumpBuffer: 0,
    sliding: false,
    slideTimer: 0,
    runPhase: 0,
    invincible: 0,
    star: 0,
    magnet: 0,
    dead: false,
    rot: 0,
    rotV: 0,
    maxEnergy: 100,
    energy: 100,
    trail: [],
  };

  const input = { down: false };
  let obstacles = [];
  let jellies = [];
  let powerups = [];
  let particles = [];
  let floaters = [];
  let spawnCooldown = 700;
  let bgOffset = { cloud: 0, hill: 0, city: 0, prop: 0, ground: 0 };

  /* ============================================================
     6. 배경 요소
     ============================================================ */
  const clouds = [];
  const props = [];
  const CITY_W = 1680;
  const CITY_H = 360;
  const CITY_BASE = 320;          // 오프스크린 캔버스 안에서의 지면 높이
  const cityCanvas = document.createElement('canvas');
  const buildings = [];

  function buildBackground() {
    clouds.length = 0;
    const cloudCount = VIEW_W < 700 ? 12 : 9;
    for (let i = 0; i < cloudCount; i++) {
      clouds.push({
        x: rand(0, VIEW_W + 300),
        y: rand(VIEW_H * 0.04, VIEW_H * 0.5),
        s: rand(0.55, 1.5),
        a: rand(0.5, 0.95),
      });
    }

    props.length = 0;
    const propCount = VIEW_W < 700 ? 9 : 14;
    for (let i = 0; i < propCount; i++) {
      props.push({
        x: rand(0, VIEW_W + 200),
        type: pick(['grass', 'grass', 'flower', 'candy', 'pebble']),
        s: rand(0.7, 1.3),
      });
    }

    buildings.length = 0;
    let x = 0;
    while (x < CITY_W) {
      const w = rand(64, 132);
      buildings.push({
        x,
        w,
        h: rand(46, 138),
        color: pick(['#ffd8ec', '#ffe9b8', '#d9ecff', '#e8dcff', '#ffdcc9']),
        roof: pick(['flat', 'dome', 'tri']),
      });
      x += w + rand(10, 40);
    }

    // 도시는 한 번만 그려서 오프스크린 캔버스에 저장 (성능)
    cityCanvas.width = CITY_W;
    cityCanvas.height = CITY_H;
    const c = cityCanvas.getContext('2d');
    c.globalAlpha = 0.92;
    for (const b of buildings) {
      const y = CITY_BASE - 52 - b.h;
      const grad = c.createLinearGradient(0, y, 0, CITY_BASE + 8);
      grad.addColorStop(0, b.color);
      grad.addColorStop(1, shade(b.color, -0.12));
      c.fillStyle = grad;
      rr(c, b.x, y, b.w, b.h + 60, 12);
      c.fill();
      // 창문
      c.fillStyle = 'rgba(255,255,255,0.6)';
      for (let wy = y + 18; wy < CITY_BASE - 14; wy += 32) {
        for (let wx = b.x + 14; wx < b.x + b.w - 18; wx += 28) {
          rr(c, wx, wy, 12, 15, 4);
          c.fill();
        }
      }
      // 지붕
      c.fillStyle = '#ff9fc0';
      if (b.roof === 'dome') {
        c.beginPath();
        c.ellipse(b.x + b.w / 2, y, b.w * 0.55, 26, 0, Math.PI, TAU);
        c.fill();
      } else if (b.roof === 'tri') {
        c.beginPath();
        c.moveTo(b.x - 6, y + 4);
        c.lineTo(b.x + b.w / 2, y - 34);
        c.lineTo(b.x + b.w + 6, y + 4);
        c.closePath();
        c.fill();
      } else {
        rr(c, b.x - 5, y - 12, b.w + 10, 16, 7);
        c.fill();
      }
    }
  }

  /** 색 밝기 조절 */
  function shade(hex, amt) {
    let [r, g, b] = hexToRgb(hex);
    const f = (v) => Math.round(clamp(v + 255 * amt, 0, 255));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  /* ============================================================
     7. 장애물 / 젤리 / 파워업 정의
     ============================================================ */
  const OB = {
    spike: { w: 42, h: 48, kind: 'spike' },
    spike2: { w: 42, h: 48, kind: 'spike' },
    box: { w: 58, h: 64, kind: 'box' },
    tallBox: { w: 62, h: 100, kind: 'box', tall: true },
    longBox: { w: 96, h: 56, kind: 'box' },
    lowBar: { w: 146, h: 190, kind: 'bar' },
    flyer: { w: 66, h: 38, kind: 'flyer' },
  };

  function addObstacle(type, x) {
    const def = OB[type];
    let y;
    if (def.kind === 'bar') y = GROUND_Y - 58 - def.h;          // 바닥에서 58px 위에 매달림
    else if (def.kind === 'flyer') y = GROUND_Y - 150 - def.h / 2;
    else y = GROUND_Y - def.h;

    obstacles.push({
      type,
      kind: def.kind,
      x,
      y,
      baseY: y,
      w: def.w,
      h: def.h,
      tall: !!def.tall,
      phase: rand(0, TAU),
      bob: def.kind === 'flyer' ? rand(10, 20) : 0,
      dead: false,
      hitPlayer: false,
    });
    return def;
  }

  function addJelly(x, y, big = false) {
    jellies.push({ x, y, r: big ? 20 : 13, big, phase: rand(0, TAU), got: false });
  }

  /** 지면 위 일직선 젤리 */
  function jellyLine(x, y, n, gap = 46) {
    for (let i = 0; i < n; i++) addJelly(x + i * gap, y);
  }

  /** 포물선 모양 젤리 (장애물 위) */
  function jellyArc(x, peakY, n = 5, span = 210) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = GROUND_Y - 60 - Math.sin(t * Math.PI) * (GROUND_Y - 60 - peakY);
      addJelly(x + t * span, y);
    }
  }

  function addPowerup(x, type) {
    powerups.push({ x, y: GROUND_Y - rand(70, 150), type, phase: rand(0, TAU), got: false });
  }

  function difficulty() {
    return clamp(game.distance / 28000, 0, 1);
  }

  /** 패턴 하나를 스폰하고 "차지하는 폭"을 반환 */
  function spawnPattern() {
    const d = difficulty();
    const x = VIEW_W + 70;
    let width = 90;

    // 가끔 파워업
    if (Math.random() < 0.055) addPowerup(x + rand(0, 120), pick(['potion', 'magnet', 'star']));

    const patterns = [];

    // --- 항상 가능한 기본 패턴들 ---
    patterns.push(
      () => { // 단일 낮은 장애물
        const t = pick(['spike', 'box']);
        const def = addObstacle(t, x);
        if (Math.random() < 0.55) jellyArc(x - 60, GROUND_Y - 140 - def.h);
        return def.w;
      },
      () => { // 긴 상자 + 그 위 젤리
        const def = addObstacle('longBox', x);
        jellyLine(x - 40, GROUND_Y - 150, 4, 44);
        return def.w;
      },
      () => { // 스파이크 두 개 (한 번에 점프)
        addObstacle('spike', x);
        addObstacle('spike', x + 46);
        if (Math.random() < 0.5) addJelly(x + 23, GROUND_Y - 175, true);
        return 88;
      },
    );

    if (d > 0.08) {
      patterns.push(
        () => { // 낮은 천장 → 슬라이드
          const def = addObstacle('lowBar', x);
          jellyLine(x + 10, GROUND_Y - 26, 3, 44);
          return def.w;
        },
        () => { // 날아다니는 장애물 (점프 금지 구간)
          const def = addObstacle('flyer', x);
          jellyLine(x - 20, GROUND_Y - 34, 4, 46);
          return def.w;
        },
      );
    }

    if (d > 0.22) {
      patterns.push(
        () => { // 높은 상자
          const def = addObstacle('tallBox', x);
          jellyLine(x - 30, GROUND_Y - 168, 3, 44);
          return def.w;
        },
        () => { // 스파이크 3연타 (리듬 점프)
          const n = 3, gap = 200;
          for (let i = 0; i < n; i++) addObstacle('spike', x + i * gap);
          jellyLine(x + 70, GROUND_Y - 150, 2, 46);
          return n * gap;
        },
        () => { // 상자 → 스파이크
          addObstacle('box', x);
          addObstacle('spike', x + 300);
          return 342;
        },
      );
    }

    if (d > 0.42) {
      patterns.push(
        () => { // 스파이크 → 낮은 천장 (점프 후 슬라이드)
          const barX = x + Math.max(520, game.speed * 1.5);
          addObstacle('spike', x);
          addObstacle('lowBar', barX);
          jellyLine(x + 250, GROUND_Y - 150, 2, 46);
          return barX - x + OB.lowBar.w;
        },
        () => { // 날아다니는 장애물 + 스파이크
          addObstacle('flyer', x);
          addObstacle('spike', x + 330);
          return 372;
        },
        () => { // 긴 상자 → 높은 상자
          addObstacle('longBox', x);
          addObstacle('tallBox', x + 330);
          return 392;
        },
      );
    }

    if (d > 0.65) {
      patterns.push(
        () => { // 천장 → 스파이크 → 천장
          const spikeX = x + Math.max(300, game.speed * 0.62);
          const bar2X = spikeX + Math.max(520, game.speed * 1.5);
          addObstacle('lowBar', x);
          addObstacle('spike', spikeX);
          addObstacle('lowBar', bar2X);
          return bar2X - x + OB.lowBar.w;
        },
        () => { // 스파이크 4연타
          const n = 4, gap = 190;
          for (let i = 0; i < n; i++) addObstacle('spike', x + i * gap);
          return n * gap;
        },
        () => { // 상자 3연속 계단
          addObstacle('box', x);
          addObstacle('tallBox', x + 230);
          addObstacle('box', x + 480);
          jellyArc(x + 60, GROUND_Y - 210, 5, 420);
          return 540;
        },
      );
    }

    const build = pick(patterns);
    width = build();

    // 다음 스폰까지의 간격 (속도에 비례 → 체감 난이도 일정)
    // 최소 간격은 "점프 한 번(0.73초) + 반응 시간"보다 넉넉하게 잡는다.
    const gap = clamp(game.speed * rand(1.0, 1.6), 340, 1500) - d * 40;
    spawnCooldown = width + gap;
    return width;
  }

  /* ============================================================
     8. 파티클 / 텍스트
     ============================================================ */
  function spawnParticles(x, y, n, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = opt.angle !== undefined ? opt.angle + rand(-0.9, 0.9) : rand(0, TAU);
      const sp = rand(opt.speedMin || 40, opt.speedMax || 240);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opt.lift || 0),
        life: 0,
        max: rand(0.35, opt.long || 0.8),
        size: rand(opt.sizeMin || 2.5, opt.sizeMax || 6.5),
        color: opt.color || '#ffe27a',
        g: opt.g === undefined ? 400 : opt.g,
        shape: opt.shape || 'circle',
        spin: rand(-8, 8),
        rot: rand(0, TAU),
      });
    }
  }

  function addFloater(x, y, text, color = '#fff', size = 22) {
    floaters.push({ x, y, text, color, size, life: 0, max: 0.9, vy: -80 });
  }

  /* ============================================================
     9. 게임 흐름
     ============================================================ */
  function resetRun() {
    obstacles = [];
    jellies = [];
    powerups = [];
    particles = [];
    floaters = [];

    game.time = 0;
    game.distance = 0;
    game.speed = BASE_SPEED * game.speedMul * SPEED_SCALE;
    game.score = 0;
    game.jellyCount = 0;
    game.hitStun = 0;
    game.shakeT = 0;
    game.deathTimer = 0;
    game.overDelay = 0;
    game.combo = 0;
    game.comboTimer = 0;

    const c = game.cookie;
    player.x = PLAYER_X;
    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
    player.jumps = 0;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.sliding = false;
    player.slideTimer = 0;
    player.runPhase = 0;
    player.invincible = 0;
    player.star = 0;
    player.magnet = 0;
    player.dead = false;
    player.rot = 0;
    player.rotV = 0;
    player.trail = [];
    player.maxEnergy = c.energy;
    player.energy = c.energy;

    spawnCooldown = 620;
    input.down = false;
    syncHUD(true);
  }

  function startGame() {
    Sound.resume();
    game.cookie = COOKIES.find((c) => c.id === LS.get(KEY_COOKIE, 'ginger')) || COOKIES[0];
    resetRun();
    game.state = 'playing';
    el.menu.classList.add('hidden');
    el.pause.classList.add('hidden');
    el.over.classList.add('hidden');
    el.hud.classList.remove('hidden');
  }

  function pauseGame() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    el.pause.classList.remove('hidden');
  }

  function resumeGame() {
    if (game.state !== 'paused') return;
    game.state = 'playing';
    el.pause.classList.add('hidden');
    Sound.resume();
  }

  function backToMenu() {
    game.state = 'menu';
    resetRun();
    updateSpeedChips();
    el.pause.classList.add('hidden');
    el.over.classList.add('hidden');
    el.hud.classList.add('hidden');
    el.menu.classList.remove('hidden');
    el.menuBest.textContent = game.best.toLocaleString('ko-KR');
    updateCookieCards();
  }

  function killPlayer() {
    if (player.dead) return;
    player.dead = true;
    player.sliding = false;
    player.vy = -620;
    player.rotV = rand(6, 10) * (Math.random() < 0.5 ? -1 : 1);
    game.state = 'dying';
    game.deathTimer = 0;
    game.shakeT = 0.5;
    game.shakeMag = 16;
    Sound.over();
    spawnParticles(player.x, player.y - 40, 26, {
      color: '#e0b184', speedMin: 80, speedMax: 420, lift: 150, g: 1200, sizeMax: 8, long: 1.2,
    });
  }

  function finishGame() {
    game.state = 'gameover';
    const score = Math.floor(game.score);
    const isRecord = score > game.best;
    if (isRecord) {
      game.best = score;
      LS.set(KEY_BEST, score);
    }
    el.overScore.textContent = score.toLocaleString('ko-KR');
    el.overDist.textContent = Math.floor(game.distance / METER).toLocaleString('ko-KR') + ' m';
    el.overJelly.textContent = game.jellyCount.toLocaleString('ko-KR');
    el.overBest.textContent = game.best.toLocaleString('ko-KR');
    el.newRecord.classList.toggle('hidden', !isRecord);
    el.overTitle.textContent = isRecord ? '신기록 달성! 🏆' : '쿠키가 지쳤어요!';
    el.over.classList.remove('hidden');
    el.menuBest.textContent = game.best.toLocaleString('ko-KR');
    game.overDelay = 0.7;
  }

  /* ============================================================
     10. 조작
     ============================================================ */
  function doJump() {
    const p = player;
    if (p.dead) return;
    const canGround = p.onGround || p.coyote > 0;
    if (canGround && p.jumps === 0) {
      p.jumps = 1;
      p.vy = JUMP_V * game.cookie.jumpMul;
      p.onGround = false;
      p.coyote = 0;
      p.sliding = false;
      p.slideTimer = 0;
      Sound.jump();
      spawnParticles(p.x, p.y, 8, { color: '#ffffff', angle: -Math.PI / 2, speedMin: 40, speedMax: 150, g: 300, sizeMax: 5 });
    } else if (p.jumps < 2) {
      p.jumps = 2;
      p.vy = JUMP_V2 * game.cookie.jumpMul;
      Sound.doubleJump();
      spawnParticles(p.x, p.y - 30, 12, { color: '#bfe9ff', speedMin: 60, speedMax: 200, g: 200, sizeMax: 6 });
    }
  }

  function requestJump() {
    if (game.state === 'playing') {
      player.jumpBuffer = 0.13;
    } else if (game.state === 'menu') {
      startGame();
    } else if (game.state === 'gameover' && game.overDelay <= 0) {
      startGame();
    } else if (game.state === 'paused') {
      resumeGame();
    }
  }

  function startSlide() {
    if (game.state !== 'playing' || player.dead) return;
    const p = player;
    if (p.onGround) {
      if (!p.sliding) {
        p.sliding = true;
        Sound.slide();
        spawnParticles(p.x - 20, p.y - 4, 8, { color: '#d8c2a4', angle: Math.PI, speedMin: 60, speedMax: 190, g: 120, sizeMax: 5 });
      }
      p.slideTimer = SLIDE_TIME;
    } else {
      p.vy = Math.max(p.vy, 300) + 900; // 공중에서 ↓ = 급강하
    }
  }

  function endSlide() {
    const p = player;
    if (p.sliding && !input.down) {
      if (canStand()) {
        p.sliding = false;
        p.slideTimer = 0;
      } else {
        p.slideTimer = 0.1;
      }
    }
  }

  /** 슬라이드 중 일어나도 되는지 (천장 확인) */
  function canStand() {
    const box = { x: player.x - 24, y: player.y - 80, w: 48, h: 78 };
    for (const o of obstacles) {
      if (o.dead) continue;
      if (rectsOverlap(box, o)) return false;
    }
    return true;
  }

  // 키보드
  window.addEventListener('keydown', (e) => {
    if (e.repeat) {
      if (['ArrowDown', 'KeyS', 'Space', 'ArrowUp', 'KeyW'].includes(e.code)) e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
        e.preventDefault();
        requestJump();
        break;
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        input.down = true;
        startSlide();
        break;
      case 'KeyP':
      case 'Escape':
        e.preventDefault();
        if (game.state === 'playing') pauseGame();
        else if (game.state === 'paused') resumeGame();
        break;
      case 'KeyM':
        toggleMute();
        break;
      case 'Minus':
      case 'NumpadSubtract':
      case 'BracketLeft':
        e.preventDefault();
        changeSpeed(-SPEED_STEP);
        break;
      case 'Equal':
      case 'NumpadAdd':
      case 'BracketRight':
        e.preventDefault();
        changeSpeed(SPEED_STEP);
        break;
      case 'Enter':
        if (game.state === 'menu' || (game.state === 'gameover' && game.overDelay <= 0)) requestJump();
        break;
      default:
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      // 키를 떼면 점프 높이 제한
      if (player.vy < 0) player.vy *= JUMP_CUT;
      player.jumpBuffer = 0;
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      input.down = false;
      endSlide();
    }
  });

  // 캔버스 터치/클릭 = 점프
  let pointerStart = null;
  canvas.addEventListener('pointerdown', (e) => {
    pointerStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (game.state === 'playing') {
      requestJump();
    } else if (game.state === 'menu' || game.state === 'gameover') {
      // 메뉴/결과 화면은 버튼으로 조작 (실수 방지)
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointerStart || game.state !== 'playing') return;
    const dy = e.clientY - pointerStart.y;
    if (dy > 42 && Math.abs(e.clientY - pointerStart.y) > Math.abs(e.clientX - pointerStart.x)) {
      input.down = true;
      startSlide();
      pointerStart = null;
    }
  });

  canvas.addEventListener('pointerup', () => {
    if (input.down) {
      input.down = false;
      endSlide();
    }
    pointerStart = null;
  });
  canvas.addEventListener('pointercancel', () => {
    input.down = false;
    endSlide();
    pointerStart = null;
  });

  // 모바일 버튼
  const bindHold = (node, onDown, onUp) => {
    node.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
    node.addEventListener('pointerup', (e) => { e.preventDefault(); onUp && onUp(); });
    node.addEventListener('pointercancel', () => { onUp && onUp(); });
    node.addEventListener('pointerleave', () => { onUp && onUp(); });
  };
  bindHold($('#btn-jump'), () => requestJump());
  bindHold($('#btn-slide'), () => { input.down = true; startSlide(); }, () => { input.down = false; endSlide(); });

  // 모바일 롱프레스로 인한 텍스트 선택 / 복사 / 드래그 메뉴 차단
  ['contextmenu', 'selectstart', 'dragstart', 'gesturestart'].forEach((type) => {
    wrap.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  });

  /* ============================================================
     11. 업데이트
     ============================================================ */
  function update(dt) {
    game.worldTime += dt;

    const playing = game.state === 'playing';
    const dying = game.state === 'dying';

    /* --- 월드 스크롤 --- */
    let scroll = 0;
    if (playing) {
      game.time += dt;
      const mul = game.speedMul * SPEED_SCALE;
      game.speed = Math.min(MAX_SPEED * mul, (BASE_SPEED + game.time * SPEED_ACCEL) * mul);
      scroll = game.speed * dt * (game.hitStun > 0 ? 0.6 : 1);
      game.distance += scroll;
      game.score += scroll / 60;   // 달린 거리만큼 점수
    } else if (dying) {
      game.deathTimer += dt;
      game.speed = Math.max(0, game.speed - 900 * dt);
      scroll = game.speed * dt;
      if (game.deathTimer > 1.05 && game.state === 'dying') finishGame();
    } else if (game.state === 'menu') {
      scroll = 210 * dt;
    } else if (game.state === 'gameover') {
      game.overDelay = Math.max(0, game.overDelay - dt);
      scroll = 0;
    }

    game.scrollX += scroll;
    bgOffset.cloud += scroll * 0.14;
    bgOffset.hill += scroll * 0.28;
    bgOffset.city += scroll * 0.46;
    bgOffset.prop += scroll * 1.0;
    bgOffset.ground += scroll;

    /* --- 플레이어 --- */
    updatePlayer(dt, playing || dying);

    /* --- 스폰 --- */
    if (playing) {
      spawnCooldown -= scroll;
      if (spawnCooldown <= 0) spawnPattern();
    }

    /* --- 장애물 --- */
    for (const o of obstacles) {
      o.x -= scroll;
      if (o.bob) o.y = o.baseY + Math.sin(game.worldTime * 6 + o.phase) * o.bob;
    }

    /* --- 젤리 & 파워업 --- */
    const magnetOn = player.magnet > 0 && playing;
    for (const j of jellies) {
      j.x -= scroll;
      j.phase += dt * 5;
      if (j.got) continue;

      if (magnetOn) {
        const dx = player.x - j.x;
        const dy = player.y - 44 - j.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 260 && dist > 1) {
          const pull = 900 * dt * (1 - dist / 300);
          j.x += (dx / dist) * pull;
          j.y += (dy / dist) * pull;
        }
      }

      const box = playerBox();
      const jb = { x: j.x - j.r, y: j.y - j.r, w: j.r * 2, h: j.r * 2 };
      if (rectsOverlap(box, jb)) collectJelly(j);
    }
    for (const p of powerups) {
      p.x -= scroll;
      p.phase += dt * 4;
    }

    /* --- 충돌 --- */
    if (playing) {
      const box = playerBox();
      for (const o of obstacles) {
        if (o.dead) continue;
        const ob = { x: o.x + 5, y: o.y + 5, w: o.w - 10, h: o.h - 10 };
        if (rectsOverlap(box, ob)) {
          if (player.star > 0) {
            o.dead = true;
            game.score += 5;
            Sound.tone(880, 0.12, 'square', 0.12, 1400);
            spawnParticles(o.x + o.w / 2, o.y + o.h / 2, 16, {
              color: '#ffd76e', speedMin: 90, speedMax: 320, g: 600, sizeMax: 7, shape: 'star',
            });
            addFloater(o.x + o.w / 2, o.y, '+5', '#ffd76e', 20);
          } else if (player.invincible <= 0) {
            hitObstacle(o);
          }
        }
      }

      // 젤리 먹기
      powerups.forEach((p) => {
        if (p.got) return;
        const pb = { x: p.x - 22, y: p.y - 22, w: 44, h: 44 };
        if (rectsOverlap(playerBox(), pb)) collectPowerup(p);
      });
    }

    /* --- 정리 --- */
    obstacles = obstacles.filter((o) => o.x + o.w > -80 && !o.dead);
    jellies = jellies.filter((j) => j.x + j.r > -60 && !j.got);
    powerups = powerups.filter((p) => p.x + 30 > -60 && !p.got);

    /* --- 타이머 --- */
    if (playing) {
      player.invincible = Math.max(0, player.invincible - dt);
      player.star = Math.max(0, player.star - dt);
      player.magnet = Math.max(0, player.magnet - dt);
      game.hitStun = Math.max(0, game.hitStun - dt);
      if (game.comboTimer > 0) {
        game.comboTimer -= dt;
        if (game.comboTimer <= 0) game.combo = 0;
      }
    }
    game.shakeT = Math.max(0, game.shakeT - dt);

    /* --- 이펙트 --- */
    for (const p of particles) {
      p.life += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.shape === 'star') p.rot += p.spin * dt;
    }
    particles = particles.filter((p) => p.life < p.max);

    for (const f of floaters) {
      f.life += dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
    }
    floaters = floaters.filter((f) => f.life < f.max);
  }

  function playerBox() {
    const p = player;
    if (p.sliding) {
      return { x: p.x - 30, y: p.y - 44, w: 58, h: 42 };
    }
    return { x: p.x - 22, y: p.y - 78, w: 44, h: 76 };
  }

  function updatePlayer(dt, active) {
    const p = player;

    if (p.dead) {
      p.rot += p.rotV * dt;
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y > GROUND_Y + 120) { p.y = GROUND_Y + 120; p.vy = 0; p.rotV *= 0.4; }
      return;
    }

    // 점프 버퍼
    if (p.jumpBuffer > 0) {
      p.jumpBuffer -= dt;
      if (p.onGround || p.coyote > 0) {
        p.jumpBuffer = 0;
        doJump();
      } else if (p.jumps < 2) {
        // 공중 점프는 살짝 늦게 눌러도 반응
        p.jumpBuffer = 0;
        doJump();
      }
    }

    if (!active) {
      p.runPhase += dt * 12;
      return;
    }

    // 슬라이드 유지
    if (p.sliding) {
      p.slideTimer -= dt;
      if (!input.down && p.slideTimer <= 0) endSlide();
      if (p.sliding && !p.onGround) p.sliding = false; // 공중이면 해제
    }

    // 중력
    p.vy += GRAVITY * dt;
    if (p.vy > MAX_FALL) p.vy = MAX_FALL;
    p.y += p.vy * dt;

    if (p.y >= GROUND_Y) {
      if (!p.onGround) {
        // 착지
        const impact = clamp(p.vy / 1400, 0, 1);
        spawnParticles(p.x, GROUND_Y, 6 + Math.floor(impact * 8), {
          color: '#e8d5b7', angle: -Math.PI / 2, speedMin: 40, speedMax: 120 + impact * 200,
          g: 900, sizeMax: 5,
        });
        if (impact > 0.5) Sound.noise(0.1, 0.08);
        if (input.down) {
          p.sliding = true;
          p.slideTimer = SLIDE_TIME;
          Sound.slide();
        }
      }
      p.y = GROUND_Y;
      p.vy = 0;
      p.onGround = true;
      p.jumps = 0;
      p.coyote = 0.1;
    } else {
      p.onGround = false;
      p.coyote = Math.max(0, p.coyote - dt);
    }

    // 달리기 애니메이션
    const target = p.sliding ? 8 : p.onGround ? 15 : 6;
    p.runPhase += dt * target * (game.speed / BASE_SPEED);

    // 잔상 (무적/별)
    if (p.star > 0) {
      p.trail.push({ x: p.x, y: p.y, life: 0 });
    }
    for (const t of p.trail) t.life += dt;
    p.trail = p.trail.filter((t) => t.life < 0.35);
  }

  function collectJelly(j) {
    j.got = true;
    game.jellyCount++;
    game.combo = (game.combo || 0) + 1;
    game.comboTimer = 1.6;
    const mult = Math.min(5, 1 + Math.floor(game.combo / 10));
    const gain = (j.big ? 10 : 1) * mult;
    game.score += gain;
    Sound.collect(game.combo);
    spawnParticles(j.x, j.y, j.big ? 16 : 7, {
      color: j.big ? '#ffd0f0' : '#ffe27a', speedMin: 50, speedMax: j.big ? 280 : 180, g: 200,
      sizeMax: j.big ? 7 : 5, shape: 'star',
    });
    if (j.big) addFloater(j.x, j.y - 14, '+' + gain, '#ff8fd0', 24);
    else if (game.combo > 0 && game.combo % 10 === 0) addFloater(j.x, j.y - 14, 'COMBO x' + mult, '#ffd76e', 22);
  }

  function collectPowerup(p) {
    p.got = true;
    Sound.power();
    spawnParticles(p.x, p.y, 18, { color: '#ffffff', speedMin: 80, speedMax: 300, g: 260, sizeMax: 6, shape: 'star' });
    if (p.type === 'potion') {
      const before = player.energy;
      player.energy = Math.min(player.maxEnergy, player.energy + 30);
      addFloater(p.x, p.y - 16, '+' + Math.round(player.energy - before) + ' 에너지', '#5ce07f', 20);
    } else if (p.type === 'magnet') {
      player.magnet = 7;
      addFloater(p.x, p.y - 16, '자석!', '#ff5c8a', 22);
    } else {
      player.star = 4.5;
      addFloater(p.x, p.y - 16, '무적!', '#ffb703', 22);
    }
  }

  function hitObstacle(o) {
    player.energy -= HIT_DAMAGE;
    player.invincible = 1.5;
    player.jumpBuffer = 0;
    game.combo = 0;
    game.comboTimer = 0;
    game.hitStun = 0.35;
    game.shakeT = 0.4;
    game.shakeMag = 12;
    Sound.hit();
    spawnParticles(player.x + 10, player.y - 40, 18, {
      color: '#ff8080', speedMin: 90, speedMax: 330, g: 700, sizeMax: 7,
    });
    // 살짝 뒤로 밀림
    obstacles.forEach((ob) => { if (ob.x > player.x) ob.x += 14; });

    if (player.energy <= 0) {
      player.energy = 0;
      killPlayer();
    }
    syncHUD(true);
  }

  /* ============================================================
     12. 렌더링
     ============================================================ */
  function render(dt) {
    // 팔레트 (시간에 따라 아침 → 노을)
    const phase = clamp(game.time / 200, 0, 1);
    const skyTop = mixColor('#8ed6ff', '#ff9e6d', phase * 0.75);
    const skyBot = mixColor('#dff3ff', '#ffe0b0', phase * 0.75);

    ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    // 화면 흔들림
    if (game.shakeT > 0) {
      const m = game.shakeMag * (game.shakeT / 0.5);
      ctx.translate(rand(-m, m), rand(-m, m));
    }

    drawSky(skyTop, skyBot, phase);
    drawClouds();
    drawHills();
    drawCity();
    drawGround();

    drawJellies();
    drawPowerups();
    drawObstacles();
    if (game.state === 'menu' || player.trail.length) drawTrails();
    drawPlayer();
    drawParticles();
    drawFloaters();

    // 피격 / 무적 비네트
    if (player.invincible > 0 && game.state === 'playing') {
      ctx.fillStyle = `rgba(255,80,80,${0.13 * (player.invincible / 1.5)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (player.star > 0) {
      ctx.fillStyle = `rgba(255,200,80,${0.08 + Math.sin(game.worldTime * 12) * 0.03})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (game.state === 'dying') {
      const a = clamp(game.deathTimer / 0.9, 0, 1) * 0.55;
      ctx.fillStyle = `rgba(40,10,40,${a})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    syncHUD(false);
  }

  function mixColor(a, b, t) {
    const pa = hexToRgb(a), pb = hexToRgb(b);
    return `rgb(${Math.round(lerp(pa[0], pb[0], t))},${Math.round(lerp(pa[1], pb[1], t))},${Math.round(lerp(pa[2], pb[2], t))})`;
  }
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function drawSky(top, bot, phase) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 40);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 해
    const sx = VIEW_W * 0.82, sy = VIEW_H * 0.1 - phase * 40;
    const sunG = ctx.createRadialGradient(sx, sy, 8, sx, sy, 120);
    sunG.addColorStop(0, 'rgba(255,246,200,1)');
    sunG.addColorStop(0.35, 'rgba(255,225,140,0.75)');
    sunG.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = sunG;
    ctx.beginPath();
    ctx.arc(sx, sy, 120, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff8d6';
    ctx.beginPath();
    ctx.arc(sx, sy, 30, 0, TAU);
    ctx.fill();
  }

  function drawClouds() {
    ctx.save();
    for (const c of clouds) {
      let x = (c.x - bgOffset.cloud * c.s) % (VIEW_W + 400);
      if (x < -200) x += VIEW_W + 400;
      ctx.globalAlpha = c.a;
      ctx.fillStyle = '#ffffff';
      const s = c.s;
      ellipse(ctx, x, c.y, 46 * s, 26 * s); ctx.fill();
      ellipse(ctx, x + 34 * s, c.y + 6 * s, 32 * s, 19 * s); ctx.fill();
      ellipse(ctx, x - 36 * s, c.y + 8 * s, 28 * s, 16 * s); ctx.fill();
    }
    ctx.restore();
  }

  function drawHills() {
    const off = bgOffset.hill;
    // 먼 산
    ctx.fillStyle = '#a9e6b0';
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    ctx.lineTo(0, GROUND_Y - 60);
    for (let x = 0; x <= VIEW_W; x += 10) {
      const y = GROUND_Y - 70 + Math.sin((x + off) / 190) * 34 + Math.sin((x + off) / 71) * 14;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();

    // 가까운 산
    ctx.fillStyle = '#7fd08a';
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H);
    ctx.lineTo(0, GROUND_Y - 20);
    for (let x = 0; x <= VIEW_W; x += 10) {
      const y = GROUND_Y - 34 + Math.sin((x + off * 1.7) / 130 + 2) * 22 + Math.sin((x + off * 1.7) / 53) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }

  function drawCity() {
    const off = bgOffset.city % CITY_W;
    const oy = GROUND_Y - CITY_BASE;
    ctx.drawImage(cityCanvas, -off, oy);
    ctx.drawImage(cityCanvas, -off + CITY_W, oy);
  }

  function drawGround() {
    // 흙
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
    g.addColorStop(0, '#c08a52');
    g.addColorStop(1, '#8a5c31');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y);

    // 잔디
    ctx.fillStyle = '#74c95c';
    ctx.fillRect(0, GROUND_Y - 12, VIEW_W, 16);
    ctx.fillStyle = '#5cb04a';
    ctx.fillRect(0, GROUND_Y + 4, VIEW_W, 6);

    // 바닥 타일 무늬
    const tile = 64;
    const off = bgOffset.ground % tile;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
    for (let x = -off - tile; x < VIEW_W + tile; x += tile) {
      rr(ctx, x, GROUND_Y + 16, tile * 0.62, 12, 6);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let x = -off - tile * 2; x < VIEW_W + tile * 2; x += tile) {
      ctx.beginPath();
      ctx.arc(x + 20, GROUND_Y + 48, 5, 0, TAU);
      ctx.fill();
    }

    // 잔디 디테일
    ctx.save();
    const poff = bgOffset.prop % (VIEW_W + 200);
    for (const p of props) {
      let x = p.x - poff;
      if (x < -100) x += VIEW_W + 200;
      drawProp(x, p);
    }
    ctx.restore();
  }

  function drawProp(x, p) {
    const s = p.s;
    if (p.type === 'grass') {
      ctx.strokeStyle = '#4f9c3f';
      ctx.lineWidth = 3 * s;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 5 * s, GROUND_Y - 6);
        ctx.quadraticCurveTo(x + i * 9 * s, GROUND_Y - 20 * s, x + i * 13 * s, GROUND_Y - 26 * s);
        ctx.stroke();
      }
    } else if (p.type === 'flower') {
      ctx.strokeStyle = '#4f9c3f';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y - 4);
      ctx.lineTo(x, GROUND_Y - 22 * s);
      ctx.stroke();
      ctx.fillStyle = '#ff8fc0';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 6 * s, GROUND_Y - 24 * s + Math.sin(a) * 6 * s, 4.5 * s, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath();
      ctx.arc(x, GROUND_Y - 24 * s, 3.5 * s, 0, TAU);
      ctx.fill();
    } else if (p.type === 'candy') {
      ctx.fillStyle = '#ff9fc0';
      rr(ctx, x - 4 * s, GROUND_Y - 26 * s, 8 * s, 24 * s, 4 * s);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        rr(ctx, x - 4 * s, GROUND_Y - (24 - i * 7) * s, 8 * s, 3.4 * s, 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(120, 90, 60, 0.5)';
      ellipse(ctx, x, GROUND_Y - 4, 7 * s, 4.5 * s);
      ctx.fill();
    }
  }

  function drawJellies() {
    for (const j of jellies) {
      const bob = Math.sin(j.phase) * 3;
      const y = j.y + bob;
      ctx.save();
      // 빛무리
      const glow = ctx.createRadialGradient(j.x, y, 1, j.x, y, j.r * 2.3);
      const col = j.big ? '255,150,220' : '255,215,90';
      glow.addColorStop(0, `rgba(${col},0.55)`);
      glow.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(j.x, y, j.r * 2.3, 0, TAU);
      ctx.fill();

      // 몸통
      const bodyG = ctx.createLinearGradient(j.x, y - j.r, j.x, y + j.r);
      if (j.big) {
        bodyG.addColorStop(0, '#ffd6f2');
        bodyG.addColorStop(1, '#ff62b8');
      } else {
        bodyG.addColorStop(0, '#fff2b0');
        bodyG.addColorStop(1, '#ffb703');
      }
      ctx.fillStyle = bodyG;
      ellipse(ctx, j.x, y, j.r, j.r * 0.92);
      ctx.fill();

      // 반짝임
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ellipse(ctx, j.x - j.r * 0.32, y - j.r * 0.36, j.r * 0.28, j.r * 0.2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      const y = p.y + Math.sin(p.phase) * 8;
      ctx.save();
      // 버블
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(p.x, y, 30, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, y, 30, 0, TAU);
      ctx.stroke();

      if (p.type === 'potion') {
        ctx.fillStyle = '#ff5c5c';
        rr(ctx, p.x - 8, y - 4, 16, 20, 6); ctx.fill();
        ctx.fillStyle = '#ffd6d6';
        rr(ctx, p.x - 3, y - 14, 6, 12, 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        rr(ctx, p.x - 4, y - 10, 8, 7, 2); ctx.fill();
      } else if (p.type === 'magnet') {
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(p.x, y + 2, 12, Math.PI, TAU);
        ctx.stroke();
        ctx.strokeStyle = '#4d6dff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(p.x - 12, y + 2); ctx.lineTo(p.x - 12, y + 12);
        ctx.moveTo(p.x + 12, y + 2); ctx.lineTo(p.x + 12, y + 12);
        ctx.stroke();
      } else {
        drawStar(p.x, y, 5, 15, 7, '#ffd76e');
      }
      ctx.restore();
    }
  }

  function drawStar(cx, cy, spikes, outer, inner, color) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (spikes * 2)) * TAU - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.save();
      if (o.kind === 'spike') {
        const g = ctx.createLinearGradient(o.x, o.y + o.h, o.x, o.y);
        g.addColorStop(0, '#6b3f1d');
        g.addColorStop(1, '#a9682f');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(o.x + 2, o.y + o.h);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.lineTo(o.x + o.w - 2, o.y + o.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(o.x + o.w / 2, o.y + 6);
        ctx.lineTo(o.x + o.w * 0.42, o.y + o.h);
        ctx.lineTo(o.x + o.w * 0.52, o.y + o.h);
        ctx.closePath();
        ctx.fill();
      } else if (o.kind === 'box') {
        const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
        g.addColorStop(0, '#e0a563');
        g.addColorStop(1, '#b97a3f');
        ctx.fillStyle = g;
        rr(ctx, o.x, o.y, o.w, o.h, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 70, 20, 0.55)';
        ctx.lineWidth = 4;
        rr(ctx, o.x + 4, o.y + 4, o.w - 8, o.h - 8, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(o.x + 6, o.y + 6);
        ctx.lineTo(o.x + o.w - 6, o.y + o.h - 6);
        ctx.moveTo(o.x + o.w - 6, o.y + 6);
        ctx.lineTo(o.x + 6, o.y + o.h - 6);
        ctx.lineWidth = 3;
        ctx.stroke();
        if (o.tall) {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          rr(ctx, o.x + o.w * 0.2, o.y + 8, o.w * 0.6, 12, 6);
          ctx.fill();
        }
      } else if (o.kind === 'bar') {
        // 줄
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(o.x + o.w / 2, 0);
        ctx.lineTo(o.x + o.w / 2, o.y + 6);
        ctx.stroke();
        // 매달린 사탕 막대
        const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
        g.addColorStop(0, '#ff8fb8');
        g.addColorStop(1, '#e5487c');
        ctx.fillStyle = g;
        rr(ctx, o.x, o.y, o.w, o.h, 16);
        ctx.fill();
        // 사탕 줄무늬
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.translate(o.x + 20 + i * 36, o.y + 20);
          ctx.rotate(0.28);
          rr(ctx, -8, 0, 16, o.h - 40, 8);
          ctx.fill();
          ctx.restore();
        }
        // 아래쪽 캔디 방울 마감
        ctx.fillStyle = '#d94a7c';
        const n = 6;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(o.x + 14 + i * ((o.w - 28) / (n - 1)), o.y + o.h - 6, 9, 0, TAU);
          ctx.fill();
        }
      } else {
        // flyer : 사탕 박쥐
        const flap = Math.sin(game.worldTime * 16 + o.phase) * 0.9;
        ctx.fillStyle = '#9b6bff';
        ctx.save();
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        // 날개
        ctx.save();
        ctx.rotate(-0.5 + flap * 0.5);
        ctx.beginPath();
        ctx.ellipse(-o.w * 0.42, 0, o.w * 0.42, o.h * 0.42, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.rotate(0.5 - flap * 0.5);
        ctx.beginPath();
        ctx.ellipse(o.w * 0.42, 0, o.w * 0.42, o.h * 0.42, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        // 몸통
        ctx.fillStyle = '#7d4ee6';
        ellipse(ctx, 0, 0, o.w * 0.4, o.h * 0.55);
        ctx.fill();
        // 눈
        ctx.fillStyle = '#fff';
        ellipse(ctx, -7, -3, 5, 5); ctx.fill();
        ellipse(ctx, 7, -3, 5, 5); ctx.fill();
        ctx.fillStyle = '#241040';
        ellipse(ctx, -7, -3, 2.4, 2.4); ctx.fill();
        ellipse(ctx, 7, -3, 2.4, 2.4); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  /* ---------------- 플레이어 ---------------- */
  function drawTrails() {
    for (const t of player.trail) {
      const a = 1 - t.life / 0.35;
      ctx.save();
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = '#ffd76e';
      ellipse(ctx, t.x, t.y - 44, 26 * a, 30 * a);
      ctx.fill();
      ctx.restore();
    }
  }

  /** 쿠키 한 마리 그리기 (원점 = 발 중앙) */
  function drawCookieSprite(c, cookie, s) {
    const { rx, ry, by, runPhase, onGround, sliding, hurt, look, dead } = s;
    const limb = Math.max(6.5, rx * 0.34);

    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = cookie.bodyDark;
    c.lineWidth = limb;

    // ---- 팔 ----
    if (sliding) {
      c.beginPath(); c.moveTo(-rx * 0.55, by + ry * 0.35); c.lineTo(-rx * 1.15, by + ry * 0.2); c.stroke();
      c.beginPath(); c.moveTo(rx * 0.55, by + ry * 0.3); c.lineTo(rx * 1.2, by + ry * 0.75); c.stroke();
    } else if (onGround) {
      const a1 = Math.sin(runPhase + Math.PI) * ry * 0.22;
      const a2 = Math.sin(runPhase) * ry * 0.22;
      c.beginPath(); c.moveTo(-rx * 0.78, by - ry * 0.05); c.lineTo(-rx * 1.02, by + ry * 0.58 + a1); c.stroke();
      c.beginPath(); c.moveTo(rx * 0.78, by - ry * 0.05); c.lineTo(rx * 1.02, by + ry * 0.58 + a2); c.stroke();
    } else {
      const a = Math.sin(game.worldTime * 15) * ry * 0.1;
      c.beginPath(); c.moveTo(-rx * 0.78, by - ry * 0.1); c.lineTo(-rx * 1.12, by - ry * 0.6 - a); c.stroke();
      c.beginPath(); c.moveTo(rx * 0.78, by - ry * 0.1); c.lineTo(rx * 1.12, by - ry * 0.6 + a); c.stroke();
    }

    // ---- 다리 ----
    if (sliding) {
      c.beginPath(); c.moveTo(-rx * 0.1, by + ry * 0.5); c.lineTo(-rx * 1.05, by + ry * 0.72); c.stroke();
      c.beginPath(); c.moveTo(-rx * 0.05, by + ry * 0.15); c.lineTo(-rx * 1.1, by + ry * 0.22); c.stroke();
    } else if (onGround) {
      const s1 = Math.sin(runPhase) * rx * 0.24;
      const s2 = Math.sin(runPhase + Math.PI) * rx * 0.24;
      c.beginPath(); c.moveTo(-rx * 0.32, by + ry * 0.45); c.lineTo(-rx * 0.32 + s1, -limb * 0.5); c.stroke();
      c.beginPath(); c.moveTo(rx * 0.32, by + ry * 0.45); c.lineTo(rx * 0.32 + s2, -limb * 0.5); c.stroke();
    } else {
      c.beginPath(); c.moveTo(-rx * 0.32, by + ry * 0.55); c.lineTo(-rx * 0.66, by + ry * 0.98); c.stroke();
      c.beginPath(); c.moveTo(rx * 0.32, by + ry * 0.55); c.lineTo(rx * 0.68, by + ry * 0.8); c.stroke();
    }

    // ---- 몸통 ----
    const grad = c.createLinearGradient(0, by - ry, 0, by + ry);
    grad.addColorStop(0, cookie.body);
    grad.addColorStop(1, cookie.bodyDark);
    c.fillStyle = grad;
    ellipse(c, 0, by, rx, ry);
    c.fill();
    c.lineWidth = Math.max(2, rx * 0.09);
    c.strokeStyle = shade(cookie.body, -0.16);
    c.stroke();

    // ---- 아이싱 (윗부분 + 물결 마감) ----
    c.save();
    ellipse(c, 0, by, rx, ry);
    c.clip();
    c.fillStyle = cookie.icing;
    c.beginPath();
    c.moveTo(-rx * 1.05, by - ry * 1.05);
    c.lineTo(-rx * 1.05, by - ry * 0.3);
    const drips = 5;
    for (let i = 0; i < drips; i++) {
      const x0 = -rx * 1.05 + (rx * 2.1) * (i / drips);
      const x1 = -rx * 1.05 + (rx * 2.1) * ((i + 1) / drips);
      const wave = Math.sin(i * 1.7 + runPhase * 0.3) * ry * 0.04;
      c.quadraticCurveTo((x0 + x1) / 2, by - ry * 0.02 + wave, x1, by - ry * 0.3);
    }
    c.lineTo(rx * 1.05, by - ry * 1.05);
    c.closePath();
    c.fill();
    c.restore();

    // ---- 눈 ----
    const eyeY = by - ry * 0.02;
    const eyeDX = rx * 0.36;
    if (hurt || dead) {
      const k = rx * 0.24;
      c.strokeStyle = cookie.eye;
      c.lineWidth = rx * 0.11;
      c.beginPath();
      c.moveTo(-eyeDX - k, eyeY - k * 0.6); c.lineTo(-eyeDX + k, eyeY + k * 0.6);
      c.moveTo(-eyeDX + k, eyeY - k * 0.6); c.lineTo(-eyeDX - k, eyeY + k * 0.6);
      c.moveTo(eyeDX - k, eyeY - k * 0.6); c.lineTo(eyeDX + k, eyeY + k * 0.6);
      c.moveTo(eyeDX + k, eyeY - k * 0.6); c.lineTo(eyeDX - k, eyeY + k * 0.6);
      c.stroke();
    } else {
      c.fillStyle = '#ffffff';
      ellipse(c, -eyeDX, eyeY, rx * 0.25, ry * 0.29); c.fill();
      ellipse(c, eyeDX, eyeY, rx * 0.25, ry * 0.29); c.fill();
      const lx = clamp(look || 0, -2, 2.6);
      c.fillStyle = cookie.eye;
      ellipse(c, -eyeDX + lx, eyeY + 1, rx * 0.13, ry * 0.16); c.fill();
      ellipse(c, eyeDX + lx, eyeY + 1, rx * 0.13, ry * 0.16); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.beginPath(); c.arc(-eyeDX + lx - 1.6, eyeY - 2.4, rx * 0.065, 0, TAU); c.fill();
      c.beginPath(); c.arc(eyeDX + lx - 1.6, eyeY - 2.4, rx * 0.065, 0, TAU); c.fill();
    }

    // ---- 볼 ----
    c.fillStyle = 'rgba(255,120,150,0.38)';
    ellipse(c, -rx * 0.66, eyeY + ry * 0.44, rx * 0.2, ry * 0.14); c.fill();
    ellipse(c, rx * 0.66, eyeY + ry * 0.44, rx * 0.2, ry * 0.14); c.fill();

    // ---- 입 ----
    c.strokeStyle = cookie.eye;
    c.lineWidth = Math.max(2, rx * 0.09);
    const mouthY = by + ry * 0.46;
    if (dead || hurt) {
      c.beginPath();
      c.arc(0, mouthY + 4, rx * 0.18, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    } else if (!onGround) {
      c.fillStyle = cookie.eye;
      ellipse(c, 0, mouthY, rx * 0.15, ry * 0.16); c.fill();
    } else {
      c.beginPath();
      c.arc(0, mouthY - 3, rx * 0.26, 0.25 * Math.PI, 0.75 * Math.PI);
      c.stroke();
    }

    // ---- 액세서리 ----
    if (cookie.hat === 'scarf') {
      c.fillStyle = cookie.accent;
      rr(c, -rx * 0.95, by + ry * 0.5, rx * 1.9, 10, 5);
      c.fill();
      rr(c, rx * 0.55, by + ry * 0.5, 12, 22, 5);
      c.fill();
    } else if (cookie.hat === 'leaf') {
      c.fillStyle = '#3fbf7f';
      c.beginPath();
      c.ellipse(-4, by - ry - 3, 13, 7, -0.6, 0, TAU);
      c.fill();
      c.strokeStyle = '#2c8a5c';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-12, by - ry + 1);
      c.lineTo(6, by - ry - 7);
      c.stroke();
    }
  }

  function drawPlayer() {
    const p = player;
    const c = game.cookie;

    // 그림자
    const airT = clamp((GROUND_Y - p.y) / 220, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.26 * (1 - airT * 0.75);
    ctx.fillStyle = '#3a1d0c';
    ellipse(ctx, p.x, GROUND_Y + 6, 30 * (1 - airT * 0.3), 9 * (1 - airT * 0.45));
    ctx.fill();
    ctx.restore();

    ctx.save();

    // 무적 별 오라
    if (p.star > 0) {
      const glow = ctx.createRadialGradient(p.x, p.y - 44, 6, p.x, p.y - 44, 70);
      glow.addColorStop(0, 'rgba(255,220,120,0.55)');
      glow.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 44, 70, 0, TAU);
      ctx.fill();
    }
    // 자석 오라
    if (p.magnet > 0) {
      ctx.strokeStyle = `rgba(255,92,138,${0.35 + Math.sin(game.worldTime * 10) * 0.12})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 44, 52, 0, TAU);
      ctx.stroke();
    }

    // 피격 깜빡임
    if (p.invincible > 0 && p.star <= 0) {
      const blink = Math.sin(game.time * 40) > 0;
      ctx.globalAlpha = blink ? 0.35 : 1;
    }

    ctx.translate(p.x, p.y);
    if (p.dead) ctx.rotate(p.rot);
    else if (p.sliding) ctx.rotate(-0.24);

    const rx = p.sliding ? 29 : 27;
    const ry = p.sliding ? 21 : 26;
    const by = p.sliding ? -23 : -46;

    drawCookieSprite(ctx, c, {
      rx, ry, by,
      runPhase: p.runPhase,
      onGround: p.onGround && !p.dead,
      sliding: p.sliding,
      hurt: (p.invincible > 0 && p.star <= 0 && game.state === 'playing'),
      look: p.onGround ? 1.6 : 0.6,
      dead: p.dead,
    });

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = p.color;
      if (p.shape === 'star') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        drawStar(0, 0, 4, p.size * 1.5, p.size * 0.6, p.color);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFloaters() {
    for (const f of floaters) {
      const t = f.life / f.max;
      ctx.save();
      ctx.globalAlpha = clamp(1 - t * t, 0, 1);
      ctx.font = `900 ${f.size}px "Pretendard", "Noto Sans KR", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(90, 40, 20, 0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  /* ============================================================
     13. HUD 동기화
     ============================================================ */
  const hudCache = { score: -1, dist: -1, speed: -1, energy: -1, combo: -1, magnet: false, star: false };

  function syncHUD(force) {
    const score = Math.floor(game.score);
    if (force || score !== hudCache.score) {
      hudCache.score = score;
      el.score.textContent = score.toLocaleString('ko-KR');
    }
    const dist = Math.floor(game.distance / METER);
    if (force || dist !== hudCache.dist) {
      hudCache.dist = dist;
      el.dist.textContent = dist.toLocaleString('ko-KR');
    }
    const kmh = Math.round((game.speed / METER) * 3.6);
    if (force || kmh !== hudCache.speed) {
      hudCache.speed = kmh;
      el.speed.textContent = kmh.toLocaleString('ko-KR');
    }
    const ratio = player.maxEnergy ? player.energy / player.maxEnergy : 0;
    const pct = Math.round(ratio * 100);
    if (force || pct !== hudCache.energy) {
      hudCache.energy = pct;
      el.energyFill.style.width = pct + '%';
      el.energyFill.className = pct <= 26 ? 'danger' : pct <= 55 ? 'warn' : '';
    }
    const combo = game.combo || 0;
    if (force || combo !== hudCache.combo) {
      hudCache.combo = combo;
      if (combo >= 3) {
        el.combo.classList.remove('hidden');
        el.comboNum.textContent = combo;
      } else {
        el.combo.classList.add('hidden');
      }
    }
    // 파워업 칩
    const m = player.magnet > 0;
    if (force || m !== hudCache.magnet) {
      hudCache.magnet = m;
      el.chipMagnet.classList.toggle('hidden', !m);
    }
    if (m) el.chipMagnetBar.style.width = (player.magnet / 7) * 100 + '%';

    const st = player.star > 0;
    if (force || st !== hudCache.star) {
      hudCache.star = st;
      el.chipStar.classList.toggle('hidden', !st);
    }
    if (st) el.chipStarBar.style.width = (player.star / 4.5) * 100 + '%';
  }

  /* ============================================================
     14. 메뉴 (쿠키 선택 카드)
     ============================================================ */
  function buildCookieCards() {
    el.cookieList.innerHTML = '';
    for (const cookie of COOKIES) {
      const card = document.createElement('div');
      card.className = 'cookie-card';
      card.dataset.id = cookie.id;

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const cv = document.createElement('canvas');
      cv.width = 200;
      cv.height = 240;
      thumb.appendChild(cv);

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = cookie.name;

      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = cookie.tag;

      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = cookie.desc;

      const cardBody = document.createElement('div');
      cardBody.className = 'card-body';
      cardBody.append(name, tag, desc);

      card.append(thumb, cardBody);
      card.addEventListener('click', () => selectCookie(cookie.id));
      el.cookieList.appendChild(card);

      // 미리보기 렌더
      const c2 = cv.getContext('2d');
      c2.translate(100, 200);
      c2.scale(2.6, 2.6);
      drawCookieSprite(c2, cookie, {
        rx: 27, ry: 26, by: -46, runPhase: 0, onGround: true, sliding: false,
        hurt: false, look: 0, dead: false,
      });
    }
    updateCookieCards();
  }

  function selectCookie(id) {
    const cookie = COOKIES.find((c) => c.id === id);
    if (!cookie) return;
    game.cookie = cookie;
    LS.set(KEY_COOKIE, id);
    updateCookieCards();
    Sound.tone(760, 0.09, 'triangle', 0.12);
  }

  function updateCookieCards() {
    [...el.cookieList.children].forEach((card) => {
      card.classList.toggle('selected', card.dataset.id === game.cookie.id);
    });
  }

  /* ============================================================
     14-1. 속도(난이도) 선택
     ============================================================ */
  function buildSpeedChips() {
    el.speedList.innerHTML = '';
    for (const preset of SPEED_PRESETS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'speed-chip';
      chip.dataset.mul = String(preset.mul);
      chip.innerHTML = `<span class="emo">${preset.emo}</span><b>${preset.name}</b><i>${fmtMul(preset.mul)}</i>`;
      chip.addEventListener('click', () => {
        setGameSpeed(preset.mul, true);
        Sound.tone(700 + preset.mul * 120, 0.1, 'triangle', 0.12);
      });
      el.speedList.appendChild(chip);
    }
    updateSpeedChips();
  }

  function updateSpeedChips() {
    [...el.speedList.children].forEach((chip) => {
      const mul = Number(chip.dataset.mul);
      chip.classList.toggle('selected', Math.abs(mul - game.speedMul) < 0.001);
    });
    el.speedValue.textContent = '현재 ' + fmtMul(game.speedMul);
    el.speedMul.textContent = fmtMul(game.speedMul);
    el.speedMul.classList.toggle('hidden', Math.abs(game.speedMul - 1) < 0.001);
  }

  /** 속도 배속 설정 (save=true 면 저장) */
  function setGameSpeed(mul, save) {
    game.speedMul = clamp(Math.round(mul * 100) / 100, SPEED_MIN, SPEED_MAX);
    if (save) LS.set(KEY_SPEED, game.speedMul);
    updateSpeedChips();
  }

  /** 게임 중 실시간 속도 조절 */
  function changeSpeed(delta) {
    const before = game.speedMul;
    setGameSpeed(before + delta, true);
    if (game.speedMul === before) return;   // 이미 한계
    Sound.tone(delta > 0 ? 920 : 560, 0.08, 'square', 0.1);
    if (game.state === 'playing') {
      addFloater(VIEW_W / 2, 160, '속도 ' + fmtMul(game.speedMul), '#ffffff', 30);
    }
  }

  /* ============================================================
     15. 버튼 연결 & 초기화
     ============================================================ */
  $('#btn-start').addEventListener('click', startGame);
  $('#btn-retry').addEventListener('click', startGame);
  $('#btn-menu-over').addEventListener('click', backToMenu);
  $('#btn-menu-pause').addEventListener('click', backToMenu);
  $('#btn-resume').addEventListener('click', resumeGame);
  $('#btn-restart-pause').addEventListener('click', startGame);
  $('#btn-pause').addEventListener('click', () => pauseGame());

  function toggleMute() {
    const m = !Sound.muted;
    Sound.setMuted(m);
    LS.set(KEY_MUTE, m);
    el.soundBtn.textContent = m ? '🔇' : '🔊';
  }
  el.soundBtn.addEventListener('click', toggleMute);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') pauseGame();
  });



  const isPortrait = () =>
    (window.matchMedia && window.matchMedia('(orientation: portrait)').matches)
    || window.innerHeight > window.innerWidth;

  /** 화면 방향에 맞춰 월드 크기 · 지면 위치 · 속도 배율을 다시 계산한다 */
  function applyLayout() {
    const kind = isPortrait() ? 'portrait' : 'landscape';
    const L = LAYOUTS[kind];
    const rect = wrap.getBoundingClientRect();
    const aspect = rect.width > 0 && rect.height > 0 ? rect.height / rect.width : (kind === 'portrait' ? 2 : 9 / 16);

    const prevGround = GROUND_Y;
    const prevW = VIEW_W;

    VIEW_W = L.W;
    VIEW_H = kind === 'portrait' ? Math.round(VIEW_W * aspect) : Math.round(VIEW_W * 9 / 16);
    GROUND_Y = kind === 'portrait'
      ? Math.round(VIEW_H - clamp(VIEW_H * 0.28, 250, 430))
      : L.ground;
    PLAYER_X = L.playerX;
    SPEED_SCALE = L.speed;

    // 지면이 움직인 만큼 모든 오브젝트를 같이 옮긴다 (회전·주소창 변화 대응)
    const dy = GROUND_Y - prevGround;
    if (dy !== 0) {
      const shift = (arr) => arr.forEach((o) => { o.y += dy; if (o.baseY !== undefined) o.baseY += dy; });
      shift(obstacles);
      shift(jellies);
      shift(powerups);
      shift(particles);
      shift(floaters);
      if (player.onGround) player.y = GROUND_Y;
      else player.y += dy;
    }
    player.x = PLAYER_X;

    if (kind !== game.layout || prevW !== VIEW_W) {
      game.layout = kind;
      buildBackground();
    }
    document.body.classList.toggle('is-portrait', kind === 'portrait');
    resizeCanvas();
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(VIEW_W * dpr);
    canvas.height = Math.round(VIEW_H * dpr);
    ctx.imageSmoothingEnabled = true;
  }

  window.addEventListener('resize', applyLayout);
  window.addEventListener('orientationchange', () => setTimeout(applyLayout, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', applyLayout);

  /* ============================================================
     16. 메인 루프
     ============================================================ */
  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!last) last = now;
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 1 / 25) dt = 1 / 25;
    if (dt <= 0) return;

    update(dt);
    render(dt);
  }

  function init() {
    Sound.muted = LS.get(KEY_MUTE, false);
    Sound.setMuted(Sound.muted);
    el.soundBtn.textContent = Sound.muted ? '🔇' : '🔊';

    game.best = LS.get(KEY_BEST, 0) || 0;
    el.menuBest.textContent = game.best.toLocaleString('ko-KR');

    game.cookie = COOKIES.find((c) => c.id === LS.get(KEY_COOKIE, 'ginger')) || COOKIES[0];
    game.speedMul = clamp(Number(LS.get(KEY_SPEED, 1)) || 1, SPEED_MIN, SPEED_MAX);

    buildBackground();
    buildCookieCards();
    buildSpeedChips();
    resetRun();
    applyLayout();

    window.addEventListener('pointerdown', () => Sound.resume(), { once: true });
    window.addEventListener('keydown', () => Sound.resume(), { once: true });

    requestAnimationFrame(loop);
  }

  init();

  // 디버그용 (개발/테스트)
  window.__cookierun = {
    game, player, COOKIES, drawCookieSprite, startGame, pauseGame, resumeGame, backToMenu, requestJump, startSlide,
    setGameSpeed, changeSpeed, SPEED_PRESETS,
    setDown(v) { input.down = v; if (v) startSlide(); else endSlide(); },
    get obstacles() { return obstacles; },
    get jellies() { return jellies; },
    get powerups() { return powerups; },
  };
})();
