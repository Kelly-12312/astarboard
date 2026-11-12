/* A*Board interaction effects: ink bursts on press, tilting glass cards,
   landing parallax and number count-ups. Everything is skipped for people
   who ask for reduced motion. */
(function () {
  'use strict';
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  const reduce = mq('(prefers-reduced-motion: reduce)');
  const fine = mq('(pointer: fine)');
  const INKS = ['#E0218A', '#0078BF', '#FFE600', '#1D2B6B'];

  function burst(x, y, n) {
    if (reduce) return;
    const wrap = document.createElement('div');
    wrap.className = 'fx-burst';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.left = x + 'px';
    wrap.style.top = y + 'px';
    for (let i = 0; i < n; i++) {
      const dot = document.createElement('i');
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = 28 + Math.random() * 46;
      dot.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px');
      dot.style.setProperty('--dy', (Math.sin(a) * d).toFixed(1) + 'px');
      dot.style.setProperty('--s', (5 + Math.random() * 7).toFixed(1) + 'px');
      dot.style.background = INKS[i % INKS.length];
      wrap.appendChild(dot);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 700);
  }
  const burstAt = (el, n) => { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, n); };
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* not supported */ } };
  // Confetti: several bursts spread across an element (used by the game).
  const confetti = (el, rounds) => {
    if (reduce) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < (rounds || 6); i++) {
      setTimeout(() => burst(r.left + Math.random() * r.width, r.top + Math.random() * r.height * 0.7, 22), i * 140);
    }
  };
  window.AStarFX = { burst, burstAt, confetti, buzz };

  // Press feedback: ink burst + a tiny haptic tap on phones.
  const PUNCH = '.btn, .grade, .option, .tabs a, .subject-tile, .nav a';
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest && e.target.closest(PUNCH);
    if (!t) return;
    burst(e.clientX, e.clientY, t.matches('.btn-yellow, .grade') ? 16 : 10);
    buzz();
  }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.btn, .grade')) burstAt(e.target, 14);
    if (['1', '2', '3', '4'].includes(e.key) && !(e.target.closest && e.target.closest('input, textarea'))) {
      const g = document.querySelector(`.grade[data-g="${Number(e.key) - 1}"]`);
      if (g) burstAt(g, 16);
    }
  });

  // Glass cards tilt toward the pointer, with a glare that follows it.
  if (fine && !reduce) {
    const SEL = '.grid > .box, .grid-3 > .box, .subject-tile, .z-glass, .z-steps .stack';
    let current = null;
    const reset = (el) => { if (el) { el.style.transform = ''; el.classList.remove('fx-tilt'); } };
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest ? e.target.closest(SEL) : null;
      if (el !== current) { reset(current); current = el; }
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('fx-tilt');
      el.style.transform = `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateY(-4px)`;
      el.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
    }, { passive: true });
    document.addEventListener('pointerleave', () => { reset(current); current = null; });

    // Landing: riso shapes drift against the pointer.
    window.addEventListener('pointermove', (e) => {
      const cover = document.querySelector('.z-cover');
      if (!cover) return;
      cover.style.setProperty('--px', (e.clientX / window.innerWidth - 0.5).toFixed(3));
      cover.style.setProperty('--py', (e.clientY / window.innerHeight - 0.5).toFixed(3));
    }, { passive: true });
  }

  // Numbers count up when they appear; a perfect score earns a big burst.
  function countUp(el) {
    if (el.dataset.counted) return;
    const m = el.textContent.trim().match(/^(\d+)(\/(\d+))?$/);
    if (!m) return;
    el.dataset.counted = '1';
    const target = Number(m[1]);
    const suffix = m[2] || '';
    const perfect = m[3] && target === Number(m[3]) && target > 0;
    if (reduce || target === 0) { if (perfect) burstAt(el, 28); return; }
    const t0 = performance.now();
    const dur = Math.min(900, 300 + target * 60);
    el.textContent = '0' + suffix;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))) + suffix;
      if (k < 1) requestAnimationFrame(step);
      else if (perfect) { burstAt(el, 28); buzz(); }
    };
    requestAnimationFrame(step);
  }
  function watch() {
    const view = document.getElementById('view');
    if (!view) return;
    const scan = () => view.querySelectorAll('.stat .num, .score').forEach(countUp);
    new MutationObserver(scan).observe(view, { childList: true, subtree: true });
    scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
