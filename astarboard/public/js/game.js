/* Print Breaker — the A*Board reward game.
   A canvas brick-breaker in five levels, drawn like a two-colour riso print.
   The page (app.js) owns points, runs and overlays; this file only plays. */
(function () {
  'use strict';

  const W = 800, H = 520;
  const C = { paper: '#F4F0E8', paper2: '#EAE4D8', ink: '#1D2B6B', pink: '#E0218A', blue: '#0078BF', yellow: '#FFE600', over: '#001067' };
  // Bricks: p pink, b blue, y yellow (1 hit) · N navy (2 hits) · X overprint (3 hits) · . empty
  const LEVELS = [
    { name: 'Warm-up', speed: 5.0, rows: ['pppppppppp', 'bbbbbbbbbb', 'yyyyyyyyyy', 'pppppppppp'] },
    { name: 'Checkerboard', speed: 5.6, rows: ['NNNNNNNNNN', 'pbpbpbpbpb', 'bpbpbpbpbp', 'ypypypypyp', 'pypypypypy'] },
    { name: 'Pyramid', speed: 6.2, rows: ['....NN....', '...NppN...', '..NbbbbN..', '.NyyyyyyN.', 'NppppppppN'] },
    { name: 'Zigzag', speed: 6.8, rows: ['N.N.N.N.N.', 'pNpNpNpNpN', 'b.b.b.b.b.', 'yXyXyXyXyX', 'p.p.p.p.p.', 'NbNbNbNbNb'] },
    { name: 'The A*', speed: 7.4, rows: ['..XXXX..y.', '.XX..XXyyy', '.XX..XX.y.', '.XXXXXX...', '.XX..XX...', '.XX..XX...'] },
  ];
  const COLS = 10, BRICK_GAP = 6, SIDE = 40, TOP = 64, BRICK_H = 24;
  const BRICK_W = (W - SIDE * 2 - BRICK_GAP * (COLS - 1)) / COLS;
  const HITS = { p: 1, b: 1, y: 1, N: 2, X: 3 };
  const FILL = { p: C.pink, b: C.blue, y: C.yellow, N: C.ink, X: C.over };

  class PrintBreaker {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = Object.assign({ lives: 3, reduced: false, onHud() {}, onClear() {}, onOver() {} }, opts);
      this.state = 'idle';      // idle · ready · playing · cleared · over
      this.particles = [];
      this.trail = [];
      this.shake = 0;
      this.keys = { left: false, right: false };
      this.raf = 0;
      this.last = 0;
      this.dotPattern = this.makeDots();
      this.resize();

      this.onPointer = (e) => {
        const r = this.canvas.getBoundingClientRect();
        this.paddle.target = ((e.clientX - r.left) / r.width) * W;
      };
      this.onDown = (e) => { this.onPointer(e); this.launch(); };
      this.onKey = (e) => {
        if (e.target.closest && e.target.closest('input, textarea')) return;
        const down = e.type === 'keydown';
        if (e.key === 'ArrowLeft' || e.key === 'a') { this.keys.left = down; e.preventDefault(); }
        if (e.key === 'ArrowRight' || e.key === 'd') { this.keys.right = down; e.preventDefault(); }
        if (down && (e.key === ' ' || e.key === 'ArrowUp') && (this.state === 'ready' || this.state === 'playing')) { e.preventDefault(); this.launch(); }
      };
      this.onResize = () => this.resize();
      canvas.addEventListener('pointermove', this.onPointer);
      canvas.addEventListener('pointerdown', this.onDown);
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKey);
      window.addEventListener('resize', this.onResize);

      this.load(this.opts.level || 1, true);
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    makeDots() {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(224, 33, 138, 0.10)';
      x.beginPath(); x.arc(8, 8, 2.2, 0, Math.PI * 2); x.fill();
      return this.ctx.createPattern(c, 'repeat');
    }

    /* Set up a level. preview=true shows it without a live ball. */
    load(level, preview) {
      this.level = Math.max(1, Math.min(LEVELS.length, level));
      const L = LEVELS[this.level - 1];
      this.baseSpeed = L.speed;
      this.bricks = [];
      L.rows.forEach((row, r) => [...row].forEach((ch, c) => {
        if (!HITS[ch]) return;
        this.bricks.push({ x: SIDE + c * (BRICK_W + BRICK_GAP), y: TOP + r * (BRICK_H + BRICK_GAP), w: BRICK_W, h: BRICK_H, kind: ch, hits: HITS[ch], max: HITS[ch], flash: 0 });
      }));
      this.paddle = { x: W / 2, target: W / 2, w: 120, h: 14, y: H - 42, squash: 0 };
      this.lives = preview ? this.opts.lives : this.lives ?? this.opts.lives;
      this.resetBall();
      this.state = preview ? 'idle' : 'ready';
      this.hud();
    }

    start(level) {
      this.lives = this.opts.lives;
      this.load(level, false);
    }

    nextLevel(level) {
      this.load(level, false);   // lives carry over within a run
    }

    resetBall() {
      this.ball = { x: this.paddle.x, y: this.paddle.y - 16, vx: 0, vy: 0, r: 9, stuck: true, speed: this.baseSpeed };
      this.trail = [];
    }

    launch() {
      if (this.state === 'ready') this.state = 'playing';
      if (this.state !== 'playing' || !this.ball.stuck) return;
      const a = (Math.random() * 0.6 - 0.3);
      this.ball.vx = Math.sin(a) * this.ball.speed;
      this.ball.vy = -Math.cos(a) * this.ball.speed;
      this.ball.stuck = false;
    }

    hud() {
      this.opts.onHud({ level: this.level, levelName: LEVELS[this.level - 1].name, lives: this.lives, bricks: this.bricks.length, state: this.state });
    }

    burst(x, y, color, n) {
      const count = this.opts.reduced ? Math.ceil(n / 3) : n;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 4.5;
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 1, size: 3 + Math.random() * 5, color });
      }
    }

    kick(amount) { if (!this.opts.reduced) this.shake = Math.max(this.shake, amount); }

    update(k) {
      const p = this.paddle;
      if (this.keys.left) p.target -= 11 * k;
      if (this.keys.right) p.target += 11 * k;
      p.target = Math.max(p.w / 2, Math.min(W - p.w / 2, p.target));
      p.x += (p.target - p.x) * Math.min(1, 0.35 * k);
      p.squash *= Math.pow(0.85, k);

      const b = this.ball;
      if (b.stuck) { b.x = p.x; b.y = p.y - 16; }
      else if (this.state === 'playing') {
        const steps = Math.ceil(b.speed / 3);
        for (let s = 0; s < steps && this.state === 'playing'; s++) this.step(k / steps);
        this.trail.push({ x: b.x, y: b.y });
        if (this.trail.length > 10) this.trail.shift();
      }

      for (const q of this.particles) { q.x += q.vx * k; q.y += q.vy * k; q.vy += 0.18 * k; q.life -= 0.025 * k; }
      this.particles = this.particles.filter((q) => q.life > 0);
      for (const br of this.bricks) br.flash = Math.max(0, br.flash - 0.08 * k);
      this.shake *= Math.pow(0.86, k);
    }

    step(k) {
      const b = this.ball, p = this.paddle;
      b.x += b.vx * k; b.y += b.vy * k;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }

      // Paddle: the further from centre you hit, the sharper the angle.
      if (b.vy > 0 && b.y + b.r >= p.y && b.y - b.r <= p.y + p.h && b.x >= p.x - p.w / 2 - b.r && b.x <= p.x + p.w / 2 + b.r) {
        const off = Math.max(-1, Math.min(1, (b.x - p.x) / (p.w / 2)));
        b.speed = Math.min(this.baseSpeed * 1.35, b.speed * 1.015);
        const a = off * (Math.PI / 3);
        b.vx = Math.sin(a) * b.speed; b.vy = -Math.cos(a) * b.speed;
        b.y = p.y - b.r;
        p.squash = 1;
        this.burst(b.x, p.y, C.ink, 5);
      }

      // Bricks
      for (const br of this.bricks) {
        const cx = Math.max(br.x, Math.min(b.x, br.x + br.w));
        const cy = Math.max(br.y, Math.min(b.y, br.y + br.h));
        const dx = b.x - cx, dy = b.y - cy;
        if (dx * dx + dy * dy > b.r * b.r) continue;
        const overlapX = b.r - Math.abs(dx), overlapY = b.r - Math.abs(dy);
        if (dx === 0 && dy === 0) b.vy = -b.vy;
        else if (overlapX < overlapY) { b.vx = dx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx); }
        else { b.vy = dy > 0 ? Math.abs(b.vy) : -Math.abs(b.vy); }
        br.hits -= 1;
        br.flash = 1;
        if (br.hits <= 0) {
          this.burst(br.x + br.w / 2, br.y + br.h / 2, FILL[br.kind], 14);
          this.burst(br.x + br.w / 2, br.y + br.h / 2, C.yellow, 4);
          this.kick(7);
          this.bricks.splice(this.bricks.indexOf(br), 1);
          this.hud();
          if (!this.bricks.length) {
            this.state = 'cleared';
            this.burst(b.x, b.y, C.pink, 30); this.burst(b.x, b.y, C.blue, 30);
            this.kick(12);
            this.hud();
            this.opts.onClear(this.level);
          }
        } else {
          this.burst(b.x, b.y, C.paper, 6);
          this.kick(3);
        }
        break;
      }

      // Ball lost
      if (b.y - b.r > H) {
        this.lives -= 1;
        this.kick(14);
        this.burst(b.x, H - 6, C.pink, 18);
        if (this.lives <= 0) {
          this.state = 'over';
          this.hud();
          this.opts.onOver(this.level);
        } else {
          this.resetBall();
          this.state = 'ready';
          this.hud();
        }
      }
    }

    draw() {
      const x = this.ctx;
      x.save();
      x.fillStyle = C.paper; x.fillRect(0, 0, W, H);
      x.fillStyle = this.dotPattern; x.fillRect(0, 0, W, H);
      if (this.shake > 0.3) x.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

      // bricks with a misregistered pink/blue shadow
      for (const br of this.bricks) {
        x.fillStyle = br.kind === 'p' ? C.blue : C.pink;
        x.globalAlpha = 0.55;
        x.fillRect(br.x + 4, br.y + 4, br.w, br.h);
        x.globalAlpha = 1;
        x.fillStyle = FILL[br.kind];
        x.fillRect(br.x, br.y, br.w, br.h);
        if (br.max > 1) {   // cracks show remaining hits
          x.strokeStyle = 'rgba(244,240,232,0.85)'; x.lineWidth = 2;
          for (let i = 0; i < br.max - br.hits; i++) {
            x.beginPath(); x.moveTo(br.x + 10 + i * 18, br.y + 3); x.lineTo(br.x + 18 + i * 18, br.y + br.h / 2); x.lineTo(br.x + 12 + i * 18, br.y + br.h - 3); x.stroke();
          }
        }
        if (br.flash > 0) { x.fillStyle = `rgba(255,255,255,${br.flash * 0.8})`; x.fillRect(br.x, br.y, br.w, br.h); }
        x.strokeStyle = C.ink; x.lineWidth = 2; x.strokeRect(br.x, br.y, br.w, br.h);
      }

      // paddle: an ink roller that squashes on impact
      const p = this.paddle, sq = p.squash;
      const pw = p.w * (1 + sq * 0.12), ph = p.h * (1 - sq * 0.3);
      x.fillStyle = C.pink; x.fillRect(p.x - pw / 2 + 5, p.y + 5, pw, ph);
      x.fillStyle = C.ink; x.fillRect(p.x - pw / 2, p.y, pw, ph);
      x.fillStyle = C.yellow; x.fillRect(p.x - pw / 2 + 8, p.y + 3, pw - 16, 2);

      // ball trail and ball (a yellow star-ball)
      this.trail.forEach((t, i) => {
        x.globalAlpha = (i + 1) / this.trail.length * 0.35;
        x.fillStyle = i % 2 ? C.pink : C.blue;
        x.beginPath(); x.arc(t.x, t.y, this.ball.r * ((i + 4) / 14), 0, Math.PI * 2); x.fill();
      });
      x.globalAlpha = 1;
      const b = this.ball;
      x.fillStyle = C.yellow; x.strokeStyle = C.ink; x.lineWidth = 2.5;
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? b.r * 0.55 : b.r * 1.25, a = -Math.PI / 2 + i * Math.PI / 5;
        x[i ? 'lineTo' : 'moveTo'](b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
      }
      x.closePath(); x.fill(); x.stroke();

      for (const q of this.particles) {
        x.globalAlpha = Math.max(0, q.life);
        x.fillStyle = q.color;
        x.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      x.globalAlpha = 1;

      if (this.state === 'ready' && this.ball.stuck) {
        x.fillStyle = C.ink; x.font = '16px "Rubik Mono One", "Arial Black", sans-serif'; x.textAlign = 'center';
        x.fillText('CLICK, TAP OR PRESS SPACE TO LAUNCH', W / 2, H - 80);
      }
      x.restore();
    }

    loop(t) {
      const dt = this.last ? Math.min(50, t - this.last) : 16.7;
      this.last = t;
      if (!document.hidden) this.update(dt / 16.7);
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      this.canvas.removeEventListener('pointermove', this.onPointer);
      this.canvas.removeEventListener('pointerdown', this.onDown);
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('keyup', this.onKey);
      window.removeEventListener('resize', this.onResize);
    }
  }

  PrintBreaker.LEVELS = LEVELS.map((l) => l.name);
  window.PrintBreaker = PrintBreaker;
})();
