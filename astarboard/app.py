"""A*Board — study companion server (Python / Flask).

Serves the frontend in public/ and a small JSON API backed by SQLite.
Run locally with `python app.py`; in production use `gunicorn app:app`.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import date, datetime, timedelta

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix

from server import db, srs

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(ROOT, 'public')
SESSION_DAYS = 30
COOKIE = 'mg_session'  # name kept from earlier versions so existing sessions stay valid
SECURE_COOKIE = os.environ.get('FLASK_ENV') == 'production' or os.environ.get('NODE_ENV') == 'production'
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
MASTERED_DAYS = 21

app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path='')
app.json.ensure_ascii = False
app.json.sort_keys = False
if os.environ.get('TRUST_PROXY') == '1':
    # Behind a hosting platform's proxy (e.g. Render): take the visitor's IP from X-Forwarded-For.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
db.init()


# --------------------------------------------------------------------- helpers

class HttpError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(HttpError)
def handle_http_error(err):
    return jsonify(error=err.message), err.status


@app.errorhandler(404)
def handle_404(err):
    if request.path.startswith('/api/'):
        return jsonify(error='No such endpoint.'), 404
    return 'Not found', 404


@app.errorhandler(405)
def handle_405(err):
    return jsonify(error='Method not allowed.'), 405


@app.errorhandler(500)
def handle_500(err):
    return jsonify(error='Something went wrong on our side.'), 500


def conn():
    if 'db' not in g:
        g.db = db.connect()
    return g.db


@app.teardown_appcontext
def close_db(exc):
    c = g.pop('db', None)
    if c is not None:
        c.close()


def body():
    """The request's JSON body as a dict (empty dict when there is none)."""
    if request.content_length and request.content_length > 64 * 1024:
        raise HttpError(413, 'Request body too large')
    data = request.get_json(silent=True)
    if data is None:
        if request.get_data():
            raise HttpError(400, 'Invalid JSON')
        return {}
    if not isinstance(data, dict):
        raise HttpError(400, 'Invalid JSON')
    return data


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


# ------------------------------------------------------------------- passwords

def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f'scrypt${salt.hex()}${digest.hex()}'


def verify_password(password, stored):
    try:
        _, salt_hex, hash_hex = stored.split('$')
    except ValueError:
        return False
    expected = bytes.fromhex(hash_hex)
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=16384, r=8, p=1, dklen=len(expected))
    return hmac.compare_digest(expected, actual)


# -------------------------------------------------------------------- sessions

def create_session(user_id):
    token = secrets.token_urlsafe(32)
    with conn():
        conn().execute('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
                       (token, user_id, srs.now_ms() + SESSION_DAYS * srs.DAY))
    return token


def set_session_cookie(resp, token, max_age):
    resp.set_cookie(COOKIE, token, max_age=max_age, path='/', httponly=True, samesite='Lax', secure=SECURE_COOKIE)
    return resp


def current_user():
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    row = conn().execute('SELECT u.id, u.name, u.email, s.expires_at FROM sessions s '
                         'JOIN users u ON u.id = s.user_id WHERE s.token = ?', (token,)).fetchone()
    if not row:
        return None
    if row['expires_at'] < srs.now_ms():
        with conn():
            conn().execute('DELETE FROM sessions WHERE token = ?', (token,))
        return None
    return {'id': row['id'], 'name': row['name'], 'email': row['email'], 'token': token}


def require_user():
    u = current_user()
    if not u:
        raise HttpError(401, 'Please sign in first.')
    return u


# Simple in-memory throttle for sign-in and sign-up: 20 attempts per 10 minutes per IP.
_attempts = {}


def throttle():
    ip = request.remote_addr or 'unknown'
    now = time.time()
    n, since = _attempts.get(ip, (0, now))
    if now - since > 600:
        n, since = 0, now
    n += 1
    _attempts[ip] = (n, since)
    if n > 20:
        raise HttpError(429, 'Too many attempts. Try again in a few minutes.')


# ------------------------------------------------------- request-wide security

@app.before_request
def csrf_guard():
    # State-changing API calls must be same-origin JSON (a plain HTML form cannot send that).
    if request.path.startswith('/api/') and request.method not in ('GET', 'HEAD'):
        if 'application/json' not in (request.content_type or ''):
            raise HttpError(415, 'Send JSON.')


@app.after_request
def security_headers(resp):
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['Referrer-Policy'] = 'same-origin'
    resp.headers['X-Frame-Options'] = 'DENY'
    resp.headers['Content-Security-Policy'] = (
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'")
    if request.path.startswith('/api/'):
        resp.headers['Cache-Control'] = 'no-store'
    elif request.path.endswith('.html') or request.path in ('/', '/app'):
        resp.headers['Cache-Control'] = 'no-cache'
    return resp


# ---------------------------------------------------------------- points

GAME_COST = 5            # points per play
GAME_LEVELS = 5
GRAND_PRIZE = 30         # bonus points for beating the final level
MIN_LEVEL_MS = int(os.environ.get('GAME_MIN_LEVEL_MS', 10_000))  # a level cannot be cleared faster than this (basic cheat guard)
RUN_TTL_MS = 60 * 60 * 1000
# Champion badge tiers. Tier 1 is won by beating level 5; the rest are bought with points.
# 'lives' is how many lives a game run starts with at that tier.
BADGE_TIERS = [
    {'tier': 1, 'name': 'Rubber Stamp', 'cost': 0, 'lives': 3},
    {'tier': 2, 'name': 'Riso Sticker', 'cost': 20, 'lives': 3},
    {'tier': 3, 'name': 'Stitched Patch', 'cost': 40, 'lives': 4},
    {'tier': 4, 'name': 'Foil Seal', 'cost': 70, 'lives': 4},
    {'tier': 5, 'name': 'Holo Card', 'cost': 120, 'lives': 5},
]


def wallet(uid):
    """The learner's wallet row, created on first use."""
    with conn():
        conn().execute('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)', (uid,))
    return conn().execute('SELECT points, game_level, champion_at, badge_tier FROM wallets WHERE user_id = ?', (uid,)).fetchone()


def add_points(uid, delta, reason):
    """Change the balance by delta and log why. Call inside a `with conn():` block."""
    conn().execute('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)', (uid,))
    conn().execute('UPDATE wallets SET points = points + ? WHERE user_id = ?', (delta, uid))
    conn().execute('INSERT INTO points_log (user_id, delta, reason, at) VALUES (?, ?, ?, ?)',
                   (uid, delta, reason, srs.now_ms()))


def today_start_ms():
    return int(datetime.combine(date.today(), datetime.min.time()).timestamp() * 1000)


def earned_today(uid):
    return conn().execute("SELECT COALESCE(SUM(delta), 0) FROM points_log WHERE user_id = ? AND delta > 0 "
                          "AND reason IN ('review', 'quiz') AND at >= ?", (uid, today_start_ms())).fetchone()[0]


def game_state(uid):
    w = wallet(uid)
    return {'points': w['points'], 'level': w['game_level'], 'levels': GAME_LEVELS, 'cost': GAME_COST,
            'champion': w['champion_at'] is not None, 'grandPrize': GRAND_PRIZE, 'earnedToday': earned_today(uid),
            **badge_info(w['badge_tier'])}


def badge_info(tier):
    cur = BADGE_TIERS[tier - 1] if tier else None
    nxt = BADGE_TIERS[tier] if 0 < tier < len(BADGE_TIERS) else None
    return {'badge': {'tier': tier, 'name': cur['name'] if cur else None, 'max': len(BADGE_TIERS),
                      'next': {'tier': nxt['tier'], 'name': nxt['name'], 'cost': nxt['cost'], 'lives': nxt['lives']} if nxt else None},
            'lives': cur['lives'] if cur else 3}


# ------------------------------------------------------------------------ auth

@app.post('/api/auth/register')
def register():
    throttle()
    data = body()
    name = str(data.get('name', '')).strip()[:60]
    email = str(data.get('email', '')).strip().lower()
    password = str(data.get('password', ''))
    if not name:
        raise HttpError(400, 'Please tell us your name.')
    if not EMAIL_RE.match(email):
        raise HttpError(400, 'That email address does not look right.')
    if len(password) < 8:
        raise HttpError(400, 'Use a password of at least 8 characters.')
    if conn().execute('SELECT 1 FROM users WHERE email = ?', (email,)).fetchone():
        raise HttpError(409, 'An account with that email already exists.')
    with conn():
        uid = conn().execute('INSERT INTO users (name, email, pass_hash, created_at) VALUES (?, ?, ?, ?)',
                             (name, email, hash_password(password), srs.now_ms())).lastrowid
    resp = jsonify(user={'id': uid, 'name': name, 'email': email})
    resp.status_code = 201
    return set_session_cookie(resp, create_session(uid), SESSION_DAYS * 86400)


@app.post('/api/auth/login')
def login():
    throttle()
    data = body()
    user = conn().execute('SELECT * FROM users WHERE email = ?',
                          (str(data.get('email', '')).strip().lower(),)).fetchone()
    if not user or not verify_password(str(data.get('password', '')), user['pass_hash']):
        raise HttpError(401, 'Email or password is incorrect.')
    resp = jsonify(user={'id': user['id'], 'name': user['name'], 'email': user['email']})
    return set_session_cookie(resp, create_session(user['id']), SESSION_DAYS * 86400)


@app.post('/api/auth/logout')
def logout():
    u = current_user()
    if u:
        with conn():
            conn().execute('DELETE FROM sessions WHERE token = ?', (u['token'],))
    return set_session_cookie(jsonify(ok=True), '', 0)


@app.get('/api/me')
def me():
    u = current_user()
    return jsonify(user={'id': u['id'], 'name': u['name'], 'email': u['email']} if u else None)


# ------------------------------------------------------------------- catalogue

@app.get('/api/catalogue')
def catalogue():
    subjects = conn().execute('SELECT id, slug, name, symbol, blurb FROM subjects ORDER BY sort').fetchall()
    topics = conn().execute('SELECT subject_id, title FROM topics ORDER BY sort').fetchall()
    return jsonify(subjects=[{
        'slug': s['slug'], 'name': s['name'], 'symbol': s['symbol'], 'blurb': s['blurb'],
        'topics': [t['title'] for t in topics if t['subject_id'] == s['id']],
    } for s in subjects])


# ----------------------------------------------------------- dashboard/subject

def subject_stats(uid):
    now = srs.now_ms()
    rows = conn().execute("""
      SELECT s.slug, s.name, s.symbol, s.blurb,
        (SELECT COUNT(*) FROM topics t WHERE t.subject_id = s.id) AS topics,
        (SELECT COUNT(*) FROM cards c JOIN topics t ON t.id = c.topic_id WHERE t.subject_id = s.id) AS cards,
        (SELECT COUNT(*) FROM user_cards uc JOIN cards c ON c.id = uc.card_id JOIN topics t ON t.id = c.topic_id
           WHERE t.subject_id = s.id AND uc.user_id = ?) AS in_review,
        (SELECT COUNT(*) FROM user_cards uc JOIN cards c ON c.id = uc.card_id JOIN topics t ON t.id = c.topic_id
           WHERE t.subject_id = s.id AND uc.user_id = ? AND uc.interval_d >= ?) AS mastered,
        (SELECT COUNT(*) FROM user_cards uc JOIN cards c ON c.id = uc.card_id JOIN topics t ON t.id = c.topic_id
           WHERE t.subject_id = s.id AND uc.user_id = ? AND uc.due_at <= ?) AS due
      FROM subjects s ORDER BY s.sort""", (uid, uid, MASTERED_DAYS, uid, now)).fetchall()
    return [dict(r) for r in rows]


def streak_days(uid):
    rows = conn().execute('SELECT reviewed_at FROM review_log WHERE user_id = ? ORDER BY reviewed_at DESC LIMIT 5000',
                          (uid,)).fetchall()
    days = {datetime.fromtimestamp(r['reviewed_at'] / 1000).date() for r in rows}
    cursor = date.today()
    if cursor not in days:
        cursor -= timedelta(days=1)  # not having reviewed yet today keeps yesterday's streak alive
    n = 0
    while cursor in days:
        n += 1
        cursor -= timedelta(days=1)
    return n


def reviewed_today(uid):
    start = datetime.combine(date.today(), datetime.min.time()).timestamp() * 1000
    return conn().execute('SELECT COUNT(*) FROM review_log WHERE user_id = ? AND reviewed_at >= ?',
                          (uid, start)).fetchone()[0]


def get_topic(topic_id):
    t = conn().execute('SELECT t.*, s.slug AS subject_slug, s.name AS subject_name, s.symbol AS subject_symbol '
                       'FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.id = ?', (topic_id,)).fetchone()
    if not t:
        raise HttpError(404, 'Topic not found.')
    return t


@app.get('/api/dashboard')
def dashboard():
    u = require_user()
    subjects = subject_stats(u['id'])
    recent = conn().execute("""
      SELECT qa.score, qa.total, qa.created_at, t.id AS topic_id, t.title, s.name AS subject
      FROM quiz_attempts qa JOIN topics t ON t.id = qa.topic_id JOIN subjects s ON s.id = t.subject_id
      WHERE qa.user_id = ? ORDER BY qa.created_at DESC LIMIT 5""", (u['id'],)).fetchall()
    nxt = conn().execute("""
      SELECT t.id, t.title, s.name AS subject, s.slug AS subject_slug FROM topics t
      JOIN subjects s ON s.id = t.subject_id
      WHERE t.id NOT IN (SELECT topic_id FROM user_topics WHERE user_id = ?)
      ORDER BY s.sort, t.sort LIMIT 3""", (u['id'],)).fetchall()
    w = wallet(u['id'])
    return jsonify(user={'name': u['name']}, due=sum(s['due'] for s in subjects),
                   points=w['points'], champion=w['champion_at'] is not None, badge=badge_info(w['badge_tier'])['badge'], earnedToday=earned_today(u['id']),
                   reviewedToday=reviewed_today(u['id']), streak=streak_days(u['id']),
                   subjects=subjects, recent=[dict(r) for r in recent], next=[dict(r) for r in nxt])


@app.get('/api/subjects/<slug>')
def subject(slug):
    u = require_user()
    s = conn().execute('SELECT * FROM subjects WHERE slug = ?', (slug,)).fetchone()
    if not s:
        raise HttpError(404, 'Subject not found.')
    uid, now = u['id'], srs.now_ms()
    topics = conn().execute("""
      SELECT t.id, t.title, t.summary,
        (SELECT COUNT(*) FROM cards c WHERE c.topic_id = t.id) AS cards,
        (SELECT COUNT(*) FROM quiz_questions q WHERE q.topic_id = t.id) AS questions,
        (SELECT previewed_at FROM user_topics ut WHERE ut.topic_id = t.id AND ut.user_id = ?) AS previewed_at,
        (SELECT COUNT(*) FROM user_cards uc JOIN cards c ON c.id = uc.card_id
           WHERE c.topic_id = t.id AND uc.user_id = ? AND uc.due_at <= ?) AS due,
        (SELECT COUNT(*) FROM user_cards uc JOIN cards c ON c.id = uc.card_id
           WHERE c.topic_id = t.id AND uc.user_id = ? AND uc.interval_d >= ?) AS mastered,
        (SELECT MAX(CAST(score AS REAL) / total) FROM quiz_attempts qa WHERE qa.topic_id = t.id AND qa.user_id = ?) AS best
      FROM topics t WHERE t.subject_id = ? ORDER BY t.sort""",
                          (uid, uid, now, uid, MASTERED_DAYS, uid, s['id'])).fetchall()
    return jsonify(subject={'slug': s['slug'], 'name': s['name'], 'symbol': s['symbol'], 'blurb': s['blurb']},
                   topics=[dict(t) for t in topics])


# ------------------------------------------------------------ topics and quiz

@app.get('/api/topics/<int:topic_id>')
def topic(topic_id):
    u = require_user()
    t = get_topic(topic_id)
    prev = conn().execute('SELECT previewed_at FROM user_topics WHERE user_id = ? AND topic_id = ?',
                          (u['id'], t['id'])).fetchone()
    cards = conn().execute('SELECT COUNT(*) FROM cards WHERE topic_id = ?', (t['id'],)).fetchone()[0]
    questions = conn().execute('SELECT COUNT(*) FROM quiz_questions WHERE topic_id = ?', (t['id'],)).fetchone()[0]
    return jsonify(topic={
        'id': t['id'], 'title': t['title'], 'summary': t['summary'],
        'subject': {'slug': t['subject_slug'], 'name': t['subject_name'], 'symbol': t['subject_symbol']},
        'primer': json.loads(t['primer_json']), 'terms': json.loads(t['terms_json']),
        'questions': json.loads(t['questions_json']),
        'cards': cards, 'quizLength': questions, 'previewedAt': prev['previewed_at'] if prev else None,
    })


@app.post('/api/topics/<int:topic_id>/preview')
def mark_preview(topic_id):
    u = require_user()
    t = get_topic(topic_id)
    now = srs.now_ms()
    with conn():
        conn().execute('INSERT OR IGNORE INTO user_topics (user_id, topic_id, previewed_at) VALUES (?, ?, ?)',
                       (u['id'], t['id'], now))
        # Every card of this topic joins the learner's review deck, due straight away.
        added = conn().execute('INSERT OR IGNORE INTO user_cards (user_id, card_id, due_at) '
                               'SELECT ?, id, ? FROM cards WHERE topic_id = ?', (u['id'], now, t['id'])).rowcount
    return jsonify(ok=True, added=added)


@app.get('/api/topics/<int:topic_id>/quiz')
def quiz(topic_id):
    require_user()
    t = get_topic(topic_id)
    qs = conn().execute('SELECT id, prompt, options_json FROM quiz_questions WHERE topic_id = ? ORDER BY id',
                        (t['id'],)).fetchall()
    return jsonify(topic={'id': t['id'], 'title': t['title'], 'subject': t['subject_name']},
                   questions=[{'id': q['id'], 'prompt': q['prompt'], 'options': json.loads(q['options_json'])} for q in qs])


@app.post('/api/topics/<int:topic_id>/quiz')
def mark_quiz(topic_id):
    u = require_user()
    t = get_topic(topic_id)
    answers = body().get('answers') or {}
    if not isinstance(answers, dict):
        raise HttpError(400, 'Answers must be an object.')
    qs = conn().execute('SELECT id, answer, explanation FROM quiz_questions WHERE topic_id = ? ORDER BY id',
                        (t['id'],)).fetchall()
    results, score = [], 0
    for q in qs:
        chosen = answers.get(str(q['id']))
        chosen = chosen if is_int(chosen) else None
        correct = chosen == q['answer']
        score += correct
        results.append({'id': q['id'], 'chosen': chosen, 'answer': q['answer'],
                        'correct': correct, 'explanation': q['explanation']})
    first_today = not conn().execute('SELECT 1 FROM quiz_attempts WHERE user_id = ? AND topic_id = ? AND created_at >= ?',
                                     (u['id'], t['id'], today_start_ms())).fetchone()
    earned = len(qs) if first_today else 0
    with conn():
        conn().execute('INSERT INTO quiz_attempts (user_id, topic_id, score, total, created_at) VALUES (?, ?, ?, ?, ?)',
                       (u['id'], t['id'], score, len(qs), srs.now_ms()))
        if earned:
            add_points(u['id'], earned, 'quiz')
    return jsonify(score=score, total=len(qs), results=results, earned=earned, points=wallet(u['id'])['points'])


# ------------------------------------------------------------- spaced review

@app.get('/api/review')
def review_due():
    u = require_user()
    now = srs.now_ms()
    params = [u['id'], now]
    extra = ''
    subject_slug = request.args.get('subject')
    if subject_slug:
        extra = 'AND s.slug = ?'
        params.append(subject_slug)
    rows = conn().execute(f"""
      SELECT c.id, c.front, c.back, uc.ease, uc.interval_d, uc.reps, t.title AS topic, s.name AS subject, s.symbol
      FROM user_cards uc JOIN cards c ON c.id = uc.card_id JOIN topics t ON t.id = c.topic_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE uc.user_id = ? AND uc.due_at <= ? {extra}
      ORDER BY uc.due_at LIMIT 30""", params).fetchall()
    return jsonify(cards=[{
        'id': r['id'], 'front': r['front'], 'back': r['back'], 'topic': r['topic'],
        'subject': r['subject'], 'symbol': r['symbol'], 'next': srs.preview(dict(r), now),
    } for r in rows])


@app.post('/api/review/<int:card_id>')
def review_grade(card_id):
    u = require_user()
    grade = body().get('grade')
    if not is_int(grade) or grade not in (0, 1, 2, 3):
        raise HttpError(400, 'Grade must be 0, 1, 2 or 3.')
    state = conn().execute('SELECT ease, interval_d, reps FROM user_cards WHERE user_id = ? AND card_id = ?',
                           (u['id'], card_id)).fetchone()
    if not state:
        raise HttpError(404, 'That card is not in your review deck.')
    now = srs.now_ms()
    nxt = srs.schedule(dict(state), grade, now)
    with conn():
        conn().execute('UPDATE user_cards SET ease = ?, interval_d = ?, reps = ?, due_at = ?, last_grade = ? '
                       'WHERE user_id = ? AND card_id = ?',
                       (nxt['ease'], nxt['interval_d'], nxt['reps'], nxt['due_at'], grade, u['id'], card_id))
        conn().execute('INSERT INTO review_log (user_id, card_id, grade, reviewed_at) VALUES (?, ?, ?, ?)',
                       (u['id'], card_id, grade, now))
        add_points(u['id'], 1, 'review')
    return jsonify(ok=True, dueAt=nxt['due_at'], earned=1, points=wallet(u['id'])['points'])


# ----------------------------------------------------------------------- game

def active_run(uid, run_id):
    run = conn().execute('SELECT * FROM game_runs WHERE id = ? AND user_id = ?', (str(run_id), uid)).fetchone()
    if not run or run['ended_at'] is not None or srs.now_ms() - run['started_at'] > RUN_TTL_MS:
        raise HttpError(409, 'That game has ended. Start a new one.')
    return run


@app.get('/api/game')
def game_info():
    u = require_user()
    return jsonify(game_state(u['id']))


@app.post('/api/game/start')
def game_start():
    u = require_user()
    w = wallet(u['id'])
    if w['points'] < GAME_COST:
        raise HttpError(402, f"You need {GAME_COST} points to play. Answer {GAME_COST - w['points']} more questions to earn them.")
    run_id = secrets.token_urlsafe(12)
    now = srs.now_ms()
    with conn():
        conn().execute('UPDATE game_runs SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL', (now, u['id']))
        add_points(u['id'], -GAME_COST, 'game')
        conn().execute('INSERT INTO game_runs (id, user_id, level, started_at, last_clear_at) VALUES (?, ?, ?, ?, ?)',
                       (run_id, u['id'], w['game_level'], now, now))
    return jsonify(runId=run_id, **game_state(u['id']))


@app.post('/api/game/clear')
def game_clear():
    u = require_user()
    data = body()
    run = active_run(u['id'], data.get('runId'))
    level = data.get('level')
    if not is_int(level) or level != run['level']:
        raise HttpError(400, 'That is not the level you are playing.')
    now = srs.now_ms()
    if now - run['last_clear_at'] < MIN_LEVEL_MS:
        raise HttpError(400, 'That was too fast to count. Play the level properly.')
    w = wallet(u['id'])
    prize = False
    with conn():
        if level >= GAME_LEVELS:
            # Final level: grand prize the first time, then the game starts over at level 1.
            prize = w['champion_at'] is None
            if prize:
                add_points(u['id'], GRAND_PRIZE, 'grand prize')
                conn().execute('UPDATE wallets SET champion_at = ?, badge_tier = MAX(badge_tier, 1) WHERE user_id = ?', (now, u['id']))
            conn().execute('UPDATE wallets SET game_level = 1 WHERE user_id = ?', (u['id'],))
            conn().execute('UPDATE game_runs SET ended_at = ?, last_clear_at = ? WHERE id = ?', (now, now, run['id']))
        else:
            conn().execute('UPDATE wallets SET game_level = MAX(game_level, ?) WHERE user_id = ?', (level + 1, u['id']))
            conn().execute('UPDATE game_runs SET level = ?, last_clear_at = ? WHERE id = ?', (level + 1, now, run['id']))
    return jsonify(cleared=level, nextLevel=None if level >= GAME_LEVELS else level + 1,
                   grandPrizeAwarded=prize, **game_state(u['id']))


@app.post('/api/badge/upgrade')
def badge_upgrade():
    u = require_user()
    w = wallet(u['id'])
    tier = w['badge_tier']
    if tier < 1:
        raise HttpError(403, 'Beat level 5 first to win the champion badge.')
    if tier >= len(BADGE_TIERS):
        raise HttpError(409, 'Your badge is already at the top tier.')
    nxt = BADGE_TIERS[tier]
    if w['points'] < nxt['cost']:
        raise HttpError(402, f"You need {nxt['cost']} points for {nxt['name']} ({nxt['cost'] - w['points']} more).")
    with conn():
        # The tier check in WHERE stops a double click from buying the same tier twice.
        cur = conn().execute('UPDATE wallets SET badge_tier = badge_tier + 1 WHERE user_id = ? AND badge_tier = ? AND points >= ?',
                             (u['id'], tier, nxt['cost']))
        if cur.rowcount:
            add_points(u['id'], -nxt['cost'], f"badge tier {nxt['tier']}")
    if not cur.rowcount:
        raise HttpError(409, 'Your badge changed in the meantime. Refresh and try again.')
    return jsonify(upgraded=nxt['tier'], **game_state(u['id']))


@app.post('/api/game/end')
def game_end():
    u = require_user()
    run_id = body().get('runId')
    with conn():
        conn().execute('UPDATE game_runs SET ended_at = ? WHERE id = ? AND user_id = ? AND ended_at IS NULL',
                       (srs.now_ms(), str(run_id), u['id']))
    return jsonify(ok=True, **game_state(u['id']))


# --------------------------------------------------------------------- pages

@app.get('/')
def index_page():
    return send_from_directory(PUBLIC_DIR, 'index.html')


@app.get('/app')
def app_page():
    return send_from_directory(PUBLIC_DIR, 'app.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f'A*Board running at http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)
