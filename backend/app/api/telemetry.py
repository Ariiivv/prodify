import logging
import os
import json
from datetime import datetime, timedelta, date
from typing import Optional
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from openai import AsyncOpenAI

from app.models.connection import get_db
from app.models import crud
from app.models import schemas as models
from app.api.auth import get_current_user
from app.services.intent_classifier import (
    classify_with_intent,
    reset_workspace_focus_state,
    clear_intent_cache,
    allow_window_for_session,
)
from app.services.activity_parser import parse_activity
from app.services.input_activity import evaluate_input_activity

client = AsyncOpenAI(
    api_key=os.getenv("GROQ_API_KEY", "missing_key"),
    base_url="https://api.groq.com/openai/v1",
)

router = APIRouter()
logger = logging.getLogger("prodify_telemetry")


def _safe_rollback(db: Session) -> None:
    try:
        db.rollback()
    except Exception as rollback_exc:
        logger.warning("[OFFLINE] Database rollback also failed; discarding broken session: %s", rollback_exc)

class ActivityLog(BaseModel):
    window_title: str
    app_name: str
    intent: str = ""
    workspace_id: Optional[int] = None
    minute_into_session: Optional[float] = None
    trigger_app: Optional[str] = None


class ActivityClassification(BaseModel):
    status: str
    reason: str
    summary: Optional[str] = None
    window_title: str
    app_name: str
    clean_app_name: Optional[str] = None
    platform_name: Optional[str] = None
    content_title: Optional[str] = None
    is_focused: bool
    similarity_score: float
    local_rule_match: str
    engagement_mode: str = "mixed"
    idle_allowance_seconds: int = 300


class InputActivityLog(BaseModel):
    workspace_id: int
    window_title: str = ""
    app_name: str = ""
    intent: str = ""
    idle_seconds: float = 0.0
    keystrokes: int = 0
    clicks: int = 0


class InputActivityResponse(BaseModel):
    status: str
    reason: str
    idle_seconds: float
    threshold_seconds: int
    contextual_alignment: str


class SessionResponse(BaseModel):
    id: int
    workspace_id: int
    workspace_name: str = "Unknown"
    duration_minutes: int
    distraction_count: int
    burnout_score: float = 0.0
    created_date: str = ""


class DistractionLog(BaseModel):
    workspace_id: int
    distraction_type: str
    timestamp: str
    minute_into_session: Optional[float] = None
    trigger_app: Optional[str] = None


class SessionCreate(BaseModel):
    workspace_id: int
    duration_minutes: int
    distraction_count: int = 0
    distracted_seconds: float = 0.0
    burnout_score: float = 0.0
    timezone: Optional[str] = None  # IANA timezone string, e.g. "America/New_York"
    status: Optional[str] = "COMPLETED"
    minute_into_session: Optional[float] = None


def require_owned_workspace(workspace_id: int, user_id: str, db: Session) -> models.Workspace:
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id, models.Workspace.user_id == user_id)
        .first()
    )
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
    return workspace


def _compute_telemetry_coordinates(
    db: Session,
    workspace_id: int,
    event_time: Optional[datetime] = None,
    minute_into_session: Optional[float] = None,
) -> dict:
    if event_time is None:
        event_time = datetime.utcnow()

    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if workspace and workspace.created_at:
        track_day_number = max(1, (event_time.date() - workspace.created_at.date()).days + 1)
    else:
        track_day_number = 1

    today_start_utc = datetime.combine(event_time.date(), datetime.min.time())
    session_count = (
        db.query(func.count(models.Session.id))
        .filter(
            models.Session.workspace_id == workspace_id,
            models.Session.session_type == "FOCUS",
            models.Session.start_time >= today_start_utc,
        )
        .scalar()
        or 0
    )
    session_index_today = session_count + 1
    clock_hour = event_time.hour

    if minute_into_session is not None:
        clean_minute = round(max(0.0, float(minute_into_session)), 2)
    else:
        clean_minute = 0.0

    return {
        "track_day_number": track_day_number,
        "session_index_today": session_index_today,
        "minute_into_session": clean_minute,
        "clock_hour": clock_hour,
    }


@router.get("/telemetry/sessions", response_model=list[SessionResponse])
def get_sessions(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return the most recent focus sessions with distraction counts."""
    sessions = (
        db.query(models.Session)
        .join(models.Workspace)
        .filter(models.Session.session_type == "FOCUS")
        .filter(models.Workspace.user_id == current_user.id)
        .order_by(models.Session.start_time.desc())
        .limit(limit)
        .all()
    )
    results = []
    for s in sessions:
        distraction_count = (
            db.query(func.count(models.TelemetryLog.id))
            .filter(models.TelemetryLog.session_id == s.id)
            .scalar() or 0
        )
        created_date = s.start_time.strftime("%Y-%m-%d %H:%M") if s.start_time else ""
        results.append(SessionResponse(
            id=s.id,
            workspace_id=s.workspace_id,
            workspace_name=s.workspace.name if s.workspace else 'Unknown',
            duration_minutes=(s.duration or 0) // 60,
            distraction_count=distraction_count,
            burnout_score=s.burnout_score or 0.0,
            created_date=created_date,
        ))
    return results


@router.post("/telemetry/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_completed_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        workspace = require_owned_workspace(payload.workspace_id, current_user.id, db)
    except HTTPException:
        raise
    except Exception as exc:
        _safe_rollback(db)
        logger.warning("[OFFLINE] Session workspace lookup failed; continuing locally: %s", exc)
        workspace = None
    end_time = datetime.utcnow()
    duration_secs = max(0, payload.duration_minutes) * 60
    start_time = end_time - timedelta(seconds=duration_secs)

    try:
        coords = _compute_telemetry_coordinates(db, payload.workspace_id, start_time)
    except Exception as exc:
        _safe_rollback(db)
        logger.warning("[OFFLINE] Session coordinates unavailable; using safe defaults: %s", exc)
        coords = {"track_day_number": 1, "session_index_today": 1}

    session = models.Session(
        user_id=current_user.id,
        workspace_id=payload.workspace_id,
        start_time=start_time,
        end_time=end_time,
        duration=duration_secs,
        session_type="FOCUS",
        status=payload.status or "COMPLETED",
        burnout_score=max(0.0, min(1.0, payload.burnout_score)),
        distraction_count=max(0, payload.distraction_count),
        distracted_seconds=max(0.0, payload.distracted_seconds),
        timezone=payload.timezone,
        track_day_number=coords["track_day_number"],
        session_index_today=coords["session_index_today"],
    )
    try:
        db.add(session)
        db.commit()
        db.refresh(session)
    except Exception as exc:
        _safe_rollback(db)
        logger.warning("[OFFLINE] Session persistence skipped; returning local success: %s", exc)
        return SessionResponse(
            id=0,
            workspace_id=payload.workspace_id,
            duration_minutes=payload.duration_minutes,
            distraction_count=payload.distraction_count,
            burnout_score=max(0.0, min(1.0, payload.burnout_score)),
            created_date=start_time.strftime("%Y-%m-%d %H:%M"),
        )

    # Immediately sync DailyWorkspaceLog & streak calculation
    try:
        from app.models.crud import update_or_create_daily_log, evaluate_global_streak, get_local_date
        session_mins = max(1, round(duration_secs / 60))
        local_session_date = get_local_date(start_time)
        update_or_create_daily_log(
            db=db,
            workspace_id=payload.workspace_id,
            log_date=local_session_date,
            session_minutes=session_mins,
            intent_score=1.0,
        )
        evaluate_global_streak(db=db, user_id=current_user.id, log_date=local_session_date)
    except Exception as log_ex:
        _safe_rollback(db)
        logger.warning(f"[TELEMETRY] Failed to sync daily log for workspace {payload.workspace_id}: {log_ex}")

    # Persist the distraction count as a summary TelemetryLog so it survives
    # beyond the response and is queryable via the existing TelemetryLog join.
    if payload.distraction_count > 0:
        summary_log = models.TelemetryLog(
            workspace_id=payload.workspace_id,
            session_id=session.id,
            metric_type="SESSION_DISTRACTION_SUMMARY",
            distraction_type="AGGREGATE",
            value=float(payload.distraction_count),
            reason=f"{payload.distraction_count} distractions during {payload.duration_minutes}min session",
            track_day_number=coords["track_day_number"],
            session_index_today=coords["session_index_today"],
            clock_hour=end_time.hour,
            minute_into_session=float(payload.duration_minutes),
        )
        try:
            db.add(summary_log)
            db.commit()
        except Exception as exc:
            _safe_rollback(db)
            logger.warning("[OFFLINE] Session summary telemetry was not persisted: %s", exc)

    # Sprint Auto-Completion Check
    if workspace is not None and workspace.category == "sprint" and workspace.target_hours:
        total_focus_secs = (
            db.query(func.sum(models.Session.duration))
            .filter(
                models.Session.workspace_id == workspace.id,
                models.Session.session_type == "FOCUS",
                models.Session.status == "COMPLETED",
            )
            .scalar() or 0
        )
        target_secs = workspace.target_hours * 3600
        past_deadline = bool(workspace.deadline and date.today() > workspace.deadline)
        if total_focus_secs >= target_secs or past_deadline:
            workspace.status = "completed"
            workspace.daily_target_minutes = 0
            try:
                db.commit()
            except Exception as exc:
                _safe_rollback(db)
                logger.warning("[OFFLINE] Sprint status update was not persisted: %s", exc)

    return SessionResponse(
        id=session.id,
        workspace_id=session.workspace_id,
        duration_minutes=(session.duration or 0) // 60,
        distraction_count=payload.distraction_count,
        burnout_score=session.burnout_score or 0.0,
        created_date=session.start_time.strftime("%Y-%m-%d %H:%M") if session.start_time else "",
    )


@router.post("/telemetry/distraction")
def log_distraction(
    payload: DistractionLog,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        require_owned_workspace(payload.workspace_id, current_user.id, db)
    except HTTPException:
        raise
    except Exception as exc:
        _safe_rollback(db)
        logger.warning("[OFFLINE] Distraction workspace lookup failed; continuing locally: %s", exc)
    try:
        event_time = datetime.fromisoformat(payload.timestamp)
    except Exception:
        event_time = datetime.utcnow()

    try:
        coords = _compute_telemetry_coordinates(db, payload.workspace_id, event_time, payload.minute_into_session)
    except Exception as exc:
        _safe_rollback(db)
        logger.warning("[OFFLINE] Distraction coordinates unavailable; using safe defaults: %s", exc)
        coords = {"track_day_number": 1, "session_index_today": 1, "minute_into_session": payload.minute_into_session or 0.0, "clock_hour": event_time.hour}

    log = models.TelemetryLog(
        workspace_id=payload.workspace_id,
        metric_type=payload.distraction_type.upper(),
        distraction_type=payload.distraction_type,
        timestamp=event_time,
        track_day_number=coords["track_day_number"],
        session_index_today=coords["session_index_today"],
        minute_into_session=coords["minute_into_session"],
        clock_hour=coords["clock_hour"],
        trigger_app=payload.trigger_app,
    )
    try:
        db.add(log)
        db.commit()
        db.refresh(log)
        return {"success": True, "log_id": log.id}
    except Exception as exc:
        _safe_rollback(db)
        logger.warning("[OFFLINE] Distraction event was not persisted; continuing: %s", exc)
        return {"success": True, "log_id": None}


class TotalSessionsResponse(BaseModel):
    total_sessions: int


@router.get("/telemetry/total-sessions", response_model=TotalSessionsResponse)
def get_total_sessions(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    """Return the total number of completed focus sessions across all workspaces."""
    total = db.query(func.count(models.Session.id)).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.Session.session_type == "FOCUS",
        models.Session.status == "COMPLETED"
    ).scalar() or 0
    return {"total_sessions": total}


@router.get("/telemetry/total-sessions/{workspace_id}", response_model=TotalSessionsResponse)
def get_total_sessions_by_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_owned_workspace(workspace_id, current_user.id, db)
    """Return the total number of completed focus sessions for a specific workspace."""
    total = db.query(func.count(models.Session.id)).filter(
        models.Session.workspace_id == workspace_id,
        models.Session.session_type == "FOCUS",
        models.Session.status == "COMPLETED"
    ).scalar() or 0
    return {"total_sessions": total}


# --- High-Value Analytics Endpoints ---

class FocusDensityResponse(BaseModel):
    focus_density_score: float
    total_focus_seconds: int
    total_distractions: int


@router.get("/telemetry/focus-density/{workspace_id}", response_model=FocusDensityResponse)
def get_focus_density(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_owned_workspace(workspace_id, current_user.id, db)
    """Calculate Focus Density Score: uninterrupted work time penalized by tab switches."""
    sessions = db.query(models.Session).filter(
        models.Session.workspace_id == workspace_id,
        models.Session.session_type == "FOCUS",
        models.Session.status == "COMPLETED"
    ).all()

    total_focus_seconds = sum((s.duration or 0) for s in sessions)
    distraction_count = db.query(func.count(models.TelemetryLog.id)).filter(
        models.TelemetryLog.workspace_id == workspace_id,
        models.TelemetryLog.distraction_type == "TAB_SWITCH"
    ).scalar() or 0

    if total_focus_seconds == 0:
        fds = 0.0
    else:
        penalty = min(distraction_count * 30, total_focus_seconds)
        fds = max(0.0, (total_focus_seconds - penalty) / total_focus_seconds)

    return FocusDensityResponse(
        focus_density_score=round(fds, 4),
        total_focus_seconds=total_focus_seconds,
        total_distractions=distraction_count
    )


class DistractionVelocityResponse(BaseModel):
    timestamps: list[str]
    velocities: list[float]


@router.get("/telemetry/distraction-velocity/{workspace_id}", response_model=DistractionVelocityResponse)
def get_distraction_velocity(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_owned_workspace(workspace_id, current_user.id, db)
    """Rolling metric of tab-switch frequencies over time."""
    logs = db.query(models.TelemetryLog).filter(
        models.TelemetryLog.workspace_id == workspace_id,
        models.TelemetryLog.distraction_type == "TAB_SWITCH"
    ).order_by(models.TelemetryLog.timestamp).all()

    timestamps = []
    velocities = []
    if len(logs) >= 2:
        window_size = min(5, len(logs))
        for i in range(len(logs) - window_size + 1):
            window = logs[i:i + window_size]
            start = window[0].timestamp
            end = window[-1].timestamp
            time_span = (end - start).total_seconds()
            velocity = (window_size / time_span * 60) if time_span > 0 else 0
            timestamps.append(end.isoformat())
            velocities.append(round(velocity, 2))

    return DistractionVelocityResponse(timestamps=timestamps, velocities=velocities)


class VolumetricEfficiencyResponse(BaseModel):
    workspace_labels: list[str]
    focus_minutes: list[int]


@router.get("/telemetry/volumetric-efficiency", response_model=VolumetricEfficiencyResponse)
def get_volumetric_efficiency(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    """Compare total active focus minutes across all workspaces."""
    workspaces = db.query(models.Workspace).filter(models.Workspace.user_id == current_user.id).all()
    labels = []
    minutes = []
    for ws in workspaces:
        total_secs = db.query(func.sum(models.Session.duration)).filter(
            models.Session.workspace_id == ws.id,
            models.Session.session_type == "FOCUS",
            models.Session.status == "COMPLETED"
        ).scalar() or 0
        labels.append(ws.name)
        minutes.append(total_secs // 60)
    return VolumetricEfficiencyResponse(workspace_labels=labels, focus_minutes=minutes)


@router.post("/telemetry/activity", response_model=ActivityClassification)
async def log_activity(
    payload: ActivityLog,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Receive desktop window activity, classify it locally as focused/distracted,
    and return the classification while persistence continues in the background.
    """
    coords = None
    if payload.workspace_id is not None:
        try:
            require_owned_workspace(payload.workspace_id, current_user.id, db)
            coords = _compute_telemetry_coordinates(
                db, payload.workspace_id, datetime.utcnow(), payload.minute_into_session
            )
        except HTTPException:
            raise
        except Exception as exc:
            _safe_rollback(db)
            logger.warning("[OFFLINE] Telemetry metadata unavailable; returning local classification: %s", exc)

    status, reason, summary, similarity_score, local_rule_match, engagement_mode, idle_allowance_seconds = await classify_with_intent(
        window_title=payload.window_title,
        app_name=payload.app_name,
        intent=payload.intent,
        workspace_id=payload.workspace_id,
    )

    clean_app_name, platform_name, content_title = parse_activity(
        payload.window_title, payload.app_name
    )

    logger.info(
        "[TELEMETRY CLASSIFICATION] App: '%s' | Title: '%s' | Status: %s | Score: %.2f | Reason: %s",
        clean_app_name or payload.app_name,
        content_title[:50] if content_title else payload.window_title[:50],
        status.upper(),
        similarity_score,
        reason,
    )

    background_tasks.add_task(
        crud.log_activity_record_async,
        app_name=payload.app_name,
        window_title=payload.window_title,
        intent=payload.intent,
        is_focused=int(status == "focused"),
        reason=reason,
        workspace_id=payload.workspace_id,
        clean_app_name=clean_app_name,
        platform_name=platform_name,
        content_title=content_title,
        ai_summary=summary,
        ai_reason=reason,
        similarity_score=similarity_score,
        track_day_number=coords["track_day_number"] if coords else None,
        session_index_today=coords["session_index_today"] if coords else None,
        minute_into_session=coords["minute_into_session"] if coords else None,
        clock_hour=coords["clock_hour"] if coords else None,
    )

    if status == "distracted" and payload.workspace_id is not None and coords:
        try:
            distraction_log = models.TelemetryLog(
                workspace_id=payload.workspace_id,
                metric_type="WINDOW_DISTRACTION",
                distraction_type="TAB_SWITCH",
                trigger_app=payload.trigger_app or clean_app_name or payload.app_name,
                reason=reason,
                track_day_number=coords["track_day_number"],
                session_index_today=coords["session_index_today"],
                minute_into_session=coords["minute_into_session"],
                clock_hour=coords["clock_hour"],
                timestamp=datetime.utcnow(),
            )
            db.add(distraction_log)
            db.commit()
        except Exception as ex:
            _safe_rollback(db)
            logger.warning("[OFFLINE] Distraction telemetry was not persisted; continuing polling: %s", ex)

    return ActivityClassification(
        status=status,
        reason=reason,
        summary=summary,
        window_title=payload.window_title,
        app_name=payload.app_name,
        clean_app_name=clean_app_name,
        platform_name=platform_name,
        content_title=content_title,
        is_focused=status == "focused",
        similarity_score=similarity_score,
        local_rule_match=local_rule_match,
        engagement_mode=engagement_mode,
        idle_allowance_seconds=idle_allowance_seconds,
    )


@router.post("/telemetry/input-activity", response_model=InputActivityResponse)
async def log_input_activity(
    payload: InputActivityLog,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Evaluate and persist local keyboard/mouse inactivity telemetry."""
    workspace = require_owned_workspace(payload.workspace_id, current_user.id, db)
    classification = await classify_with_intent(
        window_title=payload.window_title,
        app_name=payload.app_name,
        intent=payload.intent or workspace.current_goal or workspace.focus_keywords or "",
        workspace_id=payload.workspace_id,
    )
    verdict = evaluate_input_activity(
        category=workspace.category,
        idle_seconds=payload.idle_seconds,
        keystrokes=max(0, payload.keystrokes),
        clicks=max(0, payload.clicks),
        aligned=classification[0] == "focused",
        window_title=payload.window_title,
        app_name=payload.app_name,
    )

    try:
        db.add(models.TelemetryLog(
            workspace_id=payload.workspace_id,
            metric_type="INPUT_ACTIVITY",
            value=max(0.0, payload.idle_seconds),
            reason=verdict.reason,
            metadata_json=json.dumps({
                "keystrokes": max(0, payload.keystrokes),
                "clicks": max(0, payload.clicks),
                "window_title": payload.window_title,
                "app_name": payload.app_name,
                "contextual_alignment": verdict.contextual_alignment,
            }),
        ))
        db.commit()
    except Exception as exc:
        _safe_rollback(db)
        logger.warning("[OFFLINE] Input activity telemetry was not persisted: %s", exc)

    return InputActivityResponse(
        status=verdict.status,
        reason=verdict.reason,
        idle_seconds=max(0.0, payload.idle_seconds),
        threshold_seconds=verdict.threshold_seconds,
        contextual_alignment=verdict.contextual_alignment,
    )


class ResetFocusPayload(BaseModel):
    workspace_id: Optional[int] = None


@router.post("/telemetry/reset-focus")
def reset_focus(
    payload: ResetFocusPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Reset the latch/focus state for a workspace so returning to focus clears
    the active distraction and immediate re-triggering is possible if distracted again.
    """
    if payload.workspace_id is not None:
        require_owned_workspace(payload.workspace_id, current_user.id, db)
        clear_intent_cache(payload.workspace_id)
    else:
        clear_intent_cache()
    return {"success": True}


class AllowWindowPayload(BaseModel):
    workspace_id: int
    app_name: str
    window_title: str


@router.post("/telemetry/allow-window")
def allow_window_endpoint(
    payload: AllowWindowPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Allow a specific window/application for the duration of the active session in this workspace.
    Adds window to session override whitelist, immediately unlatches workspace focus state,
    and sets semantic cache to focused.
    """
    require_owned_workspace(payload.workspace_id, current_user.id, db)
    allow_window_for_session(
        workspace_id=payload.workspace_id,
        app_name=payload.app_name,
        window_title=payload.window_title,
    )
    return {
        "success": True,
        "message": f"Window '{payload.window_title[:40]}' whitelisted for session.",
    }


class CoachInsightsResponse(BaseModel):
    insights: str


@router.get("/telemetry/coach-insights", response_model=CoachInsightsResponse)
async def get_coach_insights(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Analyze recent activity logs with Groq (Llama 3.3 70B) to generate personalized coaching insights."""
    logs = crud.get_recent_activity_logs(db, user_id=current_user.id, days=days, limit=300)

    if not logs:
        return CoachInsightsResponse(
            insights="No activity history recorded yet. Start running focus sessions in your workspaces to let Prodify analyze your focus habits and distraction patterns over time!"
        )

    total_logs = len(logs)
    focused_count = sum(1 for l in logs if l.is_focused == 1)
    distracted_count = total_logs - focused_count
    focus_pct = round((focused_count / total_logs) * 100) if total_logs > 0 else 0

    distraction_apps = {}
    for l in logs:
        if l.is_focused == 0:
            app = l.app_name or "Unknown App"
            distraction_apps[app] = distraction_apps.get(app, 0) + 1

    sorted_distractions = sorted(distraction_apps.items(), key=lambda x: x[1], reverse=True)[:5]
    distractions_summary = ", ".join(f"{app} ({cnt} times)" for app, cnt in sorted_distractions) if sorted_distractions else "None"

    sample_lines = []
    chronological_logs = sorted(logs, key=lambda l: l.timestamp if l.timestamp else datetime.min)
    for l in chronological_logs[:300]:
        status_str = "FOCUSED" if l.is_focused == 1 else "DISTRACTED"
        ts_str = l.timestamp.strftime("%Y-%m-%d %I:%M %p") if l.timestamp else ""
        sample_lines.append(f"[{ts_str}] WS:{l.workspace_id} | Intent:\"{l.intent}\" | App:{l.app_name} | Title:\"{l.window_title}\" -> {status_str} ({l.reason or ''})")

    history_str = (
        f"OVERVIEW: Analyzed {total_logs} window switches over the last {days} days.\n"
        f"Overall Focus Rate: {focus_pct}% ({focused_count} focused vs {distracted_count} distracted).\n"
        f"Top Distracting Apps: {distractions_summary}.\n\n"
        f"CHRONOLOGICAL ACTIVITY TIMELINE:\n" + "\n".join(sample_lines)
    )

    system_prompt = (
        "You are a ruthless, highly intelligent behavioral analyst and productivity coach. "
        "Analyze the user's window switching history. Look for deep behavioral patterns. "
        "Example output tone: 'You are crushing your web development tasks on The Odin Project, but I noticed that when you study Python and Pandas, you consistently derail your sessions around 2:00 PM to watch eFootball streams or research RTX 50-series PC builds on YouTube. We need to isolate your gaming and hardware research outside of study hours.'\n\n"
        "INSTRUCTIONS:\n"
        "1. Deeply analyze chronological logs (timestamps, intent, app names, window titles) to find correlations between specific tasks and distraction triggers.\n"
        "2. Identify time-of-day derailments, app-switching habits, and task-specific weaknesses.\n"
        "3. Respond like a strict but insightful coach with direct, actionable, conversational guidance without robotic formatting."
    )

    try:
        completion = await client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"USER ACTIVITY HISTORY:\n{history_str}"}
            ],
            temperature=0.7,
            max_tokens=600,
        )
        insights_text = completion.choices[0].message.content.strip()
        if not insights_text:
            raise ValueError("Empty response from AI")
        return CoachInsightsResponse(insights=insights_text)
    except Exception as e:
        logger.error(f"Error generating AI coach insights: {e}")
        fallback = (
            f"Here is your pattern summary for the last {days} days: You maintained a {focus_pct}% focus rate across {total_logs} logged window evaluations. "
            f"Your most frequent distractions occurred in: {distractions_summary}. "
            f"To stay locked in, consider closing or blocking these apps before initiating your deep work sessions!"
        )
        return CoachInsightsResponse(insights=fallback)


# --- Burnout Prediction Endpoint ---

class BurnoutPredictionResponse(BaseModel):
    tab_switch_probability: float
    burnout_risk: str
    predicted_decay_minute: Optional[float] = 25.0
    top_trigger_app: Optional[str] = None
    peak_distraction_hour: Optional[int] = None
    safest_focus_hour: Optional[int] = None


@router.get("/ml/burnout-prediction", response_model=BurnoutPredictionResponse)
@router.get("/telemetry/ml/burnout-prediction", response_model=BurnoutPredictionResponse)
def get_burnout_prediction(
    current_hour: int = 14,
    current_focus_minutes: int = 0,
    distraction_count: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Calculate real-time burnout and tab switch probability based on cumulative focus time,
    distraction count, and user's Scikit-Learn attention decay wall & circadian profile.
    """
    try:
        from app.services.ml_pattern_engine import predict_realtime_burnout

        ml_res = predict_realtime_burnout(
            db=db,
            user_id=current_user.id,
            current_hour=current_hour,
            current_focus_minutes=current_focus_minutes,
            distraction_count=distraction_count,
        )
        return BurnoutPredictionResponse(
            tab_switch_probability=ml_res["tab_switch_probability"],
            burnout_risk=ml_res["burnout_risk"],
            predicted_decay_minute=ml_res.get("predicted_decay_minute", 25.0),
            top_trigger_app=ml_res.get("top_trigger_app"),
            peak_distraction_hour=ml_res.get("peak_distraction_hour"),
            safest_focus_hour=ml_res.get("safest_focus_hour"),
        )
    except Exception as exc:
        logger.warning(f"[BURNOUT] Scikit-Learn prediction failed, falling back to heuristic: {exc}")
        fatigue_from_time = (current_focus_minutes / 60.0) * 0.12
        fatigue_from_distractions = distraction_count * 0.02
        base_prob = fatigue_from_time + fatigue_from_distractions

        if current_hour >= 22 or current_hour < 5:
            base_prob += 0.10
        elif 14 <= current_hour <= 16:
            base_prob += 0.05

        base_prob = max(0.0, min(0.90, base_prob))
        risk = "High" if base_prob >= 0.70 else ("Moderate" if base_prob >= 0.35 else "Low")

        return BurnoutPredictionResponse(
            tab_switch_probability=round(base_prob, 2),
            burnout_risk=risk,
            predicted_decay_minute=25.0,
            top_trigger_app=None,
            peak_distraction_hour=15,
            safest_focus_hour=10,
        )
