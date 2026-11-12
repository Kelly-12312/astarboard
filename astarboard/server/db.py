"""SQLite access: schema, connections and seeding of the course content."""
import json
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get('DATA_DIR', ROOT.parent / 'data'))
DB_PATH = Path(os.environ.get('DB_PATH', DATA_DIR / 'astarboard.db'))
CONTENT_PATH = ROOT / 'content.json'

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  slug    TEXT NOT NULL UNIQUE,
  name    TEXT NOT NULL,
  symbol  TEXT NOT NULL,
  blurb   TEXT NOT NULL,
  sort    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id     INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL,
  primer_json    TEXT NOT NULL,
  terms_json     TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  sort           INTEGER NOT NULL,
  UNIQUE (subject_id, slug)
);
CREATE TABLE IF NOT EXISTS cards (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id  INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  front     TEXT NOT NULL,
  back      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quiz_questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id     INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  prompt       TEXT NOT NULL,
  options_json TEXT NOT NULL,
  answer       INTEGER NOT NULL,
  explanation  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_topics (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id     INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  previewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, topic_id)
);
CREATE TABLE IF NOT EXISTS user_cards (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  ease        REAL    NOT NULL DEFAULT 2.5,
  interval_d  REAL    NOT NULL DEFAULT 0,
  reps        INTEGER NOT NULL DEFAULT 0,
  due_at      INTEGER NOT NULL,
  last_grade  INTEGER,
  PRIMARY KEY (user_id, card_id)
);
CREATE TABLE IF NOT EXISTS review_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grade       INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallets (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  points       INTEGER NOT NULL DEFAULT 0,
  game_level   INTEGER NOT NULL DEFAULT 1,   -- furthest level reached (checkpoint), 1-5
  champion_at  INTEGER,                      -- when the final level was first beaten
  badge_tier   INTEGER NOT NULL DEFAULT 0     -- champion badge tier: 0 none, 1 earned, 2-5 bought upgrades
);
CREATE TABLE IF NOT EXISTS points_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta   INTEGER NOT NULL,
  reason  TEXT NOT NULL,
  at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_runs (
  id            TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level         INTEGER NOT NULL,             -- the level being played now
  started_at    INTEGER NOT NULL,
  last_clear_at INTEGER NOT NULL,
  ended_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_user_cards_due ON user_cards (user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_review_log_user ON review_log (user_id, reviewed_at);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def seed(conn: sqlite3.Connection) -> None:
    """Load content.json into the database, only when it holds no subjects yet."""
    if conn.execute('SELECT COUNT(*) FROM subjects').fetchone()[0]:
        return
    subjects = json.loads(CONTENT_PATH.read_text(encoding='utf-8'))['subjects']
    with conn:  # one transaction
        for si, s in enumerate(subjects):
            sid = conn.execute('INSERT INTO subjects (slug, name, symbol, blurb, sort) VALUES (?, ?, ?, ?, ?)',
                               (s['slug'], s['name'], s['symbol'], s['blurb'], si)).lastrowid
            for ti, t in enumerate(s['topics']):
                tid = conn.execute(
                    'INSERT INTO topics (subject_id, slug, title, summary, primer_json, terms_json, questions_json, sort) '
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    (sid, t['slug'], t['title'], t['summary'], json.dumps(t['primer']),
                     json.dumps(t['terms']), json.dumps(t['questions']), ti)).lastrowid
                conn.executemany('INSERT INTO cards (topic_id, front, back) VALUES (?, ?, ?)',
                                 [(tid, front, back) for front, back in t['cards']])
                conn.executemany(
                    'INSERT INTO quiz_questions (topic_id, prompt, options_json, answer, explanation) VALUES (?, ?, ?, ?, ?)',
                    [(tid, q['prompt'], json.dumps(q['options']), q['answer'], q['explanation']) for q in t['quiz']])


def migrate(conn: sqlite3.Connection) -> None:
    """Bring databases made by older versions up to date."""
    cols = {r[1] for r in conn.execute('PRAGMA table_info(wallets)')}
    if 'badge_tier' not in cols:
        with conn:
            conn.execute('ALTER TABLE wallets ADD COLUMN badge_tier INTEGER NOT NULL DEFAULT 0')
            conn.execute('UPDATE wallets SET badge_tier = 1 WHERE champion_at IS NOT NULL')


def init() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute('PRAGMA journal_mode = WAL')
        conn.executescript(SCHEMA)
        migrate(conn)
        seed(conn)
    finally:
        conn.close()
