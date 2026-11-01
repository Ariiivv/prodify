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
from datetime import date, datetime, timedelta, timezone, time
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.models import schemas as models
from app.models.crud import compute_total_daily_sessions
from app.services.metrics_utils import focus_purity_percent


def get_local_date(dt=None, timezone_name: Optional[str] = None):
    """Convert a UTC/naive timestamp into the requested IANA local date."""
    if dt is None:
        dt = datetime.utcnow()
    if not hasattr(dt, "date"):
        return dt
    if not isinstance(dt, datetime):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        local_tz = ZoneInfo(timezone_name or "UTC")
    except Exception:
        local_tz = timezone.utc
    return dt.astimezone(local_tz).date()


def get_local_hour(dt: datetime, timezone_name: Optional[str] = None) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        local_tz = ZoneInfo(timezone_name or "UTC")
    except Exception:
        local_tz = timezone.utc
    return dt.astimezone(local_tz).hour


def _get_user_timezone(db: DBSession, user_id: str) -> str:
    """Use the most recently recorded session timezone, falling back to UTC."""
    value = (
        db.query(models.Session.timezone)
        .filter(
            models.Session.user_id == user_id,
            models.Session.timezone.isnot(None),
        )
        .order_by(models.Session.start_time.desc())
        .first()
    )
    return value[0] if value and value[0] else "UTC"


def _utc_query_bounds(since: date, until: date, timezone_name: str) -> tuple[datetime, datetime]:
    """Build UTC-naive bounds for the local date range used by SQLAlchemy."""
    try:
        tz = ZoneInfo(timezone_name or "UTC")
    except Exception:
        tz = timezone.utc
    local_start = datetime.combine(since, time.min, tzinfo=tz)
    local_end = datetime.combine(until + timedelta(days=1), time.min, tzinfo=tz)
    return (
        local_start.astimezone(timezone.utc).replace(tzinfo=None),
        local_end.astimezone(timezone.utc).replace(tzinfo=None),
    )

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


def _get_workspace_daily_target(ws: models.Workspace, today: date) -> int:
    """
    Returns the workspace's target minutes for a single day.
    For sprints: dynamically computes today's quota as (target_hours * 60) / days_left,
    bounded between 15m and 480m (8 hours). If deadline has passed, returns 0.
    For casual / quick_flow: returns 0 (self-paced, no quota).
    For paused / completed tracks: returns 0.
    For mastery: bounded between 15m and 480m.
    Never returns multi-week total hours.
    """
    ws_status = (getattr(ws, "status", None) or "active").lower()
    if ws_status in ("paused", "completed"):
        return 0
    cat = (ws.category or "mastery").lower()
    if cat in ("casual", "quick_flow", "quick_work"):
        return 0
    if cat == "sprint":
        if ws.deadline and ws.deadline < today:
            return 0
        if ws.target_hours and ws.deadline:
            days_left = max(1, (ws.deadline - today).days + 1)
            total_mins = round(ws.target_hours * 60)
            return min(480, max(15, round(total_mins / days_left)))
        raw = ws.daily_target_minutes or 60
        return min(480, max(15, raw))
    if cat == "mastery":
        raw = ws.daily_target_minutes or 60
        return min(240, max(15, raw))
    return 0


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
    timezone_name: str = "UTC",
) -> Dict[int, Dict[date, float]]:
    """
    Returns {workspace_id: {date: total_minutes}} for FOCUS sessions.
    Uses timezone-aware local date mapping and aggregates both COMPLETED and PARTIAL
    sessions so no logged focus time is lost or delayed.
    Merges with DailyWorkspaceLog taking the maximum to guarantee real-time accuracy.
    """
    if not workspace_ids:
        return {}

    result: Dict[int, Dict[date, float]] = defaultdict(dict)

    # 1. DailyWorkspaceLog
    logs = (
        db.query(
            models.DailyWorkspaceLog.workspace_id,
            models.DailyWorkspaceLog.date,
            models.DailyWorkspaceLog.minutes_logged,
        )
        .join(models.Workspace, models.DailyWorkspaceLog.workspace_id == models.Workspace.id)
        .filter(
            models.DailyWorkspaceLog.workspace_id.in_(workspace_ids),
            models.DailyWorkspaceLog.workspace_id.isnot(None),
            models.DailyWorkspaceLog.date >= since,
            models.DailyWorkspaceLog.date <= until,
        )
        .all()
    )
    for ws_id, d, mins in logs:
        result[ws_id][d] = float(mins)

    # 2. Query sessions with buffer for UTC timezone offset conversion
    local_start, local_end = _utc_query_bounds(since, until, timezone_name)
    buffer_start = local_start - timedelta(days=1)
    buffer_end = local_end + timedelta(days=1)
    session_rows = (
        db.query(
            models.Session.workspace_id,
            models.Session.start_time,
            models.Session.duration,
            models.Session.timezone,
        )
        .join(models.Workspace, models.Session.workspace_id == models.Workspace.id)
        .filter(
            models.Session.workspace_id.in_(workspace_ids),
            models.Session.workspace_id.isnot(None),
            models.Session.session_type == "FOCUS",
            models.Session.status.in_(["COMPLETED", "PARTIAL"]),
            models.Session.start_time >= buffer_start,
            models.Session.start_time <= buffer_end,
            models.Session.duration > 0,
        )
        .all()
    )

    session_daily: Dict[int, Dict[date, float]] = defaultdict(lambda: defaultdict(float))
    for ws_id, start_dt, total_secs, session_timezone in session_rows:
        if not start_dt or not total_secs:
            continue
        local_d = get_local_date(start_dt, session_timezone)
        if since <= local_d <= until:
            session_daily[ws_id][local_d] += (total_secs or 0) / 60.0

    # 3. Take maximum between DailyWorkspaceLog and accumulated Session minutes
    for ws_id, day_map in session_daily.items():
        for d, mins in day_map.items():
            result[ws_id][d] = max(result[ws_id].get(d, 0.0), mins)

    return dict(result)


def _get_distraction_data(
    db: DBSession,
    workspace_ids: List[int],
    since: date,
    until: date,
    timezone_name: str = "UTC",
) -> Tuple[float, float, int]:
    """
    Returns (total_focus_seconds, actual_distracted_seconds, distraction_count)
    from FOCUS sessions in the given workspace set and date range.
    Includes both COMPLETED and PARTIAL sessions with timezone-aware date mapping.
    """
    if not workspace_ids:
        return 0.0, 0.0, 0

    local_start, local_end = _utc_query_bounds(since, until, timezone_name)
    buffer_start = local_start - timedelta(days=1)
    buffer_end = local_end + timedelta(days=1)

    sessions = (
        db.query(
            models.Session.start_time,
            models.Session.duration,
            models.Session.distracted_seconds,
            models.Session.distraction_count,
            models.Session.timezone,
        )
        .join(models.Workspace, models.Session.workspace_id == models.Workspace.id)
        .filter(
            models.Session.workspace_id.in_(workspace_ids),
            models.Session.workspace_id.isnot(None),
            models.Session.session_type == "FOCUS",
            models.Session.status.in_(["COMPLETED", "PARTIAL"]),
            models.Session.start_time >= buffer_start,
            models.Session.start_time <= buffer_end,
            models.Session.duration > 0,
        )
        .all()
    )

    focus_secs = 0.0
    distracted_secs = 0.0
    distraction_cnt = 0

    for start_dt, dur, dist_s, dist_c, session_timezone in sessions:
        if not start_dt:
            continue
        local_d = get_local_date(start_dt, session_timezone)
        if since <= local_d <= until:
            focus_secs += float(dur or 0)
            distracted_secs += float(dist_s or 0)
            distraction_cnt += int(dist_c or 0)

    # Fallback only if distracted_seconds was 0 in Session table but off-task ticks exist
    if distracted_secs == 0 and focus_secs > 0:
        activity_start, activity_end = _utc_query_bounds(since, until, timezone_name)
        off_task_logs_count = (
            db.query(func.count(models.ActivityLog.id))
            .join(models.Workspace, models.ActivityLog.workspace_id == models.Workspace.id)
            .filter(
                models.ActivityLog.workspace_id.in_(workspace_ids),
                models.ActivityLog.workspace_id.isnot(None),
                models.ActivityLog.is_focused == 0,
                models.ActivityLog.timestamp >= activity_start,
                models.ActivityLog.timestamp < activity_end,
            )
            .scalar()
            or 0
        )
        distracted_secs = min(focus_secs * 0.5, float(off_task_logs_count * 5.0))

    return focus_secs, distracted_secs, distraction_cnt


# ──────────────────────────────────────────────────────────────────────
# C.2 — Overall (Home) Day-Status: worst-of-all rule
# ──────────────────────────────────────────────────────────────────────
def _compute_calendar(
    db: DBSession,
    workspaces: List[models.Workspace],
    since: date,
    until: date,
    timezone_name: str = "UTC",
) -> List[dict]:
    """
    Returns [{date: str, status: str|null}] for every day in [since, until].
    Status is None ("no data") for days before a workspace existed or with no
    workspaces that had targets.
    """
    if not workspaces:
        return []

    # uses module-level get_local_date and compute_total_daily_sessions
    ws_ids = [ws.id for ws in workspaces]
    ws_created = {ws.id: get_local_date(ws.created_at) for ws in workspaces}
    ws_targets = {ws.id: _get_workspace_daily_target(ws, until) for ws in workspaces}

    daily_data = _get_workspace_daily_minutes(db, ws_ids, since, until, timezone_name)

    calendar = []
    current = since
    while current <= until:
        # Which workspaces existed on this day and had a target?
        active_ws = [
            ws_id for ws_id in ws_ids
            if ws_created.get(ws_id, current) <= current and ws_targets.get(ws_id, 0) > 0
        ]

        if not active_ws:
            calendar.append({
                "date": current.isoformat(),
                "status": None,
                "actual_minutes": 0.0,
                "target_minutes": max(list(ws_targets.values()), default=0),
            })
            current += timedelta(days=1)
            continue

        worst_status: Optional[str] = None
        # For tooltips: report the day's totals (single-workspace case is exact;
        # multi-workspace Home view reports worst status + summed minutes).
        day_target = 0
        day_actual = 0.0
        for ws_id in active_ws:
            actual = daily_data.get(ws_id, {}).get(current, 0.0)
            tgt = ws_targets[ws_id]
            day_target += tgt
            day_actual += actual
            status = _day_status(actual, tgt)
            if current == until and status == "red":
                # Today is in-progress; never report as red failure before day ends
                status = None
            if status is not None:
                if worst_status is None or _STATUS_ORDER[status] < _STATUS_ORDER[worst_status]:
                    worst_status = status

        calendar.append({
            "date": current.isoformat(),
            "status": worst_status,
            "actual_minutes": round(day_actual, 1),
            "target_minutes": day_target,
        })
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
    # Grace rule: if today has already met quota (green/golden), count it and walk backward.
    # If today is in progress (null, red, yellow), start evaluation from yesterday so an
    # ongoing day never breaks an active multi-day streak.
    today_status = status_by_date.get(today)
    if today_status in ("green", "golden"):
        check_date = today
    else:
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
    timezone_name: str = "UTC",
) -> Tuple[int, int]:
    """Streaks scoped to a single workspace."""
    daily_data = _get_workspace_daily_minutes(db, [workspace.id], since, until, timezone_name)
    ws_data = daily_data.get(workspace.id, {})
    target = _get_workspace_daily_target(workspace, until)
    ws_created = get_local_date(workspace.created_at, timezone_name)

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
# C.5 — Deep Flow / Deep Work Ratio (unified formula)
# ──────────────────────────────────────────────────────────────────────
def compute_deep_flow_ratio(
    focus_seconds: float,
    distracted_seconds: float,
    distraction_count: int = 0,
) -> float:
    """
    Unified Deep Flow / Deep Work Ratio formula used across backend and frontend.

    Deep Flow % = max(0, min(100, round(
        100 - (distraction_count × 4.5)
              - (distracted_seconds / max(1, focus_seconds) × 100)
    , 1)))

    Zero-state fallback: if focus_seconds === 0 and distraction_count === 0,
    returns 100% (pristine/calibrating state), never 0% for clean sessions.
    """
    focus_seconds = max(0.0, float(focus_seconds))
    distracted_seconds = max(0.0, float(distracted_seconds))
    distraction_count = max(0, int(distraction_count))

    # Zero-state fallback: clean session with no focus tracked yet → pristine 100%
    if focus_seconds == 0 and distraction_count == 0:
        return 100.0

    raw = focus_purity_percent(focus_seconds, distracted_seconds) - (distraction_count * 4.5)
    return max(0.0, min(100.0, round(raw, 1)))


# Backwards-compatible wrapper: minutes-based interface used elsewhere.
def compute_deep_work_ratio(focus_minutes: float, distracted_minutes: float) -> float:
    """
    Wrapper around compute_deep_flow_ratio accepting minutes.
    Distraction count defaults to 0 when not provided.
    """
    return compute_deep_flow_ratio(
        focus_seconds=focus_minutes * 60.0,
        distracted_seconds=distracted_minutes * 60.0,
        distraction_count=0,
    )


def _deep_work_ratio(
    db: DBSession,
    workspace_ids: List[int],
    today: date,
    window_days: int = 7,
    timezone_name: str = "UTC",
) -> Optional[float]:
    """
    Deep Flow / Deep Work Ratio over a trailing window ending today (inclusive).
    Uses the unified formula: 100 - (distraction_count × 4.5) - (distracted_seconds / focus_seconds × 100).
    Returns None if no focus data in the window (caller decides zero-state).
    """
    since = today - timedelta(days=window_days - 1)
    focus_secs, distracted_secs, distraction_cnt = _get_distraction_data(
        db, workspace_ids, since, today, timezone_name
    )

    if focus_secs <= 0 and distraction_cnt == 0:
        # No data at all → pristine zero-state, return 100%
        return 100.0
    if focus_secs <= 0:
        # No focus but there were distractions → 0% (or minimal)
        return 0.0

    return compute_deep_flow_ratio(
        focus_seconds=focus_secs,
        distracted_seconds=distracted_secs,
        distraction_count=distraction_cnt,
    )


# ──────────────────────────────────────────────────────────────────────
# C.5.5 — Session Count (unified daily target)
# ──────────────────────────────────────────────────────────────────────
def compute_workspace_daily_sessions(
    daily_quota_minutes: int,
    work_duration_minutes: int,
    workspace_status: str = "active",
) -> int:
    """
    Delegates to crud.compute_total_daily_sessions for the unified session count.

    Total Daily Sessions = max(1, ceil(Daily Quota Minutes / Work Duration Minutes))
    """
    return compute_total_daily_sessions(
        daily_quota_minutes=daily_quota_minutes,
        work_duration_minutes=work_duration_minutes,
        workspace_status=workspace_status,
    )


# ──────────────────────────────────────────────────────────────────────
# C.6 — Momentum / Pace (same engine, different scope)
# ──────────────────────────────────────────────────────────────────────
def _compute_momentum_pace(
    db: DBSession,
    workspaces: List[models.Workspace],
    today: date,
    window_days: int = 7,
    scope_workspace_id: Optional[int] = None,
    timezone_name: str = "UTC",
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
        return {"score": 50.0, "label": "Ready", "consistency": 0, "volume": 0, "quality": 0}

    ws_ids = [ws.id for ws in workspaces]
    ws_created = {ws.id: get_local_date(ws.created_at) for ws in workspaces}
    ws_targets = {ws.id: _get_workspace_daily_target(ws, today) for ws in workspaces}

    # Find the earliest useful start date
    earliest_ws_date = min(ws_created.values())
    since = max(today - timedelta(days=window_days - 1), earliest_ws_date)
    actual_days = (today - since).days + 1
    if actual_days <= 0:
        return {"score": 50.0, "label": "Ready", "consistency": 0, "volume": 0, "quality": 0}

    daily_data = _get_workspace_daily_minutes(db, ws_ids, since, today, timezone_name)

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
    quality_raw = _deep_work_ratio(db, ws_ids, today, window_days, timezone_name)
    quality = quality_raw if quality_raw is not None else 0.0

    # Day 1 / New Workspace rule:
    # If the window only covers today (created today or no past history in window),
    # never show "Slipping" — report "On Track" if work done, or "Ready" if just starting.
    if since == today or actual_days <= 1 or all(ws_created.get(wid, today) >= today for wid in ws_ids) or (consistency == 0 and volume == 0 and total_actual == 0):
        if total_actual > 0:
            return {
                "score": max(65.0, round(volume, 1)),
                "label": "On Track",
                "consistency": round(consistency, 1) or 100.0,
                "volume": round(volume, 1),
                "quality": round(quality, 1),
            }
        else:
            return {
                "score": 50.0,
                "label": "Ready",
                "consistency": 0.0,
                "volume": 0.0,
                "quality": 0.0,
            }

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
    timezone_name: str = "UTC",
) -> dict:
    """
    Bucket sessions by hour-of-day started, compute average alignment rate
    (focused_time / total_time) per bucket.
    Minimum data gate: 14+ distinct days of session history.
    """
    if not workspace_ids:
        return {"insufficient_data": True, "days_collected": 0, "days_needed": 14}

    # The model is explicitly a trailing 14-day heuristic, not an all-history aggregate.
    cutoff = datetime.utcnow() - timedelta(days=14)
    sessions = (
        db.query(
            models.Session.start_time,
            models.Session.duration,
            models.Session.distracted_seconds,
            models.Session.timezone,
        )
        .join(models.Workspace, models.Session.workspace_id == models.Workspace.id)
        .filter(
            models.Session.workspace_id.in_(workspace_ids),
            models.Session.workspace_id.isnot(None),
            models.Session.session_type == "FOCUS",
            models.Session.status == "COMPLETED",
            models.Session.duration.isnot(None),
            models.Session.duration > 0,
            models.Session.start_time >= cutoff,
        )
        .all()
    )

    distinct_days = {
        get_local_date(start_dt, session_timezone)
        for start_dt, _, _, session_timezone in sessions
        if start_dt is not None
    }
    if len(distinct_days) < 14:
        return {"insufficient_data": True, "days_collected": len(distinct_days), "days_needed": 14}

    # Bucket by hour
    hour_focus: Dict[int, float] = defaultdict(float)  # total focus seconds
    hour_total: Dict[int, float] = defaultdict(float)  # total duration seconds

    for start_dt, duration, distracted_seconds, session_timezone in sessions:
        if start_dt is None:
            continue
        try:
            local_tz = ZoneInfo(session_timezone or timezone_name or "UTC")
        except Exception:
            local_tz = timezone.utc
        hour = start_dt.replace(tzinfo=timezone.utc).astimezone(local_tz).hour if start_dt.tzinfo is None else start_dt.astimezone(local_tz).hour
        total = float(duration or 0)
        distracted = float(distracted_seconds or 0)
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
    user_timezone = _get_user_timezone(db, user.id)
    today = get_local_date(datetime.utcnow(), user_timezone)

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
    calendar = _compute_calendar(db, workspaces, calendar_since, today, user_timezone)

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
    momentum = _compute_momentum_pace(db, workspaces, today, timezone_name=user_timezone)

    # Deep Work Ratio (aggregate)
    dwr = _deep_work_ratio(db, ws_ids, today, timezone_name=user_timezone)

    # Peak Focus Window
    peak = _peak_focus_window(db, ws_ids, user_timezone)

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

    user_timezone = _get_user_timezone(db, user.id)
    today = get_local_date(datetime.utcnow(), user_timezone)

    # All user workspaces (needed for Pace context)
    all_workspaces = (
        db.query(models.Workspace)
        .filter(models.Workspace.user_id == user.id)
        .all()
    )

    # Calendar: last 90 days, scoped to this workspace
    calendar_since = today - timedelta(days=89)
    calendar = _compute_calendar(db, [workspace], calendar_since, today, user_timezone)

    # Workspace streaks
    ws_current, ws_longest = _compute_workspace_streaks(db, workspace, calendar_since, today, today, user_timezone)

    # Update persisted workspace longest streak
    if ws_longest > (workspace.longest_streak or 0):
        workspace.longest_streak = ws_longest
        db.commit()

    persisted_longest = max(workspace.longest_streak or 0, ws_longest)

    # Pace (Momentum scoped to one workspace)
    pace = _compute_momentum_pace(db, all_workspaces, today, scope_workspace_id=workspace_id, timezone_name=user_timezone)

    # Deep Work Ratio (workspace-scoped)
    dwr = _deep_work_ratio(db, [workspace_id], today, timezone_name=user_timezone)

    today_target = _get_workspace_daily_target(workspace, today)
    today_actual_map = _get_workspace_daily_minutes(db, [workspace_id], today, today, user_timezone)
    today_actual = float(today_actual_map.get(workspace_id, {}).get(today, 0.0))

    # Calculate today's completed sessions and distractions for this workspace
    today_start_utc, today_end_utc = _utc_query_bounds(today, today, user_timezone)
    today_sess = (
        db.query(
            models.Session.start_time,
            models.Session.distraction_count,
            models.Session.timezone,
        )
        .join(models.Workspace, models.Session.workspace_id == models.Workspace.id)
        .filter(
            models.Session.workspace_id == workspace_id,
            models.Session.workspace_id.isnot(None),
            models.Session.session_type == "FOCUS",
            models.Session.status.in_(["COMPLETED", "PARTIAL"]),
            models.Session.start_time >= today_start_utc - timedelta(days=1),
            models.Session.start_time <= today_end_utc + timedelta(days=1),
        )
        .all()
    )
    today_sess_distractions = sum(
        int(s[1] or 0)
        for s in today_sess
        if get_local_date(s[0], s[2]) == today
    )
    today_completed_sessions = sum(
        1 for s in today_sess if get_local_date(s[0], s[2]) == today
    )
    today_distractions_count = today_sess_distractions

    return {
        "pace": pace,
        "deep_work_ratio": dwr,
        "calendar": calendar,
        "workspace_streak_current": ws_current,
        "workspace_streak_longest": persisted_longest,
        "today_target_minutes": today_target,
        "today_actual_minutes": round(today_actual, 1),
        "today_distractions_count": today_distractions_count,
        "today_completed_sessions": today_completed_sessions,
    }


def compute_report_analytics(
    db: DBSession,
    user: models.User,
    workspace_id: Optional[int] = None,
    days: int = 30,
) -> dict:
    """
    Compute unified Report & Analytics data for either Global scope or a specific Workspace.
    Returns summary KPIs, 30-day daily series with targets, workspace leaderboard, and
    granular distraction intelligence.
    """
    from app.services.activity_parser import parse_activity

    user_timezone = _get_user_timezone(db, user.id)
    today = get_local_date(datetime.utcnow(), user_timezone)
    since_date = today - timedelta(days=days - 1)

    all_workspaces = (
        db.query(models.Workspace)
        .filter(models.Workspace.user_id == user.id)
        .all()
    )

    if not all_workspaces:
        return {
            "summary": {
                "momentum_or_pace_score": 0.0,
                "tier_label": "Calibrating",
                "deep_work_ratio_7d": 0.0,
                "current_streak": 0,
                "longest_streak": 0,
                "peak_focus_window": "Not enough data yet",
                "total_focus_hours": 0.0,
                "avg_burnout_pct": 0.0,
            },
            "daily_series": [],
            "workspaces_table": [],
            "distractions_breakdown": {
                "top_platforms": [],
                "recent_distraction_items": [],
                "hourly_distraction_distribution": [
                    {"hour": h, "label": f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}", "count": 0}
                    for h in range(24)
                ],
            },
        }

    target_workspace = None
    if workspace_id is not None:
        target_workspace = next((w for w in all_workspaces if w.id == workspace_id), None)
        if not target_workspace:
            raise ValueError(f"Workspace #{workspace_id} not found or not owned by user")
        scoped_workspaces = [target_workspace]
    else:
        scoped_workspaces = all_workspaces

    scoped_ws_ids = [w.id for w in scoped_workspaces]
    all_ws_ids = [w.id for w in all_workspaces]

    # Total completed/partial focus sessions in scope
    total_scoped_sessions = (
        db.query(
            func.coalesce(func.sum(models.Session.duration), 0),
            func.coalesce(func.sum(models.Session.distracted_seconds), 0),
            func.coalesce(func.avg(models.Session.burnout_score), 0),
            func.count(models.Session.id),
        )
        .join(models.Workspace, models.Session.workspace_id == models.Workspace.id)
        .filter(
            models.Session.workspace_id.in_(scoped_ws_ids),
            models.Session.workspace_id.isnot(None),
            models.Session.session_type == "FOCUS",
            models.Session.status.in_(["COMPLETED", "PARTIAL"]),
            models.Session.duration > 0,
        )
        .first()
    )

    total_focus_secs = float(total_scoped_sessions[0]) if total_scoped_sessions else 0.0
    total_focus_hours = round(total_focus_secs / 3600.0, 1)
    avg_burnout_pct = round(float(total_scoped_sessions[2]) * 100.0, 1) if total_scoped_sessions and total_scoped_sessions[3] > 0 else 0.0
    sess_count = int(total_scoped_sessions[3]) if total_scoped_sessions else 0

    # 1. Summary: Momentum / Pace
    if workspace_id is not None:
        pace_res = _compute_momentum_pace(db, all_workspaces, today, scope_workspace_id=workspace_id, timezone_name=user_timezone)
        if sess_count == 0:
            momentum_or_pace_score = 0.0
            tier_label = "Calibrating"
        else:
            momentum_or_pace_score = pace_res["score"]
            tier_label = pace_res["label"]
        ws_curr_s, ws_long_s = _compute_workspace_streaks(db, target_workspace, today - timedelta(days=89), today, today, user_timezone)
        current_streak = ws_curr_s
        longest_streak = max(target_workspace.longest_streak or 0, ws_long_s)
    else:
        momentum_res = _compute_momentum_pace(db, all_workspaces, today, timezone_name=user_timezone)
        if sess_count == 0:
            momentum_or_pace_score = 0.0
            tier_label = "Calibrating"
        else:
            momentum_or_pace_score = momentum_res["score"]
            tier_label = momentum_res["label"]
        calendar_90 = _compute_calendar(db, all_workspaces, today - timedelta(days=89), today, user_timezone)
        current_streak, l_streak = _compute_streaks(calendar_90, today)
        user_stats = db.query(models.UserStats).filter(models.UserStats.user_id == user.id).first()
        persisted_longest = user_stats.longest_global_streak if user_stats and user_stats.longest_global_streak else 0
        longest_streak = max(persisted_longest, l_streak)

    # 7-day Deep Work Ratio
    dwr_7d = _deep_work_ratio(db, scoped_ws_ids, today, window_days=7, timezone_name=user_timezone)
    deep_work_ratio_7d = dwr_7d if dwr_7d is not None else 0.0

    # Peak Focus Window
    peak = _peak_focus_window(db, scoped_ws_ids, user_timezone)
    peak_focus_window = "Not enough data yet" if peak.get("insufficient_data") else peak.get("peak_range", "Not enough data yet")

    summary = {
        "momentum_or_pace_score": momentum_or_pace_score,
        "tier_label": tier_label,
        "deep_work_ratio_7d": deep_work_ratio_7d,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "peak_focus_window": peak_focus_window,
        "total_focus_hours": total_focus_hours,
        "total_sessions": sess_count,
        "avg_burnout_pct": avg_burnout_pct,
    }

    # 2. 30-Day Daily Series
    buffer_start = since_date - timedelta(days=7)
    daily_logged_map = _get_workspace_daily_minutes(db, scoped_ws_ids, buffer_start, today, user_timezone)
    
    session_daily_rows = (
        db.query(
            models.Session.start_time,
            models.Session.duration,
            models.Session.distracted_seconds,
            models.Session.distraction_count,
            models.Session.timezone,
        )
        .join(models.Workspace, models.Session.workspace_id == models.Workspace.id)
        .filter(
            models.Session.workspace_id.in_(scoped_ws_ids),
            models.Session.workspace_id.isnot(None),
            models.Session.session_type == "FOCUS",
            models.Session.status.in_(["COMPLETED", "PARTIAL"]),
            models.Session.start_time >= _utc_query_bounds(buffer_start, today, user_timezone)[0] - timedelta(days=1),
            models.Session.start_time <= _utc_query_bounds(buffer_start, today, user_timezone)[1] + timedelta(days=1),
            models.Session.duration > 0,
        )
        .all()
    )
    session_daily_map: Dict[date, Tuple[float, float, int]] = defaultdict(lambda: (0.0, 0.0, 0))
    for start_dt, dur_s, dist_s, dist_c, session_timezone in session_daily_rows:
        if not start_dt:
            continue
        ld = get_local_date(start_dt, session_timezone)
        prev_f, prev_ds, prev_dc = session_daily_map[ld]
        session_daily_map[ld] = (prev_f + float(dur_s or 0), prev_ds + float(dist_s or 0), prev_dc + int(dist_c or 0))

    # uses module-level get_local_date and compute_total_daily_sessions
    ws_targets = {ws.id: _get_workspace_daily_target(ws, today) for ws in scoped_workspaces}
    ws_created = {ws.id: get_local_date(ws.created_at) for ws in scoped_workspaces}

    daily_series = []
    curr = since_date
    while curr <= today:
        date_str = curr.isoformat()
        label_str = curr.strftime("%b %d")

        day_logged = sum(daily_logged_map.get(wid, {}).get(curr, 0.0) for wid in scoped_ws_ids)
        day_target = sum(
            ws_targets[wid]
            for wid in scoped_ws_ids
            if ws_created.get(wid, curr) <= curr
        )

        if day_logged <= 0:
            day_status = "untracked"
        else:
            if day_target <= 0:
                day_status = "green"
            else:
                ratio = day_logged / day_target
                if ratio >= 1.5:
                    day_status = "golden"
                elif ratio >= 1.0:
                    day_status = "green"
                elif ratio >= 0.5:
                    day_status = "yellow"
                else:
                    day_status = "red"

        day_f_secs, day_d_secs, day_d_cnt = session_daily_map.get(curr, (0.0, 0.0, 0))
        if day_f_secs > 0 or day_d_cnt > 0:
            day_dwr = compute_deep_flow_ratio(
                focus_seconds=day_f_secs,
                distracted_seconds=day_d_secs,
                distraction_count=day_d_cnt,
            )
        else:
            day_dwr = 0.0

        rolling_res = _compute_momentum_pace(
            db, all_workspaces, curr, window_days=7, scope_workspace_id=workspace_id, timezone_name=user_timezone
        )
        rolling_score = rolling_res["score"]

        daily_series.append({
            "date": date_str,
            "label": label_str,
            "minutes_logged": round(day_logged, 1),
            "target_minutes": day_target,
            "day_status": day_status,
            "deep_work_ratio": day_dwr,
            "rolling_score": rolling_score,
        })
        curr += timedelta(days=1)

    # 3. Workspaces Leaderboard Table
    all_ws_daily_map = _get_workspace_daily_minutes(db, all_ws_ids, today, today, user_timezone)
    all_time_totals = (
        db.query(
            models.Session.workspace_id,
            func.coalesce(func.sum(models.Session.duration), 0).label("dur"),
            func.count(models.Session.id).label("cnt"),
        )
        .join(models.Workspace, models.Session.workspace_id == models.Workspace.id)
        .filter(
            models.Session.workspace_id.in_(all_ws_ids),
            models.Session.workspace_id.isnot(None),
            models.Session.session_type == "FOCUS",
            models.Session.status == "COMPLETED",
        )
        .group_by(models.Session.workspace_id)
        .all()
    )
    all_time_ws_hours = {wid: round(dur / 3600.0, 1) for wid, dur, _ in all_time_totals}
    all_time_ws_cnt = {wid: cnt for wid, _, cnt in all_time_totals}

    workspaces_table = []
    for ws in all_workspaces:
        w_pace = _compute_momentum_pace(db, all_workspaces, today, scope_workspace_id=ws.id, timezone_name=user_timezone)
        has_sessions = all_time_ws_cnt.get(ws.id, 0) > 0
        p_label = w_pace["label"] if has_sessions else "Calibrating"
        p_score = w_pace["score"] if has_sessions else 0.0

        w_dwr = _deep_work_ratio(db, [ws.id], today, window_days=7, timezone_name=user_timezone)
        dwr_val = w_dwr if w_dwr is not None else 0.0

        w_c_streak, w_l_streak = _compute_workspace_streaks(db, ws, today - timedelta(days=89), today, today, user_timezone)
        w_longest = max(ws.longest_streak or 0, w_l_streak)

        workspaces_table.append({
            "id": ws.id,
            "name": ws.name,
            "category": ws.category or "mastery",
            "total_hours": all_time_ws_hours.get(ws.id, 0.0),
            "today_minutes": round(all_ws_daily_map.get(ws.id, {}).get(today, 0.0), 1),
            "daily_target_minutes": _get_workspace_daily_target(ws, today),
            "pace_score": p_score,
            "pace_label": p_label,
            "deep_work_ratio": dwr_val,
            "current_streak": w_c_streak,
            "longest_streak": w_longest,
        })

    workspaces_table.sort(key=lambda x: x["total_hours"], reverse=True)

    # 4. Rich Distraction Breakdown
    OS_SYSTEM_UTILITIES = {
        "snippingtool.exe",
        "screenclippinghost.exe",
        "shellexperiencehost.exe",
        "searchhost.exe",
        "startmenuexperiencehost.exe",
        "applicationframehost.exe",
        "taskmgr.exe",
        "explorer.exe",
    }

    act_query = (
        db.query(models.ActivityLog)
        .join(models.Workspace)
        .filter(
            models.Workspace.user_id == user.id,
            models.ActivityLog.is_focused == 0,
            models.ActivityLog.timestamp >= datetime.utcnow() - timedelta(days=days),
        )
    )
    if workspace_id is not None:
        act_query = act_query.filter(models.ActivityLog.workspace_id == workspace_id)

    raw_distractions = act_query.order_by(models.ActivityLog.timestamp.desc()).all()

    platform_counts: Dict[str, dict] = {}
    content_items_map: Dict[Tuple[str, str], dict] = {}
    hour_distribution = [0] * 24

    for log in raw_distractions:
        raw_app = (log.app_name or "").lower().strip()
        if raw_app in OS_SYSTEM_UTILITIES:
            continue

        clean_app = getattr(log, "clean_app_name", None)
        platform = getattr(log, "platform_name", None)
        title = getattr(log, "content_title", None)

        if not clean_app or not platform or not title:
            p_clean, p_plat, p_title = parse_activity(log.window_title or "", log.app_name or "")
            clean_app = clean_app or p_clean
            platform = platform or p_plat
            title = title or p_title or log.window_title or "Untitled Activity"

        display_platform = platform or clean_app or log.app_name or "Unknown"

        if display_platform not in platform_counts:
            platform_counts[display_platform] = {
                "name": display_platform,
                "clean_app": clean_app or log.app_name or "Application",
                "count": 0,
            }
        platform_counts[display_platform]["count"] += 1

        if log.timestamp:
            h = get_local_hour(log.timestamp, user_timezone)
            hour_distribution[h] += 1

        item_key = (display_platform, (title or "Untitled").strip())
        if item_key not in content_items_map:
            content_items_map[item_key] = {
                "platform_name": display_platform,
                "clean_app_name": clean_app or log.app_name or "Application",
                "content_title": (title or "Untitled").strip(),
                "ai_summary": log.ai_summary or (log.reason if log.reason and len(log.reason) < 60 else "Off-task activity"),
                "ai_reason": log.ai_reason or log.reason or "",
                "count": 0,
                "hour_counts": defaultdict(int),
                "last_seen": log.timestamp.isoformat() if log.timestamp else "",
            }
        content_items_map[item_key]["count"] += 1
        if log.timestamp:
            content_items_map[item_key]["hour_counts"][get_local_hour(log.timestamp, user_timezone)] += 1

    total_distraction_events = sum(p["count"] for p in platform_counts.values())

    top_platforms = []
    for p in sorted(platform_counts.values(), key=lambda x: x["count"], reverse=True)[:6]:
        pct = round((p["count"] / total_distraction_events * 100.0), 1) if total_distraction_events > 0 else 0.0
        top_platforms.append({
            "name": p["name"],
            "clean_app": p["clean_app"],
            "count": p["count"],
            "estimated_minutes": round(p["count"] * 0.5, 1),
            "pct_of_distractions": pct,
        })

    recent_distraction_items = []
    for item in sorted(content_items_map.values(), key=lambda x: x["count"], reverse=True)[:8]:
        peak_h = max(item["hour_counts"].keys(), key=lambda h: item["hour_counts"][h]) if item["hour_counts"] else None
        peak_h_label = f"{peak_h:02d}:00" if peak_h is not None else "N/A"
        recent_distraction_items.append({
            "platform_name": item["platform_name"],
            "clean_app_name": item["clean_app_name"],
            "content_title": item["content_title"],
            "ai_summary": item["ai_summary"],
            "ai_reason": item["ai_reason"],
            "count": item["count"],
            "peak_hour": peak_h_label,
            "last_seen": item["last_seen"],
        })

    hourly_dist_formatted = [
        {
            "hour": h,
            "label": f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}",
            "count": hour_distribution[h],
        }
        for h in range(24)
    ]

    distractions_breakdown = {
        "top_platforms": top_platforms,
        "recent_distraction_items": recent_distraction_items,
        "hourly_distraction_distribution": hourly_dist_formatted,
    }

    return {
        "summary": summary,
        "daily_series": daily_series,
        "workspaces_table": workspaces_table,
        "distractions_breakdown": distractions_breakdown,
    }
