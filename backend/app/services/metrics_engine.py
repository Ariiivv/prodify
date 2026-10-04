"""
Metrics Calculation Engine
==========================
Centralised service for all new metrics (Part C of the metrics rebuild).

Every formula operates on REAL data only — actual logged session minutes,
actual targets, actual distracted_seconds.  No estimates, no placeholders.

Public API
----------
- compute_home_metrics(db, user) → dict   (GET /api/metrics/home)
- compute_workspace_metrics(db, user, workspace_id) → dict  (GET /api/metrics/workspace/{id})
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session as DBSession

from app.models import schemas as models

logger = logging.getLogger("prodify_metrics_engine")

# ──────────────────────────────────────────────────────────────────────
# Score → Label Bands (Momentum / Pace)
# ──────────────────────────────────────────────────────────────────────
_SCORE_LABELS: List[Tuple[float, str]] = [
    (80, "Strong"),
    (60, "Solid"),
    (40, "Shaky"),
    (0,  "Slipping"),
]


def _label_for_score(score: float) -> str:
    for threshold, label in _SCORE_LABELS:
        if score >= threshold:
            return label
    return "Slipping"


# ──────────────────────────────────────────────────────────────────────
# Day Status Enum Ordering (worst → best)
# ──────────────────────────────────────────────────────────────────────
_STATUS_ORDER = {"red": 0, "yellow": 1, "green": 2, "golden": 3}


# ──────────────────────────────────────────────────────────────────────
# C.1 — Day-Status for a single workspace on a single calendar day
# ──────────────────────────────────────────────────────────────────────
def _day_status(actual_minutes: float, target_minutes: int) -> str:
    """Return 'red' | 'yellow' | 'green' | 'golden' for a single workspace-day."""
    if target_minutes <= 0:
        # No meaningful target → treat any work as green
        return "green" if actual_minutes > 0 else "red"
    ratio = actual_minutes / target_minutes
    if ratio >= 1.5:
        return "golden"
    if ratio >= 1.0:
        return "green"
    if ratio >= 0.5:
        return "yellow"
    return "red"


# ──────────────────────────────────────────────────────────────────────
# Helpers: fetch session data bucketed by calendar day
# ──────────────────────────────────────────────────────────────────────
def _get_workspace_daily_minutes(
    db: DBSession,
    workspace_ids: List[int],
    since: date,
    until: date,
) -> Dict[int, Dict[date, float]]:
    """
    Returns {workspace_id: {date: total_minutes}} for COMPLETED FOCUS sessions.
    Uses DailyWorkspaceLog where available, falls back to Session aggregation.
    """
    # Use DailyWorkspaceLog as primary source (it accumulates minutes_logged)
    logs = (
        db.query(
            models.DailyWorkspaceLog.workspace_id,
            models.DailyWorkspaceLog.date,
            models.DailyWorkspaceLog.minutes_logged,
        )
        .filter(
            models.DailyWorkspaceLog.workspace_id.in_(workspace_ids),
            models.DailyWorkspaceLog.date >= since,
            models.DailyWorkspaceLog.date <= until,
        )
        .all()
    )

    result: Dict[int, Dict[date, float]] = defaultdict(dict)
    for ws_id, d, mins in logs:
        result[ws_id][d] = float(mins)

    # Also aggregate from sessions directly for days not in DailyWorkspaceLog
    session_rows = (
        db.query(
            models.Session.workspace_id,
            cast(models.Session.start_time, Date).label("d"),
            func.sum(models.Session.duration).label("total_secs"),
        )
        .filter(
            models.Session.workspace_id.in_(workspace_ids),
            models.Session.session_type == "FOCUS",
            models.Session.status == "COMPLETED",
            cast(models.Session.start_time, Date) >= since,
            cast(models.Session.start_time, Date) <= until,
        )
        .group_by(models.Session.workspace_id, cast(models.Session.start_time, Date))
        .all()
    )

    for ws_id, d, total_secs in session_rows:
        if d not in result.get(ws_id, {}):
            result[ws_id][d] = (total_secs or 0) / 60.0

    return dict(result)


def _get_distraction_data(
    db: DBSession,
    workspace_ids: List[int],
    since: date,
    until: date,
) -> Tuple[float, float]:
    """
    Returns (total_focus_seconds, total_distracted_seconds) from completed FOCUS
    sessions in the given workspace set and date range.
    """
    rows = (
        db.query(
            func.coalesce(func.sum(models.Session.duration), 0),
            func.coalesce(func.sum(models.Session.distracted_seconds), 0),
        )
        .filter(
            models.Session.workspace_id.in_(workspace_ids),
            models.Session.session_type == "FOCUS",
            models.Session.status == "COMPLETED",
            cast(models.Session.start_time, Date) >= since,
            cast(models.Session.start_time, Date) <= until,
        )
        .first()
    )
    focus_secs = float(rows[0]) if rows else 0.0
    distracted_secs = float(rows[1]) if rows else 0.0
    return focus_secs, distracted_secs


# ──────────────────────────────────────────────────────────────────────
# C.2 — Overall (Home) Day-Status: worst-of-all rule
# ──────────────────────────────────────────────────────────────────────
def _compute_calendar(
    db: DBSession,
    workspaces: List[models.Workspace],
    since: date,
    until: date,
) -> List[dict]:
    """
    Returns [{date: str, status: str|null}] for every day in [since, until].
    Status is None ("no data") for days before a workspace existed or with no
    workspaces that had targets.
    """
    if not workspaces:
        return []

    ws_ids = [ws.id for ws in workspaces]
    ws_created = {ws.id: ws.created_at.date() for ws in workspaces}
    ws_targets = {ws.id: ws.daily_target_minutes or 0 for ws in workspaces}

    daily_data = _get_workspace_daily_minutes(db, ws_ids, since, until)

    calendar = []
    current = since
    while current <= until:
        # Which workspaces existed on this day and had a target?
        active_ws = [
            ws_id for ws_id in ws_ids
            if ws_created.get(ws_id, current) <= current and ws_targets.get(ws_id, 0) > 0
        ]

        if not active_ws:
            calendar.append({"date": current.isoformat(), "status": None})
            current += timedelta(days=1)
            continue

        worst_status: Optional[str] = None
        for ws_id in active_ws:
            actual = daily_data.get(ws_id, {}).get(current, 0.0)
            status = _day_status(actual, ws_targets[ws_id])
            if worst_status is None or _STATUS_ORDER[status] < _STATUS_ORDER[worst_status]:
                worst_status = status

        calendar.append({"date": current.isoformat(), "status": worst_status})
        current += timedelta(days=1)

    return calendar


# ──────────────────────────────────────────────────────────────────────
# C.3 — Streaks: current + longest
# ──────────────────────────────────────────────────────────────────────
def _compute_streaks(
    calendar: List[dict],
    today: date,
) -> Tuple[int, int]:
    """
    Walk the calendar backwards.
    current_streak = consecutive GREEN/GOLDEN from today backward.
    Grace rule: if today has no data yet, start from yesterday.
    longest_streak = max run of GREEN/GOLDEN anywhere in the calendar.
    """
    # Build date→status lookup
    status_by_date = {}
    for entry in calendar:
        d = date.fromisoformat(entry["date"])
        status_by_date[d] = entry["status"]

    # Current streak
    current_streak = 0
    check_date = today
    # Grace rule: if today has no status or null, start from yesterday
    today_status = status_by_date.get(today)
    if today_status is None:
        check_date = today - timedelta(days=1)

    while check_date in status_by_date:
        s = status_by_date[check_date]
        if s in ("green", "golden"):
            current_streak += 1
            check_date -= timedelta(days=1)
        else:
            break

    # Longest streak — scan entire calendar
    longest_streak = 0
    run = 0
    for entry in calendar:
        if entry["status"] in ("green", "golden"):
            run += 1
            longest_streak = max(longest_streak, run)
        else:
            run = 0

    return current_streak, longest_streak


def _compute_workspace_streaks(
    db: DBSession,
    workspace: models.Workspace,
    since: date,
    until: date,
    today: date,
) -> Tuple[int, int]:
    """Streaks scoped to a single workspace."""
    daily_data = _get_workspace_daily_minutes(db, [workspace.id], since, until)
    ws_data = daily_data.get(workspace.id, {})
    target = workspace.daily_target_minutes or 0
    ws_created = workspace.created_at.date()

    calendar = []
    current = since
    while current <= until:
        if current < ws_created or target <= 0:
            calendar.append({"date": current.isoformat(), "status": None})
        else:
            actual = ws_data.get(current, 0.0)
            calendar.append({"date": current.isoformat(), "status": _day_status(actual, target)})
        current += timedelta(days=1)

    return _compute_streaks(calendar, today)


# ──────────────────────────────────────────────────────────────────────
# C.5 — Deep Work Ratio (rolling 7-day)
# ──────────────────────────────────────────────────────────────────────
def _deep_work_ratio(
    db: DBSession,
    workspace_ids: List[int],
    today: date,
    window_days: int = 7,
) -> Optional[float]:
    """
    Deep Work Ratio = (focus_seconds - distracted_seconds) / focus_seconds
    Over a trailing window ending today (inclusive).
    Returns None if no focus data in the window.
    """
    since = today - timedelta(days=window_days - 1)
    focus_secs, distracted_secs = _get_distraction_data(db, workspace_ids, since, today)

    if focus_secs <= 0:
        return None

    # Distracted seconds can't exceed focus seconds
    distracted_secs = min(distracted_secs, focus_secs)
    return round((focus_secs - distracted_secs) / focus_secs * 100, 1)


# ──────────────────────────────────────────────────────────────────────
# C.6 — Momentum / Pace (same engine, different scope)
# ──────────────────────────────────────────────────────────────────────
def _compute_momentum_pace(
    db: DBSession,
    workspaces: List[models.Workspace],
    today: date,
    window_days: int = 7,
    scope_workspace_id: Optional[int] = None,
) -> dict:
    """
    Score = average of three equally-weighted sub-scores (0-100):
      CONSISTENCY = avg(workspaces_touched_that_day / total_active_that_day)
      VOLUME      = (actual_minutes / target_minutes) * 100, capped at 100
      QUALITY     = Deep Work Ratio over the same window

    scope_workspace_id: if set, scope to that single workspace (Pace),
                        otherwise all workspaces (Momentum).
    """
    if scope_workspace_id:
        workspaces = [ws for ws in workspaces if ws.id == scope_workspace_id]

    if not workspaces:
        return {"score": 0, "label": "Slipping", "consistency": 0, "volume": 0, "quality": 0}

    ws_ids = [ws.id for ws in workspaces]
    ws_created = {ws.id: ws.created_at.date() for ws in workspaces}
    ws_targets = {ws.id: ws.daily_target_minutes or 0 for ws in workspaces}

    # Find the earliest useful start date
    earliest_ws_date = min(ws_created.values())
    since = max(today - timedelta(days=window_days - 1), earliest_ws_date)
    actual_days = (today - since).days + 1
    if actual_days <= 0:
        return {"score": 0, "label": "Slipping", "consistency": 0, "volume": 0, "quality": 0}

    daily_data = _get_workspace_daily_minutes(db, ws_ids, since, today)

    # --- CONSISTENCY ---
    consistency_scores = []
    current = since
    while current <= today:
        active_ws = [
            ws_id for ws_id in ws_ids
            if ws_created.get(ws_id, current) <= current and ws_targets.get(ws_id, 0) > 0
        ]
        if not active_ws:
            current += timedelta(days=1)
            continue

        touched = sum(
            1 for ws_id in active_ws
            if daily_data.get(ws_id, {}).get(current, 0) > 0
        )
        consistency_scores.append(touched / len(active_ws))
        current += timedelta(days=1)

    consistency = (sum(consistency_scores) / len(consistency_scores) * 100) if consistency_scores else 0

    # --- VOLUME ---
    total_actual = 0.0
    total_target = 0.0
    current = since
    while current <= today:
        for ws_id in ws_ids:
            if ws_created.get(ws_id, current) <= current and ws_targets.get(ws_id, 0) > 0:
                total_actual += daily_data.get(ws_id, {}).get(current, 0.0)
                total_target += ws_targets[ws_id]
        current += timedelta(days=1)

    volume = min(100.0, (total_actual / total_target * 100) if total_target > 0 else 0)

    # --- QUALITY = Deep Work Ratio ---
    quality_raw = _deep_work_ratio(db, ws_ids, today, window_days)
    quality = quality_raw if quality_raw is not None else 0.0

    # --- Combined score ---
    score = round((consistency + volume + quality) / 3, 1)
    label = _label_for_score(score)

    return {
        "score": score,
        "label": label,
        "consistency": round(consistency, 1),
        "volume": round(volume, 1),
        "quality": round(quality, 1),
    }


# ──────────────────────────────────────────────────────────────────────
# C.7 — Peak Focus Window
# ──────────────────────────────────────────────────────────────────────
def _peak_focus_window(
    db: DBSession,
    workspace_ids: List[int],
) -> dict:
    """
    Bucket sessions by hour-of-day started, compute average alignment rate
    (focused_time / total_time) per bucket.
    Minimum data gate: 14+ distinct days of session history.
    """
    # Check minimum data gate
    distinct_days = (
        db.query(func.count(func.distinct(cast(models.Session.start_time, Date))))
        .filter(
            models.Session.workspace_id.in_(workspace_ids),
            models.Session.session_type == "FOCUS",
            models.Session.status == "COMPLETED",
        )
        .scalar()
    ) or 0

    if distinct_days < 14:
        return {"insufficient_data": True, "days_collected": distinct_days, "days_needed": 14}

    # Get all completed focus sessions
    sessions = (
        db.query(models.Session)
        .filter(
            models.Session.workspace_id.in_(workspace_ids),
            models.Session.session_type == "FOCUS",
            models.Session.status == "COMPLETED",
            models.Session.duration.isnot(None),
            models.Session.duration > 0,
        )
        .all()
    )

    # Bucket by hour
    hour_focus: Dict[int, float] = defaultdict(float)  # total focus seconds
    hour_total: Dict[int, float] = defaultdict(float)  # total duration seconds

    for s in sessions:
        if s.start_time is None:
            continue
        hour = s.start_time.hour
        total = float(s.duration or 0)
        distracted = float(s.distracted_seconds or 0)
        focused = max(0, total - distracted)

        hour_total[hour] += total
        hour_focus[hour] += focused

    if not hour_total:
        return {"insufficient_data": True, "days_collected": distinct_days, "days_needed": 14}

    # Find best hour
    best_hour = max(hour_total.keys(), key=lambda h: (hour_focus[h] / hour_total[h]) if hour_total[h] > 0 else 0)
    best_rate = (hour_focus[best_hour] / hour_total[best_hour] * 100) if hour_total[best_hour] > 0 else 0

    # Format as human-readable time range
    start_label = f"{best_hour:02d}:00"
    end_label = f"{(best_hour + 1) % 24:02d}:00"

    return {
        "insufficient_data": False,
        "peak_hour": best_hour,
        "peak_range": f"{start_label}–{end_label}",
        "alignment_rate": round(best_rate, 1),
    }


# ══════════════════════════════════════════════════════════════════════
# PUBLIC API
# ══════════════════════════════════════════════════════════════════════

def compute_home_metrics(db: DBSession, user: models.User) -> dict:
    """
    Compute all metrics for the Home dashboard.
    Returns the full payload for GET /api/metrics/home.
    """
    today = date.today()

    workspaces = (
        db.query(models.Workspace)
        .filter(models.Workspace.user_id == user.id)
        .all()
    )

    total_workspaces = len(workspaces)

    if total_workspaces == 0:
        return {
            "momentum": {"score": 0, "label": "Slipping", "consistency": 0, "volume": 0, "quality": 0},
            "total_workspaces": 0,
            "deep_work_ratio_aggregate": None,
            "peak_focus_window": {"insufficient_data": True, "days_collected": 0, "days_needed": 14},
            "current_streak": 0,
            "longest_streak": 0,
            "calendar": [],
        }

    ws_ids = [ws.id for ws in workspaces]

    # Calendar: last 90 days
    calendar_since = today - timedelta(days=89)
    calendar = _compute_calendar(db, workspaces, calendar_since, today)

    # Streaks
    current_streak, longest_streak_computed = _compute_streaks(calendar, today)

    # Update persisted longest streak if exceeded
    stats = db.query(models.UserStats).filter(models.UserStats.user_id == user.id).first()
    persisted_longest = 0
    if stats:
        persisted_longest = stats.longest_global_streak or 0
        if longest_streak_computed > persisted_longest:
            stats.longest_global_streak = longest_streak_computed
            db.commit()
            persisted_longest = longest_streak_computed
    else:
        persisted_longest = longest_streak_computed

    longest_streak = max(persisted_longest, longest_streak_computed)

    # Momentum
    momentum = _compute_momentum_pace(db, workspaces, today)

    # Deep Work Ratio (aggregate)
    dwr = _deep_work_ratio(db, ws_ids, today)

    # Peak Focus Window
    peak = _peak_focus_window(db, ws_ids)

    return {
        "momentum": momentum,
        "total_workspaces": total_workspaces,
        "deep_work_ratio_aggregate": dwr,
        "peak_focus_window": peak,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "calendar": calendar,
    }


def compute_workspace_metrics(db: DBSession, user: models.User, workspace_id: int) -> Optional[dict]:
    """
    Compute all metrics for a single workspace.
    Returns the full payload for GET /api/metrics/workspace/{id} or None if
    the workspace doesn't exist or doesn't belong to the user.
    """
    workspace = (
        db.query(models.Workspace)
        .filter(
            models.Workspace.id == workspace_id,
            models.Workspace.user_id == user.id,
        )
        .first()
    )
    if not workspace:
        return None

    today = date.today()

    # All user workspaces (needed for Pace context)
    all_workspaces = (
        db.query(models.Workspace)
        .filter(models.Workspace.user_id == user.id)
        .all()
    )

    # Calendar: last 90 days, scoped to this workspace
    calendar_since = today - timedelta(days=89)
    calendar = _compute_calendar(db, [workspace], calendar_since, today)

    # Workspace streaks
    ws_current, ws_longest = _compute_workspace_streaks(db, workspace, calendar_since, today, today)

    # Update persisted workspace longest streak
    if ws_longest > (workspace.longest_streak or 0):
        workspace.longest_streak = ws_longest
        db.commit()

    persisted_longest = max(workspace.longest_streak or 0, ws_longest)

    # Pace (Momentum scoped to one workspace)
    pace = _compute_momentum_pace(db, all_workspaces, today, scope_workspace_id=workspace_id)

    # Deep Work Ratio (workspace-scoped)
    dwr = _deep_work_ratio(db, [workspace_id], today)

    return {
        "pace": pace,
        "deep_work_ratio": dwr,
        "calendar": calendar,
        "workspace_streak_current": ws_current,
        "workspace_streak_longest": persisted_longest,
    }
