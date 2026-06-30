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

  // =========================================================================
  //  AUDIO — proste blipy z WebAudio (z wyciszeniem)
  // =========================================================================
  const Audio2 = {
    ctx: null,
    muted: false,
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
  let bullets, enemies, powerups, particles, tickets, floaters;
  let player, savings, bill, wave, elapsed, spawnTimer, ticketTimer;
  let fireCooldown, rapidUntil, lastTs;

  function reset() {
    bullets = [];
    enemies = [];
    powerups = [];
    particles = [];
    tickets = [];
    floaters = []; // teksty "+$" itp.
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
      savings += total;
      spawnParticles(W / 2, H / 2, '#f1c40f', 50);
      for (const e of enemies) spawnParticles(e.x, e.y, '#2ecc71', 6);
      enemies = [];
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
      b.y += b.vy * dt;
      if (b.y < -10) bullets.splice(i, 1);
    }

    // --- spawnowanie wrogów ---
    spawnTimer -= dt;
    const spawnEvery = Math.max(0.42, 1.15 - wave * 0.07);
    if (spawnTimer <= 0) {
      spawnEnemy();
      if (wave > 4 && Math.random() < 0.3) spawnEnemy();
      spawnTimer = spawnEvery * (0.7 + Math.random() * 0.6);
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

    // pociski
    for (const b of bullets) {
      ctx.save();
      ctx.shadowColor = '#9fe0ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#cdeeff';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r, b.r * 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // gracz — Adididi
    drawPlayer();

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
    Audio2.muted = !Audio2.muted;
    muteBtn.textContent = Audio2.muted ? '🔇' : '🔊';
  });

  // pierwszy render tła pod ekranem startowym
  draw();
})();
