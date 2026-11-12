"""A compact SM-2 style spaced-repetition scheduler.

Grades: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy.
Times are milliseconds since the epoch, to match what the frontend expects.
"""
import math
import time

MIN = 60 * 1000
DAY = 24 * 60 * MIN
MIN_EASE = 1.3


def jsround(x):
    """Round half up, like JavaScript's Math.round (Python's round() rounds half to even)."""
    return math.floor(x + 0.5)


def now_ms() -> int:
    return int(time.time() * 1000)


def schedule(state, grade, now=None):
    """Return the card's next state after a review with the given grade."""
    now = now_ms() if now is None else now
    ease = state.get('ease', 2.5)
    interval_d = state.get('interval_d', 0)
    reps = state.get('reps', 0)

    if grade == 0:
        reps = 0
        interval_d = 0
        ease = max(MIN_EASE, ease - 0.2)
        due_in = 10 * MIN  # see it again this session
    elif grade == 1:
        interval_d = 0.5 if reps == 0 else max(1, interval_d * 1.2)
        ease = max(MIN_EASE, ease - 0.15)
        reps += 1
        due_in = interval_d * DAY
    elif grade == 2:
        interval_d = 1 if reps == 0 else 3 if reps == 1 else jsround(interval_d * ease)
        reps += 1
        due_in = interval_d * DAY
    else:
        interval_d = 4 if reps == 0 else jsround(max(interval_d, 1) * ease * 1.3)
        ease += 0.15
        reps += 1
        due_in = interval_d * DAY

    return {'ease': round(ease, 2), 'interval_d': interval_d, 'reps': reps, 'due_at': now + jsround(due_in)}


def label(ms):
    """Short label for a time span: 10m, 12h, 3d, 2mo, 1.2y."""
    if ms < 60 * MIN:
        return f'{max(1, jsround(ms / MIN))}m'
    if ms < DAY:
        return f'{jsround(ms / (60 * MIN))}h'
    d = ms / DAY
    if d < 30:
        return f'{jsround(d)}d'
    if d < 365:
        return f'{jsround(d / 30)}mo'
    return f'{d / 365:.1f}y'


def preview(state, now=None):
    """When the card would come back for each of the four grades."""
    now = now_ms() if now is None else now
    return [label(schedule(state, g, now)['due_at'] - now) for g in range(4)]
