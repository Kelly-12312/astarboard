/* A*Board — single-page app (hash router, vanilla JS). */
'use strict';

const view = document.getElementById('view');
const nav = document.getElementById('nav');
let me = null;
let cleanup = null; // per-view teardown (e.g. keyboard listeners)
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------- utilities */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    me = null;
    renderNav();
    location.hash = '#/login';
    throw new Error('auth');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function setView(html, title) {
  view.innerHTML = html;
  document.title = title ? `${title} — A*Board` : 'A*Board';
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/* ------------------------------------------------------------------- nav */

let dueCount = 0;
let points = null; // reward points, shown in the nav once known
function setPoints(p, earned) {
  if (typeof p !== 'number') return;
  points = p;
  const chip = document.getElementById('ptsChip');
  if (chip) {
    chip.textContent = `${p} pts`;
    if (!REDUCED) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
  }
  if (earned > 0) popPoints(earned);
}
function popPoints(n, at) {
  const el = document.createElement('div');
  el.className = 'pts-pop';
  el.textContent = `+${n}`;
  el.setAttribute('aria-hidden', 'true');
  const chip = document.getElementById('ptsChip');
  const r = at || (chip ? chip.getBoundingClientRect() : { left: innerWidth - 120, top: 20, width: 60, height: 20 });
  el.style.left = (r.left + r.width / 2) + 'px';
  el.style.top = (r.top + r.height + 6) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
// Champion badge: tier 1 is won in the game, tiers 2-5 are bought with points.
function badgeHtml(b, id) {
  if (!b || !b.tier) return '';
  return `<span class="badge-chip tier-${b.tier}"${id ? ` id="${id}"` : ''}>${badgeArt(b.tier, 30, false)}<span>${esc(b.name)}</span></span>`;
}
const badgeArt = (tier, size, label) => (window.AStarBadges ? window.AStarBadges.svg(tier, size, label) : '');
const BADGE_LADDER = [
  { tier: 1, name: 'Rubber Stamp', how: 'Beat level 5', lives: 3, note: 'Rough navy ink' },
  { tier: 2, name: 'Riso Sticker', cost: 20, lives: 3, note: 'Die-cut, off-register' },
  { tier: 3, name: 'Stitched Patch', cost: 40, lives: 4, note: 'Embroidered twill' },
  { tier: 4, name: 'Foil Seal', cost: 70, lives: 4, note: 'Embossed gold' },
  { tier: 5, name: 'Holo Card', cost: 120, lives: 5, note: 'Shifting rainbow' },
];

function renderNav() {
  const here = location.hash || '#/';
  const cur = (prefix) => (here === prefix || (prefix !== '#/' && here.startsWith(prefix)) ? ' aria-current="page"' : '');
  if (!me) {
    nav.innerHTML = `<a href="/">Home</a><a href="#/login"${cur('#/login')}>Sign in</a>
      <a class="btn btn-small" href="#/register">Subscribe free</a>`;
    return;
  }
  nav.innerHTML = `
    <a href="#/"${cur('#/')}>Board</a>
    <a href="#/subjects"${cur('#/subject')}>Subjects</a>
    <a href="#/review"${cur('#/review')}>Review${dueCount ? `<span class="badge" aria-label="${dueCount} due">${dueCount}</span>` : ''}</a>
    <a href="#/game"${cur('#/game')} class="nav-game">Game<span class="pts-chip" id="ptsChip">${points ?? 0} pts</span></a>
    <span class="label" style="text-transform:none">${esc(me.name)}</span>
    <button class="btn btn-small" id="logout" type="button">Sign out</button>`;
  document.getElementById('logout').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    me = null;
    points = null;
    location.hash = '#/login';
    renderNav();
  };
}

/* ----------------------------------------------------------------- views */

function authView(mode) {
  const isReg = mode === 'register';
  setView(`
    <div class="auth stack" style="gap:32px">
      <div class="page-head" style="margin:0">
        <span class="crumbs">${isReg ? 'New subscriber' : 'Welcome back'}</span>
        <h1>${isReg ? 'Start your<br><span class="accent">first issue.</span>' : 'Welcome<br><span class="accent">back.</span>'}</h1>
      </div>
      <form class="box stack" id="authForm" novalidate style="gap:22px">
        ${isReg ? `<div class="field"><label for="name">Your name</label><input id="name" name="name" autocomplete="name" required maxlength="60"></div>` : ''}
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Password${isReg ? ' (8+ characters)' : ''}</label>
          <input id="password" name="password" type="password" autocomplete="${isReg ? 'new-password' : 'current-password'}" required minlength="${isReg ? 8 : 1}"></div>
        <p class="error" id="authError" role="alert"></p>
        <button class="btn btn-yellow" type="submit">${isReg ? 'Create my notebook' : 'Sign in'}</button>
      </form>
      <p class="muted">${isReg ? 'Already enrolled? <a href="#/login">Sign in</a>.' : 'New here? <a href="#/register">Create a free account</a>.'}</p>
    </div>`, isReg ? 'Create account' : 'Sign in');

  const form = document.getElementById('authForm');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const { user } = await api(isReg ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body });
      me = user;
      location.hash = '#/';
    } catch (err) {
      document.getElementById('authError').textContent = err.message;
      btn.disabled = false;
    }
  };
}

function progressBar(inReview, mastered, total) {
  return `<div class="progress" role="img" aria-label="${mastered} of ${total} cards mastered, ${inReview} in review">
    <span class="p-review" data-w="${pct(inReview, total)}"></span><span class="p-master" data-w="${pct(mastered, total)}"></span></div>`;
}
function applyBars() {
  // Two frames later, so the bars grow from empty instead of appearing full.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    view.querySelectorAll('.progress span[data-w]').forEach((s) => { s.style.width = s.dataset.w + '%'; });
  }));
}

function subjectCard(s, i) {
  const tilt = i % 3 === 1 ? ' tilt-r' : i % 3 === 2 ? ' tilt-l' : '';
  return `
    <a class="box subject-tile${tilt}" href="#/subject/${esc(s.slug)}">
      <div class="row between" style="align-items:flex-start"><span class="sym">${esc(s.name)}</span>${s.due ? `<span class="chip chip-yellow">${s.due} due</span>` : ''}</div>
      <p class="muted" style="font-size:15px">${esc(s.blurb)}</p>
      ${progressBar(s.in_review, s.mastered, s.cards)}
      <span class="label" style="font-size:11px">${s.mastered}/${s.cards} mastered · ${s.topics} topics</span>
    </a>`;
}

async function dashboardView() {
  const d = await api('/api/dashboard');
  dueCount = d.due;
  points = d.points ?? points;
  renderNav();
  const playable = (d.points ?? 0) >= 5;
  setView(`
    <div class="page-head">
      <span class="crumbs">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <h1>${greeting()},<br><span class="accent">${esc(d.user.name)}.</span></h1>
    </div>

    <div class="grid" style="margin-bottom:56px">
      <div class="box box-yellow stack">
        <span class="step-tag">Due now</span>
        <span class="stat"><span class="num accent">${d.due}</span><span class="muted">${d.due === 1 ? 'card' : 'cards'} ready for review</span></span>
        ${d.due ? '<a class="btn btn-yellow" href="#/review">Start review</a>' : '<p class="hand" style="font-size:28px">Nothing due. Preview a new topic ↓</p>'}
      </div>
      <div class="box stack tilt-r">
        <span class="step-tag">Reviewed today</span>
        <span class="stat"><span class="num">${d.reviewedToday}</span><span class="muted">answers from memory</span></span>
      </div>
      <div class="box stack tilt-l">
        <span class="step-tag">Streak</span>
        <span class="stat"><span class="num">${d.streak}</span><span class="muted">${d.streak === 1 ? 'day' : 'days'} in a row</span></span>
      </div>
    </div>

    <div class="box box-pink-soft game-promo" style="margin-bottom:56px">
      <div class="stack" style="gap:8px;flex:1 1 280px">
        <span class="step-tag">Reward points ${badgeHtml(d.badge)}</span>
        <span class="stat"><span class="num">${d.points ?? 0}</span><span class="muted">points · +${d.earnedToday ?? 0} earned today</span></span>
        <p class="muted" style="font-size:15px;margin:0">+1 per review card · +1 per quiz question (first try of a topic each day) · 5 points = one run of Print Breaker.</p>
      </div>
      ${d.badge && d.badge.tier ? `<a class="promo-badge" href="#/game" aria-label="Your badge: ${esc(d.badge.name)}">${badgeArt(d.badge.tier, 104, false)}</a>` : ''}
      <a class="btn ${playable ? 'btn-yellow' : ''}" href="#/game">${playable ? 'Play Print Breaker' : 'See the game'}</a>
    </div>

    <div class="row" style="align-items:flex-start;gap:48px;margin-bottom:56px">
      <div class="stack" style="flex:1 1 360px">
        <h2 class="h2" style="font-size:32px">Preview next</h2>
        ${d.next.length ? `<ul class="list">${d.next.map((t) => `
          <li><span><span class="label" style="display:block">${esc(t.subject)}</span><a href="#/topic/${t.id}" class="hand" style="font-size:30px;text-decoration:none">${esc(t.title)}</a></span>
          <a class="btn btn-small" href="#/topic/${t.id}">Preview</a></li>`).join('')}</ul>`
          : '<p class="empty">Every topic previewed. Impressive.</p>'}
      </div>
      <div class="stack" style="flex:1 1 360px">
        <h2 class="h2" style="font-size:32px">Recent papers</h2>
        ${d.recent.length ? `<ul class="list">${d.recent.map((r) => `
          <li><span><span class="label" style="display:block">${esc(r.subject)}</span><a href="#/topic/${r.topic_id}/quiz" style="text-decoration:none">${esc(r.title)}</a></span>
          <span class="hand accent" style="font-size:34px">${r.score}/${r.total}</span></li>`).join('')}</ul>`
          : '<p class="empty">No practice papers sat yet.</p>'}
      </div>
    </div>

    <div class="row between" style="margin-bottom:24px">
      <h2 class="h2" style="font-size:32px">Your subjects</h2>
      <div class="legend"><span><i class="l-review"></i>In review</span><span><i class="l-master"></i>Mastered (21+ day interval)</span></div>
    </div>
    <div class="grid-3">${d.subjects.map(subjectCard).join('')}</div>`, 'Board');
  applyBars();
}

async function subjectsView() {
  const d = await api('/api/dashboard');
  dueCount = d.due;
  renderNav();
  setView(`
    <div class="page-head"><span class="crumbs">The syllabus</span><h1>Subjects</h1></div>
    <div class="grid-3">${d.subjects.map(subjectCard).join('')}</div>`, 'Subjects');
  applyBars();
}

async function subjectView(slug) {
  const { subject: s, topics } = await api(`/api/subjects/${encodeURIComponent(slug)}`);
  setView(`
    <div class="page-head">
      <span class="crumbs"><a href="#/subjects">Subjects</a> / ${esc(s.name)}</span>
      <div class="row" style="gap:28px;align-items:flex-end">
        <span class="hand accent" style="font-size:clamp(96px,12vw,160px);font-weight:700;line-height:0.75">${esc(s.symbol)}</span>
        <h1>${esc(s.name)}</h1>
      </div>
      <p class="muted" style="font-size:20px;max-width:60ch">${esc(s.blurb)}</p>
    </div>
    <div class="stack" style="gap:24px">
      ${topics.map((t, i) => `
        <article class="box ${i % 2 ? 'tilt-r' : ''}" style="display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:center">
          <div class="stack" style="flex:999 1 420px;min-width:0">
            <span class="step-tag">Topic ${String(i + 1).padStart(2, '0')}</span>
            <h3>${esc(t.title)}</h3>
            <p class="muted">${esc(t.summary)}</p>
            <div class="row" style="gap:8px">
              ${t.previewed_at ? '<span class="chip chip-yellow">✓ Previewed</span>' : '<span class="chip">Not previewed</span>'}
              <span class="chip">${t.cards} cards</span>
              ${t.due ? `<span class="chip chip-yellow">${t.due} due</span>` : ''}
              ${t.mastered ? `<span class="chip">${t.mastered} mastered</span>` : ''}
              ${t.best != null ? `<span class="chip">Best paper ${Math.round(t.best * 100)}%</span>` : ''}
            </div>
          </div>
          <div class="btn-row" style="flex:1 1 220px;justify-content:flex-end">
            <a class="btn ${t.previewed_at ? '' : 'btn-yellow'}" href="#/topic/${t.id}">${t.previewed_at ? 'Reread primer' : 'Preview'}</a>
            <a class="btn" href="#/topic/${t.id}/quiz">Practice paper</a>
          </div>
        </article>`).join('')}
    </div>
    <div class="row" style="margin-top:40px">
      <a class="btn btn-solid" href="#/review/${esc(s.slug)}">Review ${esc(s.name)} cards</a>
    </div>`, s.name);
}

function topicTabs(t, active) {
  return `<nav class="tabs" role="tablist" aria-label="Topic sections">
    <a role="tab" href="#/topic/${t.id}" aria-selected="${active === 'preview'}">Preview</a>
    <a role="tab" href="#/topic/${t.id}/quiz" aria-selected="${active === 'quiz'}">Practice paper</a>
  </nav>`;
}

async function topicView(id) {
  const { topic: t } = await api(`/api/topics/${Number(id)}`);
  setView(`
    <div class="page-head">
      <span class="crumbs"><a href="#/subjects">Subjects</a> / <a href="#/subject/${esc(t.subject.slug)}">${esc(t.subject.name)}</a></span>
      <h1>${esc(t.title)}</h1>
      <p class="muted" style="font-size:20px;max-width:60ch">${esc(t.summary)}</p>
    </div>
    ${topicTabs(t, 'preview')}
    <div class="primer">
      <div class="primer-main">
        ${t.primer.map((sec) => `<div><h2>${esc(sec.heading)}</h2><p>${esc(sec.body)}</p></div>`).join('')}
        <div class="box-dashed stack" id="previewBox">
          ${t.previewedAt
            ? `<p class="hand accent" style="font-size:34px">✓ Previewed — ${t.cards} cards are in your review deck.</p>
               <div class="btn-row"><a class="btn btn-yellow" href="#/review/${esc(t.subject.slug)}">Review now</a><a class="btn" href="#/topic/${t.id}/quiz">Sit the practice paper</a></div>`
            : `<p class="hand" style="font-size:32px">Done reading? Hand in the preview and ${t.cards} flashcards join your review deck.</p>
               <div class="btn-row"><button class="btn btn-yellow" id="markPreview" type="button">I've previewed this topic</button></div>`}
        </div>
      </div>
      <aside class="primer-side">
        <div class="box box-yellow questions stack">
          <span class="step-tag">Carry into the lecture</span>
          <ol>${t.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
        </div>
        <div class="stack">
          <span class="label">Key terms</span>
          <table class="terms"><tbody>${t.terms.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
        </div>
      </aside>
    </div>`, t.title);

  const btn = document.getElementById('markPreview');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    try {
      const r = await api(`/api/topics/${t.id}/preview`, { method: 'POST', body: {} });
      toast(`${r.added} cards added to your deck`);
      topicView(t.id);
    } catch (e) { btn.disabled = false; toast(e.message); }
  };
}

async function quizView(id) {
  const q = await api(`/api/topics/${Number(id)}/quiz`);
  const t = { id: q.topic.id };
  setView(`
    <div class="page-head">
      <span class="crumbs"><a href="#/subjects">Subjects</a> / ${esc(q.topic.subject)}</span>
      <h1>${esc(q.topic.title)}</h1>
    </div>
    ${topicTabs(t, 'quiz')}
    <div class="row between" style="margin-bottom:28px;max-width:880px">
      <span class="label">A Level practice · ${q.questions.length} questions · 1 mark each</span>
      <span class="hand muted" style="font-size:26px">no notes. no peeking.</span>
    </div>
    <form class="quiz" id="quiz">
      ${q.questions.map((qq, i) => `
        <fieldset data-q="${qq.id}">
          <legend>Question ${i + 1}</legend>
          <p class="q-prompt">${esc(qq.prompt)}</p>
          ${qq.options.map((o, j) => `
            <label class="option" data-opt="${j}"><input type="radio" name="q${qq.id}" value="${j}" required><span>${esc(o)}</span></label>`).join('')}
          <div class="verdict" hidden></div>
        </fieldset>`).join('')}
      <div class="row" id="quizFoot">
        <button class="btn btn-yellow" type="submit">Hand in paper</button>
        <span class="error" id="quizError" role="alert"></span>
      </div>
    </form>`, `${q.topic.title} — paper`);

  const form = document.getElementById('quiz');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const answers = {};
    let missing = 0;
    q.questions.forEach((qq) => {
      const sel = form.querySelector(`input[name="q${qq.id}"]:checked`);
      if (sel) answers[qq.id] = Number(sel.value); else missing += 1;
    });
    if (missing) { document.getElementById('quizError').textContent = `${missing} question${missing > 1 ? 's' : ''} left blank.`; return; }
    const r = await api(`/api/topics/${t.id}/quiz`, { method: 'POST', body: { answers } });
    r.results.forEach((res) => {
      const fs = form.querySelector(`fieldset[data-q="${res.id}"]`);
      fs.querySelectorAll('input').forEach((inp) => { inp.disabled = true; });
      fs.querySelector(`[data-opt="${res.answer}"]`).classList.add('is-correct');
      if (!res.correct && res.chosen != null) fs.querySelector(`[data-opt="${res.chosen}"]`).classList.add('is-wrong');
      const v = fs.querySelector('.verdict');
      v.hidden = false;
      v.className = 'verdict ' + (res.correct ? 'ok' : 'no');
      v.textContent = (res.correct ? '✓ ' : '✗ ') + res.explanation;
    });
    document.getElementById('quizFoot').outerHTML = `
      <div class="box box-yellow row between" style="gap:24px">
        <div class="row" style="gap:20px;align-items:flex-end"><span class="score">${r.score}/${r.total}</span>
          <span class="hand" style="font-size:32px">${r.score === r.total ? 'full marks.' : r.score >= r.total / 2 ? 'solid — review the misses.' : 'reread the primer, then try again.'}</span></div>
        <p class="pts-line">${r.earned ? `<strong>+${r.earned} points</strong> for this paper` : 'No points this time: points come from the first sitting of a topic each day'} · <a href="#/game">${r.points ?? points ?? 0} pts → play</a></p>
        <div class="btn-row"><a class="btn" href="#/topic/${t.id}">Back to primer</a><a class="btn btn-solid" href="#/topic/${t.id}/quiz" id="retry">Sit it again</a></div>
      </div>`;
    setPoints(r.points, r.earned);
    document.getElementById('retry').onclick = (ev) => { ev.preventDefault(); quizView(t.id); };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

// Rough self-check: share of the model answer's key words found in what the
// learner typed. Only a hint; the learner still picks the grade.
const STOP = new Set('the and for are was were that this with from into its it is be by of to in on at as an or a which when what how why who than then them they their there these those has have had not but can will would also only each per using used use one'.split(' '));
function keywords(text) {
  return (text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [])
    .filter((w) => /\p{N}/u.test(w) || (w.length > 2 && !STOP.has(w)));
}
function suggestGrade(typed, answer) {
  const mine = keywords(typed);
  if (!mine.length) return 0;
  const want = [...new Set(keywords(answer))];
  if (!want.length) return 2;
  const has = (w) => mine.some((m) => m === w || (w.length > 4 && m.length > 4 && m.slice(0, 5) === w.slice(0, 5)));
  const share = want.filter(has).length / want.length;
  return share < 0.25 ? 0 : share < 0.55 ? 1 : 2;
}

async function reviewView(subject) {
  const { cards } = await api('/api/review' + (subject ? `?subject=${encodeURIComponent(subject)}` : ''));
  const queue = cards.slice();
  const total = queue.length;
  let done = 0;
  let revealed = false;
  let typed = '';

  if (!total) {
    dueCount = 0; renderNav();
    setView(`
      <div class="review cta" style="padding-top:40px">
        <span class="label">Review${subject ? ' · ' + esc(subject) : ''}</span>
        <h1 class="h2-hand">All caught up.</h1>
        <p class="muted" style="font-size:20px">No cards are due right now. Preview a new topic to add more, or come back later.</p>
        <div class="btn-row" style="justify-content:center"><a class="btn btn-yellow" href="#/">Back to my issue</a><a class="btn" href="#/subjects">Browse subjects</a></div>
      </div>`, 'Review');
    return;
  }

  const render = () => {
    const c = queue[0];
    if (!c) {
      setView(`
        <div class="review cta" style="padding-top:40px">
          <span class="label">Session complete</span>
          <h1 class="h2-hand">${done} answered<br><span class="accent">from memory.</span></h1>
          <p class="muted" style="font-size:20px">Each card is now scheduled for the moment you're about to forget it.</p>
          <a class="btn btn-yellow" href="#/">Back to my issue</a>
        </div>`, 'Review');
      dueCount = 0; renderNav();
      return;
    }
    const labels = ['Again', 'Hard', 'Good', 'Easy'];
    const suggest = revealed ? suggestGrade(typed, c.back) : null;
    setView(`
      <div class="review">
        <div class="row between">
          <span class="label">${esc(c.symbol)} · ${esc(c.subject)} · ${esc(c.topic)}</span>
          <span class="label">${Math.min(done + 1, total)} / ${total}</span>
        </div>
        <div class="progress"><span class="p-master" data-w="${pct(done, total)}"></span></div>
        <div class="flash${revealed ? ' is-revealed' : ''}">
          <p class="front">${esc(c.front)}</p>
          ${revealed
            ? `<div class="compare">
                 <div class="stack"><span class="label">Your answer</span>
                   <p class="mine${typed ? '' : ' is-empty'}">${typed ? esc(typed) : 'No answer typed'}</p></div>
                 <div class="stack"><span class="label accent">Model answer</span>
                   <p class="back">${esc(c.back)}</p></div>
               </div>`
            : `<form class="answer-form" id="answerForm">
                 <label class="label" for="answerBox">Type your answer</label>
                 <textarea id="answerBox" rows="3" placeholder="Write it from memory…">${esc(typed)}</textarea>
                 <div class="btn-row">
                   <button type="submit" class="btn btn-yellow">Check answer <span class="kbd">enter</span></button>
                   <button type="button" class="btn" id="skip">I don't know</button>
                 </div>
               </form>`}
        </div>
        ${revealed
          ? `<p class="label" style="text-align:center">Compare the two, then grade yourself${suggest != null ? ` · suggested: <span class="accent">${labels[suggest]}</span>` : ''}</p>
             <div class="grades">${labels.map((l, g) => `
               <button type="button" class="grade grade-${l.toLowerCase()}${g === suggest ? ' is-suggested' : ''}" data-g="${g}">${l}<small>${esc(c.next[g])} <span class="kbd">${g + 1}</span></small></button>`).join('')}</div>`
          : `<p class="hand muted" style="font-size:26px;text-align:center">shift + enter for a new line.</p>`}
      </div>`, 'Review');
    applyBars();
    const form = document.getElementById('answerForm');
    if (form) {
      const box = document.getElementById('answerBox');
      form.onsubmit = (e) => { e.preventDefault(); typed = box.value.trim(); reveal(); };
      box.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
      document.getElementById('skip').onclick = () => { typed = ''; reveal(); };
      box.focus();
    }
    view.querySelectorAll('.grade').forEach((b) => { b.onclick = () => grade(Number(b.dataset.g)); });
    const sug = view.querySelector('.grade.is-suggested');
    if (sug) sug.focus();
  };

  const reveal = () => { if (!revealed) { revealed = true; render(); } };
  let busy = false;
  const grade = async (g) => {
    if (busy || !revealed) return;
    busy = true;
    const card = view.querySelector('.flash');
    if (card && !REDUCED) {
      card.classList.add(g === 0 ? 'fly-again' : 'fly-out');
      await wait(g === 0 ? 300 : 240);
    }
    const c = queue.shift();
    try {
      const res = await api(`/api/review/${c.id}`, { method: 'POST', body: { grade: g } });
      setPoints(res.points, res.earned);
      if (g === 0) queue.push({ ...c, next: c.next }); // see it again this session
      else done += 1;
    } catch (e) { queue.unshift(c); toast(e.message); }
    revealed = false;
    typed = '';
    busy = false;
    render();
  };

  const onKey = (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (revealed && ['1', '2', '3', '4'].includes(e.key)) grade(Number(e.key) - 1);
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => document.removeEventListener('keydown', onKey);
  render();
}

/* ------------------------------------------------------------ reward game */

async function gameView() {
  let g = await api('/api/game');
  setPoints(g.points);
  const NAMES = (window.PrintBreaker && window.PrintBreaker.LEVELS) || ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'];
  let runId = null;
  let busy = false;
  let game = null;

  setView(`
    <div class="game-head">
      <div>
        <span class="crumbs">Reward game · ${g.cost} points a run</span>
        <h1 class="game-title">Print <span class="accent">Breaker.</span></h1>
      </div>
      <div class="row" style="gap:10px;align-items:baseline">
        <span class="game-points" id="gamePoints">${g.points}</span><span class="muted">points</span>
        <span id="champSlot">${badgeHtml(g.badge)}</span>
      </div>
      <ol class="level-track" id="levelTrack" aria-label="Levels"></ol>
    </div>

    <div class="game-wrap" id="gameWrap">
      <div class="game-hud" aria-live="polite">
        <span id="hudLevel">Level 1</span><span id="hudLives">♥♥♥</span><span id="hudBricks"></span>
      </div>
      <canvas id="gameCanvas" tabindex="0" width="800" height="520" aria-label="Print Breaker game. Move with the mouse or arrow keys; click or press Space to launch the ball."></canvas>
      <div class="game-overlay" id="gameOverlay"></div>
    </div>

    <div class="grid" style="margin-top:40px">
      <div class="box stack">
        <span class="step-tag">Earn points</span>
        <p style="margin:0">+1 for every review card you grade.<br>+1 for every quiz question, on the first sitting of a topic each day.</p>
      </div>
      <div class="box stack tilt-r">
        <span class="step-tag">Play</span>
        <p style="margin:0">${g.cost} points buys a run with <span id="rulesLives">${g.lives}</span> lives. Move with the mouse, finger or ← →; click, tap or Space to launch. Cleared levels are saved as checkpoints.</p>
      </div>
      <div class="box box-yellow stack tilt-l">
        <span class="step-tag">Grand prize</span>
        <p style="margin:0">Beat level 5, <em>${esc(NAMES[4])}</em>, for <strong>+${g.grandPrize} points</strong> and the A* Champion badge. Then spend points to upgrade it.</p>
      </div>
    </div>

    <section class="badge-panel box" id="badgePanel" aria-labelledby="badgeTitle"></section>`, 'Print Breaker');

  const overlay = document.getElementById('gameOverlay');
  const wrap = document.getElementById('gameWrap');
  const fx = window.AStarFX || { burstAt() {}, confetti() {}, buzz() {} };

  const drawTrack = (current) => {
    document.getElementById('levelTrack').innerHTML = NAMES.map((n, i) => {
      const lv = i + 1;
      const cls = lv < current ? 'done' : lv === current ? 'current' : 'locked';
      return `<li class="${cls}${lv === 5 ? ' prize' : ''}" title="${esc(n)}"><span>${lv === 5 ? '★' : lv}</span><em>${esc(n)}</em></li>`;
    }).join('');
  };
  const refresh = (state) => {
    g = { ...g, ...state };
    document.getElementById('gamePoints').textContent = g.points;
    document.getElementById('champSlot').innerHTML = badgeHtml(g.badge);
    document.getElementById('rulesLives').textContent = g.lives;
    if (game) game.opts.lives = g.lives;
    setPoints(g.points);
    renderBadge();
  };

  const panel = document.getElementById('badgePanel');
  const renderBadge = () => {
    const b = g.badge || { tier: 0 };
    const nxt = b.next;
    const ladder = BADGE_LADDER.map((t) => {
      const st = t.tier <= b.tier ? 'owned' : (nxt && t.tier === nxt.tier) ? 'next' : 'locked';
      const price = t.tier === 1 ? t.how : `${t.cost} pts`;
      return `<li class="${st}"><span class="medal-art">${badgeArt(t.tier, 112, false)}</span>
        <strong>${esc(t.name)}</strong><small>${esc(t.note)}</small><small class="price">${st === 'owned' ? '✓ Owned' : esc(price)} · ${t.lives} lives</small></li>`;
    }).join('');
    let action;
    if (!b.tier) action = `<p class="muted" style="margin:0">Locked. Beat level 5 to win the badge, then upgrade it here.</p>`;
    else if (!nxt) action = `<p style="margin:0"><strong>Top tier reached.</strong> Your badge is fully printed.</p>`;
    else {
      const short = nxt.cost - g.points;
      action = `<button class="btn ${short > 0 ? '' : 'btn-yellow'}" type="button" id="upgradeBtn"${short > 0 ? ' disabled' : ''}>Upgrade to ${esc(nxt.name)} · ${nxt.cost} pts</button>
        <p class="muted" style="margin:0">${short > 0 ? `${short} more point${short === 1 ? '' : 's'} needed. ` : ''}${nxt.lives > g.lives ? `Unlocks ${nxt.lives} lives per run.` : 'A new finish for your badge.'}</p>`;
    }
    panel.innerHTML = `
      <div class="row between" style="gap:12px;align-items:baseline">
        <h2 class="h2" id="badgeTitle" style="margin:0;font-size:34px">Champion badge</h2>
        <span class="label">Tier ${b.tier || 0} / ${BADGE_LADDER.length}</span>
      </div>
      <ol class="badge-ladder">${ladder}</ol>
      <div class="row" style="gap:16px">${action}</div>`;
    const btn = document.getElementById('upgradeBtn');
    if (btn) btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await api('/api/badge/upgrade', { method: 'POST', body: {} });
        refresh(r);
        toast(`Badge upgraded: ${r.badge.name}`);
        const owned = panel.querySelectorAll('.badge-ladder li.owned');
        const last = owned[owned.length - 1];
        if (last) { last.classList.add('just'); fx.burstAt(last, 30); }
        fx.confetti(panel, 4); fx.buzz();
      } catch (e) { if (e.message !== 'auth') { toast(e.message); btn.disabled = false; } }
    };
  };
  const show = (html) => { overlay.innerHTML = html; overlay.hidden = false; overlay.classList.remove('pop'); void overlay.offsetWidth; overlay.classList.add('pop'); };
  const hide = () => { overlay.hidden = true; };
  const playBtn = (label) => (g.points >= g.cost
    ? `<button class="btn btn-yellow" type="button" data-act="play">${label} · ${g.cost} pts</button>`
    : `<p class="muted" style="margin:0">You need ${g.cost - g.points} more point${g.cost - g.points === 1 ? '' : 's'}.</p><a class="btn" href="#/review">Earn points in Review</a>`);

  const startScreen = () => {
    drawTrack(g.level);
    show(`<span class="step-tag">Level ${g.level} of 5</span>
      <h2 class="h2">${esc(NAMES[g.level - 1])}</h2>
      <p class="muted">${g.level > 1 ? 'You continue from your checkpoint.' : 'Clear every brick to move on.'}</p>
      <div class="btn-row">${playBtn('Play')}</div>`);
  };

  game = new PrintBreaker(document.getElementById('gameCanvas'), {
    level: g.level,
    lives: g.lives || 3,
    reduced: REDUCED,
    onHud(h) {
      document.getElementById('hudLevel').textContent = `Level ${h.level} · ${h.levelName}`;
      document.getElementById('hudLives').textContent = '♥'.repeat(Math.max(0, h.lives)) || '—';
      document.getElementById('hudBricks').textContent = `${h.bricks} bricks`;
    },
    async onClear(level) {
      fx.burstAt(wrap, 30); fx.buzz();
      try {
        const r = await api('/api/game/clear', { method: 'POST', body: { runId, level } });
        refresh(r);
        if (r.nextLevel) {
          drawTrack(r.nextLevel);
          show(`<span class="step-tag">Level ${level} cleared</span>
            <h2 class="h2">Next: ${esc(NAMES[r.nextLevel - 1])}</h2>
            <p class="muted">Checkpoint saved. Your lives carry over.</p>
            <div class="btn-row"><button class="btn btn-yellow" type="button" data-act="next" data-level="${r.nextLevel}">Level ${r.nextLevel} →</button></div>`);
          return;
        }
        runId = null;
        drawTrack(6);
        if (r.grandPrizeAwarded) {
          show(`<div class="prize-stamp">${badgeArt(1, 128, 'Rubber Stamp champion badge')}</div>
            <span class="step-tag">Grand prize</span>
            <h2 class="h2">Champion!</h2>
            <p><strong>+${g.grandPrize} points</strong> and the A* Champion badge are yours.</p>
            <div class="btn-row"><button class="btn btn-yellow" type="button" data-act="badge">Upgrade my badge ↓</button>${playBtn('Play again')}</div>`);
          overlay.classList.add('is-prize');
          fx.confetti(wrap, 10);
          popPoints(g.grandPrize, document.getElementById('gamePoints').getBoundingClientRect());
        } else {
          show(`<span class="step-tag">All five cleared</span>
            <h2 class="h2">Beaten again.</h2>
            <p class="muted">The grand prize is a one-off, but the glory isn't. The board resets to level 1.</p>
            <div class="btn-row">${playBtn('Play again')}</div>`);
          fx.confetti(wrap, 4);
        }
        g.level = 1;
      } catch (e) {
        if (e.message === 'auth') return;
        show(`<span class="step-tag">Not counted</span><h2 class="h2">Hmm.</h2><p class="muted">${esc(e.message)}</p>
          <div class="btn-row">${runId ? `<button class="btn btn-yellow" type="button" data-act="next" data-level="${level}">Replay level ${level}</button>` : playBtn('Play')}</div>`);
      }
    },
    async onOver(level) {
      const id = runId;
      runId = null;
      try { refresh(await api('/api/game/end', { method: 'POST', body: { runId: id } })); } catch (e) { /* ignore */ }
      g.level = Math.max(1, Math.min(5, level));
      drawTrack(g.level);
      show(`<span class="step-tag">Out of ink</span>
        <h2 class="h2">Game over.</h2>
        <p class="muted">Your checkpoint is level ${g.level}, <em>${esc(NAMES[g.level - 1])}</em>.</p>
        <div class="btn-row">${playBtn('Try again')}</div>`);
    },
  });

  overlay.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || busy) return;
    busy = true;
    b.disabled = true;
    try {
      if (b.dataset.act === 'play') {
        const r = await api('/api/game/start', { method: 'POST', body: {} });
        runId = r.runId;
        refresh(r);
        g.level = r.level;
        drawTrack(r.level);
        overlay.classList.remove('is-prize');
        hide();
        game.start(r.level);
        wrap.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
        document.getElementById('gameCanvas').focus({ preventScroll: true });
      } else if (b.dataset.act === 'badge') {
        panel.scrollIntoView({ block: 'center', behavior: REDUCED ? 'auto' : 'smooth' });
        b.disabled = false;
      } else if (b.dataset.act === 'next') {
        hide();
        game.nextLevel(Number(b.dataset.level));
      }
    } catch (err) {
      if (err.message !== 'auth') { toast(err.message); b.disabled = false; }
    } finally { busy = false; }
  });

  startScreen();
  renderBadge();
  cleanup = () => {
    game.destroy();
    if (runId) api('/api/game/end', { method: 'POST', body: { runId } }).catch(() => {});
  };
}

/* ---------------------------------------------------------------- router */

async function router() {
  if (cleanup) { cleanup(); cleanup = null; }
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  const publicRoute = parts[0] === 'login' || parts[0] === 'register';

  if (!me && !publicRoute) { location.hash = '#/login'; return; }
  if (me && publicRoute) { location.hash = '#/'; return; }
  renderNav();
  if (me && points === null) api('/api/game').then((g) => setPoints(g.points)).catch(() => {});

  try {
    if (parts[0] === 'login') return authView('login');
    if (parts[0] === 'register') return authView('register');
    if (!parts.length) return await dashboardView();
    if (parts[0] === 'subjects') return await subjectsView();
    if (parts[0] === 'subject' && parts[1]) return await subjectView(parts[1]);
    if (parts[0] === 'topic' && parts[1] && parts[2] === 'quiz') return await quizView(parts[1]);
    if (parts[0] === 'topic' && parts[1]) return await topicView(parts[1]);
    if (parts[0] === 'review') return await reviewView(parts[1]);
    if (parts[0] === 'game') return await gameView();
    setView('<div class="cta" style="padding-top:40px"><h1 class="h2-hand">Page not found.</h1><a class="btn" href="#/">Back to my issue</a></div>', 'Not found');
  } catch (err) {
    if (err.message === 'auth') return;
    setView(`<div class="cta" style="padding-top:40px"><h1 class="h2-hand">Misprint.</h1><p class="muted">${esc(err.message)}</p><a class="btn" href="#/">Back to my issue</a></div>`, 'Error');
  }
}

(async function boot() {
  try { ({ user: me } = await api('/api/me')); } catch { me = null; }
  window.addEventListener('hashchange', router);
  router();
})();
