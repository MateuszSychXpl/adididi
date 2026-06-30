/* =========================================================================
   ADIDIDI vs KOSZTY AZURE
   DevOps-bohater strzela skryptami optymalizacji w spadające koszty chmury.
   Dodatkowo: tickety Jira wyskakują z odliczaniem SLA — kliknij, zanim wybuchną.
   ========================================================================= */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 800
  const H = canvas.height;  // 560

  const BUDGET = 1000;      // budżet miesięczny w $ (zarazem "życie")
  const GROUND_Y = H - 28;  // linia, do której spadają koszty

  // ---- Definicje kosztów Azure (spadające wrogowie) ----
  const COST_TYPES = [
    { id: 'vm',    emoji: '🖥️', label: 'Idle VM',        cost: 40, r: 24, hp: 1, w: 0.9 },
    { id: 'disk',  emoji: '💾', label: 'Nieużywany dysk', cost: 20, r: 20, hp: 1, w: 1.2 },
    { id: 'egress',emoji: '🌐', label: 'Egress',          cost: 30, r: 22, hp: 1, w: 1.0 },
    { id: 'logs',  emoji: '📊', label: 'Log Analytics',   cost: 25, r: 21, hp: 1, w: 1.0 },
    { id: 'snap',  emoji: '📸', label: 'Snapshot',        cost: 15, r: 19, hp: 1, w: 1.1 },
    { id: 'gpu',   emoji: '🤖', label: 'GPU instance',    cost: 90, r: 30, hp: 2, w: 0.35 },
  ];
  const COST_WEIGHT_SUM = COST_TYPES.reduce((s, t) => s + t.w, 0);

  // ---- Power-upy ----
  const POWERUPS = {
    bomb:   { emoji: '🧯', label: 'FinOps audit' },   // czyści ekran z kosztów
    rapid:  { emoji: '⚡', label: 'Auto-scaling' },   // szybkostrzelność
    refund: { emoji: '💵', label: 'Reserved Instance' }, // zbija rachunek
  };

  // ---- Tickety Jira ----
  const JIRA_TICKETS = [
    { key: 'PROD-1', emoji: '🔥', title: 'PROD down!',        bonus: 60, ttl: 4.5, sla: 70 },
    { key: 'OPS-42', emoji: '💾', title: 'Dysk 95% pełny',    bonus: 35, ttl: 5.5, sla: 40 },
    { key: 'SEC-7',  emoji: '🔐', title: 'Cert wygasa',       bonus: 40, ttl: 5.0, sla: 45 },
    { key: 'BUG-13', emoji: '🐛', title: 'Memory leak',       bonus: 30, ttl: 6.0, sla: 35 },
    { key: 'INF-9',  emoji: '📈', title: 'Trzeba skalować',   bonus: 35, ttl: 5.5, sla: 40 },
    { key: 'NET-3',  emoji: '🛰️', title: 'Timeout API',       bonus: 30, ttl: 5.0, sla: 35 },
  ];

  // ---- Boss: PM Wojtek (Project Manager) ----
  const PM_PHRASES = [
    'To tylko mały feature!',
    'Klient czeka — na wczoraj!',
    'Dorzućmy jeszcze AI 🤖',
    'Deadline był wczoraj!',
    'Da się do jutra?',
    'Quick win, serio!',
    'Scope się nie zmienił 😇',
    'Jeszcze jedna drobnostka...',
    'Sprint? Jaki sprint?',
    'Zróbcie po prostu magię ✨',
    'Klient widział to u konkurencji',
    'To miało być na demo!',
  ];
  const PM_TASKS = [
    { t: 'ASAP!!!',        cost: 50 },
    { t: 'Quick win',      cost: 30 },
    { t: 'Mały feature',   cost: 45 },
    { t: 'Na wczoraj?',    cost: 40 },
    { t: 'Refactor all',   cost: 60 },
    { t: 'Dorzuć AI',      cost: 55 },
    { t: 'Klient prosił',  cost: 35 },
    { t: 'Scope creep',    cost: 50 },
    { t: 'Tylko 1 zmiana', cost: 30 },
    { t: 'Hotfix PROD',    cost: 45 },
  ];

  // ---- Pomocnicy Adididi (wingmani) ----
  //  Mateusz: pasjonat vibecodingu/AI -> strzały samonaprowadzające (AI celuje za Ciebie)
  //  Irek: spec od GH Actions / pipeline'ow / repo -> potrojny "deploy" CI/CD
  const HELPERS = [
    { name: 'Mateusz', emoji: '🧔',   color: '#7cf0a0', intro: 'Mateusz odpala AI copilota! 🤖✨', mode: 'ai' },
    { name: 'Irek',    emoji: '🧑‍🦰', color: '#ffd36b', intro: 'Irek pushuje pipeline! 🚀 CI/CD',  mode: 'ci' },
  ];

  // =========================================================================
  //  AUDIO — proste blipy z WebAudio (z wyciszeniem)
  // =========================================================================
  const Audio2 = {
    ctx: null,
    muted: false,
    bgm: null,
    startMusic() {
      if (!this.bgm) {
        this.bgm = new Audio('music.mp3');
        this.bgm.loop = true;
        this.bgm.volume = 0.35;
      }
      this.bgm.muted = this.muted;
      const p = this.bgm.play();
      if (p && p.catch) p.catch(() => {}); // autoplay bywa blokowany do gestu — ignorujemy
    },
    setMuted(m) {
      this.muted = m;
      if (this.bgm) this.bgm.muted = m;
    },
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    blip(freq = 440, dur = 0.08, type = 'square', gain = 0.06) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    },
    shoot() { this.blip(880, 0.05, 'square', 0.03); },
    hit()   { this.blip(520, 0.07, 'triangle', 0.05); },
    boom()  { this.blip(140, 0.25, 'sawtooth', 0.08); },
    power() { this.blip(1040, 0.12, 'sine', 0.07); this.blip(1320, 0.12, 'sine', 0.05); },
    ticket(){ this.blip(660, 0.06, 'sine', 0.05); },
    win()   { this.blip(784, 0.12, 'sine', 0.06); },
    bad()   { this.blip(110, 0.3, 'sawtooth', 0.09); },
  };

  // =========================================================================
  //  STAN GRY
  // =========================================================================
  let state = 'start'; // 'start' | 'playing' | 'over'
  let bullets, enemies, powerups, particles, tickets, floaters, tasks, helpers;
  let player, savings, bill, wave, elapsed, spawnTimer, ticketTimer;
  let fireCooldown, rapidUntil, lastTs;
  let boss, bossCooldown, bossDefeated, helperTimer;

  function reset() {
    bullets = [];
    enemies = [];
    powerups = [];
    particles = [];
    tickets = [];
    floaters = []; // teksty "+$" itp.
    tasks = [];    // taski/ficzery rzucane przez PM Wojtka
    helpers = [];  // Mateusz / Irek
    boss = null;
    bossCooldown = 22;  // pierwszy PM Wojtek po ~22 s
    bossDefeated = 0;
    helperTimer = 13;   // pierwszy pomocnik po ~13 s
    player = { x: W / 2, y: GROUND_Y - 4, w: 46, h: 46, speed: 460, dir: 0 };
    savings = 0;
    bill = 0;
    wave = 1;
    elapsed = 0;
    spawnTimer = 0.6;
    ticketTimer = 4;
    fireCooldown = 0;
    rapidUntil = 0;
  }

  // =========================================================================
  //  INPUT
  // =========================================================================
  const keys = { left: false, right: false, fire: false };
  let pointerActive = false; // mysz/dotyk steruje pozycją
  let pointerX = W / 2;
  let pointerDown = false;
  let autoFire = false;      // przy dotyku strzelamy automatycznie

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; pointerActive = false; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; pointerActive = false; }
    if (e.code === 'Space') { keys.fire = true; e.preventDefault(); }
    if (e.code === 'Enter' && state !== 'playing') startGame();
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'Space') keys.fire = false;
  });

  function canvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    Audio2.init();
    if (state !== 'playing') return;
    const p = canvasPos(e);
    if (e.pointerType === 'touch') autoFire = true;

    // Klik w ticket Jira ma pierwszeństwo przed strzałem.
    if (tryResolveTicket(p.x, p.y)) {
      e.preventDefault();
      return;
    }
    pointerActive = true;
    pointerX = p.x;
    pointerDown = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'playing') return;
    const p = canvasPos(e);
    pointerX = p.x;
    pointerActive = true;
  });
  addEventListener('pointerup', () => { pointerDown = false; });

  // =========================================================================
  //  SPAWNOWANIE
  // =========================================================================
  function pickCostType() {
    let r = Math.random() * COST_WEIGHT_SUM;
    for (const t of COST_TYPES) {
      r -= t.w;
      if (r <= 0) return t;
    }
    return COST_TYPES[0];
  }

  function spawnEnemy() {
    const t = pickCostType();
    const speed = (58 + wave * 11) * (t.id === 'gpu' ? 0.7 : 1) * (0.85 + Math.random() * 0.4);
    enemies.push({
      type: t,
      x: t.r + Math.random() * (W - 2 * t.r),
      y: -t.r,
      vx: (Math.random() - 0.5) * 40,
      vy: speed,
      hp: t.hp,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  function spawnTicket() {
    if (tickets.length >= 3) return;
    const t = JIRA_TICKETS[(Math.random() * JIRA_TICKETS.length) | 0];
    const w = 150, h = 56;
    tickets.push({
      def: t,
      x: 20 + Math.random() * (W - w - 40),
      y: 70 + Math.random() * (H - h - 200),
      w, h,
      ttl: t.ttl,
      maxTtl: t.ttl,
      born: 0,
    });
    Audio2.ticket();
  }

  function tryResolveTicket(px, py) {
    for (let i = tickets.length - 1; i >= 0; i--) {
      const tk = tickets[i];
      if (px >= tk.x && px <= tk.x + tk.w && py >= tk.y && py <= tk.y + tk.h) {
        savings += tk.def.bonus;
        addFloater(tk.x + tk.w / 2, tk.y, `RESOLVED +$${tk.def.bonus}`, '#2ecc71');
        spawnParticles(tk.x + tk.w / 2, tk.y + tk.h / 2, '#50b0ff', 16);
        Audio2.win();
        tickets.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  // =========================================================================
  //  AKCJE
  // =========================================================================
  function fire() {
    bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -620, r: 5 });
    // mały podwójny strzał przy auto-scaling
    if (elapsed < rapidUntil) {
      bullets.push({ x: player.x - 12, y: player.y - player.h / 2 + 6, vy: -600, r: 4 });
      bullets.push({ x: player.x + 12, y: player.y - player.h / 2 + 6, vy: -600, r: 4 });
    }
    Audio2.shoot();
  }

  function addToBill(amount, x, y) {
    bill += amount;
    addFloater(x, y, `+$${amount} rachunek`, '#e74c3c');
    if (bill >= BUDGET) {
      bill = BUDGET;
      gameOver();
    }
  }

  function maybeDropPowerup(x, y) {
    if (Math.random() > 0.09) return;
    const ids = Object.keys(POWERUPS);
    const id = ids[(Math.random() * ids.length) | 0];
    powerups.push({ id, x, y, vy: 95, r: 18, pulse: 0 });
  }

  function applyPowerup(id) {
    Audio2.power();
    if (id === 'bomb') {
      let total = 0;
      for (const e of enemies) total += e.type.cost;
      for (const t of tasks) total += t.cost;
      savings += total;
      spawnParticles(W / 2, H / 2, '#f1c40f', 50);
      for (const e of enemies) spawnParticles(e.x, e.y, '#2ecc71', 6);
      for (const t of tasks) spawnParticles(t.x, t.y, '#2ecc71', 5);
      enemies = [];
      tasks = [];
      addFloater(player.x, player.y - 50, `FinOps audit! +$${total}`, '#f1c40f');
      Audio2.boom();
    } else if (id === 'rapid') {
      rapidUntil = elapsed + 7;
      addFloater(player.x, player.y - 50, 'AUTO-SCALING ⚡', '#50b0ff');
    } else if (id === 'refund') {
      const cut = Math.min(bill, 120);
      bill -= cut;
      addFloater(player.x, player.y - 50, `Reserved Instance -$${cut}`, '#2ecc71');
    }
  }

  // =========================================================================
  //  EFEKTY
  // =========================================================================
  function spawnParticles(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 180;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.4,
        age: 0,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }
  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, age: 0, life: 1.1 });
  }

  // =========================================================================
  //  BOSS: PM WOJTEK  +  POMOCNICY (Mateusz / Irek)
  // =========================================================================
  function spawnBoss() {
    const hp = 28 + bossDefeated * 16;
    boss = {
      x: W / 2, y: 92, vx: 95 + bossDefeated * 12, w: 84, h: 56,
      hp, maxHp: hp, taskTimer: 1.0, hitFlash: 0, born: 0,
      speech: PM_PHRASES[(Math.random() * PM_PHRASES.length) | 0], speechTimer: 3,
    };
    addFloater(W / 2, 160, '🧑‍💼 PM WOJTEK WCHODZI NA STANDUP!', '#f1c40f');
    Audio2.bad();
  }

  function throwTask() {
    const def = PM_TASKS[(Math.random() * PM_TASKS.length) | 0];
    tasks.push({
      label: def.t, cost: def.cost,
      x: boss.x + (Math.random() - 0.5) * 60, y: boss.y + 28,
      vx: (Math.random() - 0.5) * 120,
      vy: 70 + Math.random() * 60 + bossDefeated * 12,
      born: 0,
    });
    Audio2.blip(240, 0.05, 'sawtooth', 0.04);
  }

  function spawnHelper() {
    const def = HELPERS[(Math.random() * HELPERS.length) | 0];
    const side = Math.random() < 0.5 ? -1 : 1;
    helpers.push({
      def, side, x: side < 0 ? -40 : W + 40, y: player.y - 4,
      offset: 58 + Math.random() * 28, life: 6.5, fireCd: 0.3,
    });
    addFloater(player.x, player.y - 64, def.intro, def.color);
    Audio2.power();
  }

  function nearestTarget(x, y) {
    let best = null, bestD = Infinity;
    const consider = (tx, ty) => {
      const d = (tx - x) * (tx - x) + (ty - y) * (ty - y);
      if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
    };
    for (const e of enemies) consider(e.x, e.y);
    for (const t of tasks) consider(t.x, t.y);
    if (boss) consider(boss.x, boss.y);
    return best;
  }

  // =========================================================================
  //  UPDATE
  // =========================================================================
  function update(dt) {
    elapsed += dt;
    const newWave = Math.floor(elapsed / 18) + 1;
    if (newWave !== wave) { wave = newWave; }

    // --- ruch gracza ---
    if (pointerActive) {
      const diff = pointerX - player.x;
      player.x += Math.sign(diff) * Math.min(Math.abs(diff), player.speed * dt * 1.6);
    } else {
      let d = 0;
      if (keys.left) d -= 1;
      if (keys.right) d += 1;
      player.x += d * player.speed * dt;
    }
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));

    // --- strzelanie ---
    fireCooldown -= dt;
    const wantFire = keys.fire || (pointerDown && !autoFire) || autoFire;
    const interval = elapsed < rapidUntil ? 0.10 : 0.22;
    if (wantFire && fireCooldown <= 0) {
      fire();
      fireCooldown = interval;
    }

    // --- pociski ---
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (b.homing) {
        // AI copilot Mateusza: zakręca w stronę najbliższego celu
        const tgt = nearestTarget(b.x, b.y);
        if (tgt) {
          const dx = tgt.x - b.x, dy = tgt.y - b.y;
          const len = Math.hypot(dx, dy) || 1;
          const sp = 600;
          b.vx = (b.vx || 0) + (dx / len * sp - (b.vx || 0)) * Math.min(1, dt * 6);
          b.vy = b.vy + (dy / len * sp - b.vy) * Math.min(1, dt * 6);
        }
      }
      b.x += (b.vx || 0) * dt;
      b.y += b.vy * dt;
      if (b.y < -10 || b.y > H + 10 || b.x < -20 || b.x > W + 20) bullets.splice(i, 1);
    }

    // --- spawnowanie wrogów ---
    spawnTimer -= dt;
    const spawnEvery = Math.max(0.42, 1.15 - wave * 0.07);
    if (spawnTimer <= 0) {
      spawnEnemy();
      if (wave > 4 && !boss && Math.random() < 0.3) spawnEnemy();
      spawnTimer = spawnEvery * (0.7 + Math.random() * 0.6) * (boss ? 1.8 : 1);
    }

    // --- tickety Jira ---
    ticketTimer -= dt;
    if (ticketTimer <= 0) {
      spawnTicket();
      ticketTimer = Math.max(5.5, 11 - wave * 0.4) * (0.7 + Math.random() * 0.6);
    }
    for (let i = tickets.length - 1; i >= 0; i--) {
      const tk = tickets[i];
      tk.ttl -= dt;
      tk.born += dt;
      if (tk.ttl <= 0) {
        // SLA breach → kara doliczona do rachunku
        Audio2.bad();
        spawnParticles(tk.x + tk.w / 2, tk.y + tk.h / 2, '#e74c3c', 20);
        tickets.splice(i, 1);
        addToBill(tk.def.sla, tk.x + tk.w / 2, tk.y);
      }
    }

    // --- wrogowie ---
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.pulse += dt * 6;
      if (e.x < e.type.r || e.x > W - e.type.r) e.vx *= -1;

      if (e.y >= GROUND_Y) {
        // koszt trafia na rachunek
        Audio2.boom();
        spawnParticles(e.x, GROUND_Y, '#e74c3c', 12);
        enemies.splice(i, 1);
        addToBill(e.type.cost, e.x, GROUND_Y - 18);
        continue;
      }

      // kolizja z pociskami
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const dx = b.x - e.x, dy = b.y - e.y;
        if (dx * dx + dy * dy < (e.type.r + b.r) * (e.type.r + b.r)) {
          bullets.splice(j, 1);
          e.hp -= 1;
          spawnParticles(b.x, b.y, '#50b0ff', 5);
          if (e.hp <= 0) {
            savings += e.type.cost;
            spawnParticles(e.x, e.y, '#2ecc71', 14);
            addFloater(e.x, e.y, `+$${e.type.cost}`, '#2ecc71');
            maybeDropPowerup(e.x, e.y);
            enemies.splice(i, 1);
            Audio2.hit();
          } else {
            Audio2.blip(400, 0.04, 'square', 0.03);
          }
          break;
        }
      }
    }

    // --- BOSS: PM Wojtek ---
    if (!boss) {
      bossCooldown -= dt;
      if (bossCooldown <= 0) spawnBoss();
    } else {
      boss.born += dt;
      boss.x += boss.vx * dt;
      if (boss.x < boss.w / 2 || boss.x > W - boss.w / 2) boss.vx *= -1;
      boss.x = Math.max(boss.w / 2, Math.min(W - boss.w / 2, boss.x));
      if (boss.hitFlash > 0) boss.hitFlash -= dt;

      boss.speechTimer -= dt;
      if (boss.speechTimer <= 0) {
        boss.speech = PM_PHRASES[(Math.random() * PM_PHRASES.length) | 0];
        boss.speechTimer = 2.4 + Math.random() * 1.8;
      }

      boss.taskTimer -= dt;
      if (boss.taskTimer <= 0) {
        throwTask();
        boss.taskTimer = Math.max(0.55, 1.4 - bossDefeated * 0.15) * (0.7 + Math.random() * 0.6);
      }

      // pociski vs PM Wojtek
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (Math.abs(b.x - boss.x) < boss.w / 2 && Math.abs(b.y - boss.y) < boss.h / 2) {
          bullets.splice(j, 1);
          boss.hp -= 1;
          boss.hitFlash = 0.08;
          spawnParticles(b.x, b.y, '#ffd36b', 5);
          Audio2.blip(300, 0.04, 'square', 0.04);
          if (boss.hp <= 0) {
            const reward = 250 + bossDefeated * 150;
            savings += reward;
            spawnParticles(boss.x, boss.y, '#2ecc71', 60);
            addFloater(boss.x, boss.y, `SPRINT ZAMKNIĘTY! +$${reward}`, '#2ecc71');
            Audio2.win();
            boss = null;
            bossDefeated += 1;
            bossCooldown = Math.max(16, 30 - bossDefeated * 2);
            break;
          }
        }
      }
    }

    // --- taski/ficzery od PM-a (spadają jak koszty) ---
    for (let i = tasks.length - 1; i >= 0; i--) {
      const t = tasks[i];
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.born += dt;
      if (t.x < 30 || t.x > W - 30) t.vx *= -1;
      if (t.y >= GROUND_Y) {
        // niezrobiony task = scope creep na rachunku
        Audio2.boom();
        spawnParticles(t.x, GROUND_Y, '#e74c3c', 12);
        tasks.splice(i, 1);
        addToBill(t.cost, t.x, GROUND_Y - 18);
        continue;
      }
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (Math.abs(b.x - t.x) < 44 && Math.abs(b.y - t.y) < 18) {
          bullets.splice(j, 1);
          savings += t.cost;
          spawnParticles(t.x, t.y, '#2ecc71', 12);
          addFloater(t.x, t.y, `DONE ✅ +$${t.cost}`, '#2ecc71');
          Audio2.hit();
          tasks.splice(i, 1);
          break;
        }
      }
    }

    // --- pomocnicy: Mateusz (AI) i Irek (CI/CD) ---
    if (!helpers.length) {
      helperTimer -= dt;
      if (helperTimer <= 0) {
        spawnHelper();
        helperTimer = 15 + Math.random() * 10;
      }
    }
    for (let i = helpers.length - 1; i >= 0; i--) {
      const h = helpers[i];
      h.life -= dt;
      const targetX = player.x + h.side * h.offset;
      h.x += (targetX - h.x) * Math.min(1, dt * 4);
      h.y += (player.y - 4 - h.y) * Math.min(1, dt * 4);
      h.fireCd -= dt;
      const onScreen = h.x > 0 && h.x < W;
      if (h.fireCd <= 0 && onScreen) {
        if (h.def.mode === 'ai') {
          // AI copilot: pojedynczy strzał samonaprowadzający
          bullets.push({ x: h.x, y: h.y - 20, vx: 0, vy: -560, r: 5, homing: true });
        } else {
          // pipeline CI/CD: potrójny "deploy"
          bullets.push({ x: h.x, y: h.y - 20, vx: 0, vy: -560, r: 4 });
          bullets.push({ x: h.x - 12, y: h.y - 14, vx: -90, vy: -540, r: 3 });
          bullets.push({ x: h.x + 12, y: h.y - 14, vx: 90, vy: -540, r: 3 });
        }
        h.fireCd = 0.28;
        Audio2.blip(760, 0.03, 'square', 0.02);
      }
      if (h.life <= 0) helpers.splice(i, 1);
    }

    // --- power-upy (zbierane przez gracza) ---
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * dt;
      p.pulse += dt * 5;
      const dx = p.x - player.x, dy = p.y - player.y;
      if (Math.abs(dx) < player.w / 2 + p.r && Math.abs(dy) < player.h / 2 + p.r) {
        applyPowerup(p.id);
        powerups.splice(i, 1);
        continue;
      }
      if (p.y > H + 30) powerups.splice(i, 1);
    }

    // --- cząstki ---
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }

    // --- floatery ---
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.age += dt;
      f.y -= 26 * dt;
      if (f.age >= f.life) floaters.splice(i, 1);
    }

    updateHud();
  }

  // =========================================================================
  //  RYSOWANIE
  // =========================================================================
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // delikatna "siatka chmury" w tle
    ctx.strokeStyle = 'rgba(80,176,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // linia "rachunku" na dole
    ctx.save();
    ctx.strokeStyle = 'rgba(231,76,60,0.5)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // power-upy
    for (const p of powerups) {
      const s = 1 + Math.sin(p.pulse) * 0.08;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(s, s);
      ctx.shadowColor = '#50b0ff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20,56,94,0.85)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = '22px serif';
      ctx.fillText(POWERUPS[p.id].emoji, 0, 1);
      ctx.restore();
    }

    // wrogowie (koszty)
    for (const e of enemies) {
      const bob = Math.sin(e.pulse) * 2;
      ctx.font = `${e.type.r * 1.8}px serif`;
      ctx.fillText(e.type.emoji, e.x, e.y + bob);
      // cena
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillStyle = '#ffd36b';
      ctx.fillText(`$${e.type.cost}`, e.x, e.y + e.type.r + 9 + bob);
    }

    // taski PM-a + boss
    for (const t of tasks) drawTask(t);
    if (boss) drawBoss();

    // pociski
    for (const b of bullets) {
      ctx.save();
      ctx.shadowColor = b.homing ? '#7cf0a0' : '#9fe0ff';
      ctx.shadowBlur = b.homing ? 14 : 10;
      ctx.fillStyle = b.homing ? '#d4ffe2' : '#cdeeff';
      ctx.beginPath();
      const ang = Math.atan2(b.vy, b.vx || 0) + Math.PI / 2;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.homing ? ang : 0);
      ctx.ellipse(0, 0, b.r, b.r * 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // gracz — Adididi
    drawPlayer();

    // pomocnicy: Mateusz / Irek
    for (const h of helpers) drawHelper(h);

    // tickety Jira
    for (const tk of tickets) drawTicket(tk);

    // cząstki
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // floatery
    ctx.font = 'bold 14px Consolas, monospace';
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const { x, y } = player;
    // poświata pod bohaterem
    ctx.save();
    ctx.shadowColor = '#50b0ff';
    ctx.shadowBlur = 18;
    ctx.font = '40px serif';
    ctx.fillText('🦸', x, y - 6);
    ctx.restore();
    // podpis
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.fillStyle = '#9fe0ff';
    ctx.fillText('ADIDIDI', x, y + 20);
  }

  function drawHelper(h) {
    ctx.save();
    ctx.shadowColor = h.def.color;
    ctx.shadowBlur = 14;
    ctx.font = '30px serif';
    ctx.fillText(h.def.emoji, h.x, h.y - 4);
    ctx.restore();
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.fillStyle = h.def.color;
    ctx.fillText(h.def.name.toUpperCase(), h.x, h.y + 16);
  }

  function drawTask(t) {
    const w = 88, h = 30;
    const pop = Math.min(1, t.born / 0.15);
    const s = 0.8 + pop * 0.2;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = 'rgba(72,28,28,0.95)';
    roundRect(0, 0, w, h, 6); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#e67e22'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px Segoe UI, sans-serif';
    ctx.fillStyle = '#ffe0c0';
    ctx.fillText(t.label, w / 2, h / 2 - 4);
    ctx.font = 'bold 9px Consolas, monospace';
    ctx.fillStyle = '#ffd36b';
    ctx.fillText(`$${t.cost}`, w / 2, h / 2 + 8);
    ctx.restore();
    ctx.textAlign = 'center';
  }

  function drawBoss() {
    const b = boss;
    const bob = Math.sin(b.born * 3) * 4;

    // dymek z tekstem PM-a
    if (b.speech) {
      ctx.font = 'bold 12px Segoe UI, sans-serif';
      const tw = ctx.measureText(b.speech).width + 22;
      const bx = Math.max(8, Math.min(W - tw - 8, b.x - tw / 2));
      const by = b.y - 52 + bob;
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      roundRect(bx, by, tw, 24, 8); ctx.fill();
      ctx.fillStyle = '#102a44';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.speech, bx + tw / 2, by + 12);
    }

    // pasek "cierpliwości" (HP)
    const bw = 160, bh = 9, hx = b.x - bw / 2, hy = b.y - 30 + bob;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(hx, hy, bw, bh, 4); ctx.fill();
    const ratio = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = ratio > 0.5 ? '#e74c3c' : (ratio > 0.25 ? '#f39c12' : '#f1c40f');
    roundRect(hx, hy, bw * ratio, bh, 4); ctx.fill();

    // postać PM-a
    ctx.save();
    if (b.hitFlash > 0) ctx.globalAlpha = 0.55;
    ctx.shadowColor = '#e74c3c';
    ctx.shadowBlur = 20;
    ctx.font = '52px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🧑‍💼', b.x, b.y + bob);
    ctx.restore();

    ctx.font = 'bold 12px Consolas, monospace';
    ctx.fillStyle = '#ffd36b';
    ctx.fillText('PM WOJTEK', b.x, b.y + 32 + bob);
  }

  function drawTicket(tk) {
    const { x, y, w, h } = tk;
    const pop = Math.min(1, tk.born / 0.18); // animacja pojawienia
    const scale = 0.7 + pop * 0.3;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);

    const ratio = tk.ttl / tk.maxTtl;
    const urgent = ratio < 0.35;
    // karta
    ctx.fillStyle = urgent ? 'rgba(60,18,18,0.95)' : 'rgba(14,39,66,0.95)';
    roundRect(0, 0, w, h, 8);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = urgent ? '#e74c3c' : '#50b0ff';
    ctx.stroke();

    // ikona + klucz
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '20px serif';
    ctx.fillText(tk.def.emoji, 9, 18);
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.fillStyle = '#9fe0ff';
    ctx.fillText(tk.def.key, 34, 15);
    ctx.font = '12px Segoe UI, sans-serif';
    ctx.fillStyle = '#e8f3ff';
    ctx.fillText(tk.def.title, 9, 35);

    // pasek SLA
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(9, h - 14, w - 18, 6, 3); ctx.fill();
    ctx.fillStyle = urgent ? '#e74c3c' : (ratio < 0.6 ? '#f1c40f' : '#2ecc71');
    roundRect(9, h - 14, (w - 18) * ratio, 6, 3); ctx.fill();

    // hint
    ctx.textAlign = 'right';
    ctx.font = '9px Consolas, monospace';
    ctx.fillStyle = '#7fa8cf';
    ctx.fillText('KLIK = RESOLVE', w - 9, 15);

    ctx.restore();
    ctx.textAlign = 'center';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // =========================================================================
  //  HUD
  // =========================================================================
  const el = {
    savings: document.getElementById('savings'),
    billFill: document.getElementById('bill-fill'),
    billText: document.getElementById('bill-text'),
    wave: document.getElementById('wave'),
  };
  function updateHud() {
    el.savings.textContent = `$${Math.round(savings)}`;
    const pct = Math.min(100, (bill / BUDGET) * 100);
    el.billFill.style.width = pct + '%';
    el.billText.textContent = `$${Math.round(bill)} / $${BUDGET}`;
    el.wave.textContent = wave;
  }

  // =========================================================================
  //  PĘTLA GRY
  // =========================================================================
  function loop(ts) {
    if (state !== 'playing') return;
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05; // ograniczenie skoków (np. po zminimalizowaniu)
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // =========================================================================
  //  PRZEPŁYW EKRANÓW
  // =========================================================================
  const scrStart = document.getElementById('screen-start');
  const scrOver = document.getElementById('screen-over');

  function startGame() {
    Audio2.init();
    Audio2.startMusic();
    reset();
    scrStart.classList.add('hidden');
    scrOver.classList.add('hidden');
    state = 'playing';
    lastTs = 0;
    updateHud();
    requestAnimationFrame(loop);
  }

  function rankFor(s) {
    if (s >= 3000) return '👑 CTO — chmura Cię słucha!';
    if (s >= 1800) return '🏆 Senior FinOps Engineer';
    if (s >= 900)  return '💪 DevOps Specialist';
    if (s >= 400)  return '🙂 Junior z potencjałem';
    return '☕ Stażysta od rachunków';
  }

  function gameOver() {
    state = 'over';
    Audio2.bad();
    document.getElementById('final-savings').textContent = `$${Math.round(savings)}`;
    document.getElementById('final-wave').textContent = wave;
    document.getElementById('rank').textContent = rankFor(savings);
    scrOver.classList.remove('hidden');
  }

  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', startGame);

  // mute
  const muteBtn = document.getElementById('mute-btn');
  muteBtn.addEventListener('click', () => {
    Audio2.setMuted(!Audio2.muted);
    muteBtn.textContent = Audio2.muted ? '🔇' : '🔊';
  });

  // pierwszy render tła pod ekranem startowym (reset inicjalizuje tablice/gracza)
  reset();
  draw();
})();
