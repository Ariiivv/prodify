import os
import logging
from datetime import datetime
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
from app.services.intent_classifier import classify_with_intent

client = AsyncOpenAI(
    api_key=os.getenv("GROQ_API_KEY", "missing_key"),
    base_url="https://api.groq.com/openai/v1",
)

router = APIRouter()
logger = logging.getLogger("prodify_telemetry")

# Tracker instance (set from main.py on startup)
_tracker = None


def set_tracker(tracker):
    """Called from main.py on startup to inject the FocusTracker instance"""
    global _tracker
    _tracker = tracker


class ActivityLog(BaseModel):
    window_title: str
    app_name: str
    intent: str = ""
    workspace_id: Optional[int] = None


class ActivityClassification(BaseModel):
    status: str
    reason: str
    window_title: str
    app_name: str


class SessionResponse(BaseModel):
    id: int
    workspace_id: int
    duration_minutes: int
    distraction_count: int
    burnout_score: float = 0.0
    created_date: str = ""


class DistractionLog(BaseModel):
    workspace_id: int
    distraction_type: str
    timestamp: str


class SessionCreate(BaseModel):
    workspace_id: int
    duration_minutes: int
    distraction_count: int = 0
    burnout_score: float = 0.0


def require_owned_workspace(workspace_id: int, user_id: str, db: Session) -> models.Workspace:
    workspace = (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id, models.Workspace.user_id == user_id)
        .first()
    )
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
    return workspace


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
    require_owned_workspace(payload.workspace_id, current_user.id, db)
    session = models.Session(
        workspace_id=payload.workspace_id,
        duration=max(0, payload.duration_minutes) * 60,
        session_type="FOCUS",
        status="COMPLETED",
        end_time=datetime.utcnow(),
        burnout_score=max(0.0, min(1.0, payload.burnout_score)),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
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
    require_owned_workspace(payload.workspace_id, current_user.id, db)
    log = models.TelemetryLog(
        workspace_id=payload.workspace_id,
        metric_type=payload.distraction_type.upper(),
        distraction_type=payload.distraction_type,
        timestamp=datetime.fromisoformat(payload.timestamp),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"success": True, "log_id": log.id}


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
    Receive window activity from Electron, classify it as focused/distracted,
    update the FocusTracker, and return classification.
    """
    if payload.workspace_id is not None:
        require_owned_workspace(payload.workspace_id, current_user.id, db)

    status, reason = await classify_with_intent(
        window_title=payload.window_title,
        app_name=payload.app_name,
        intent=payload.intent,
    )

    if _tracker:
        _tracker.update_window_activity(
            window_title=payload.window_title,
            app_name=payload.app_name,
            window_status=status,
            reason=reason
        )

    background_tasks.add_task(
        crud.log_activity_record_async,
        app_name=payload.app_name,
        window_title=payload.window_title,
        intent=payload.intent,
        is_focused=(status == "focused"),
        reason=reason,
        workspace_id=payload.workspace_id,
    )

    return ActivityClassification(
        status=status,
        reason=reason,
        window_title=payload.window_title,
        app_name=payload.app_name,
    )


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


@router.get("/ml/burnout-prediction", response_model=BurnoutPredictionResponse)
@router.get("/telemetry/ml/burnout-prediction", response_model=BurnoutPredictionResponse)
def get_burnout_prediction(
    current_hour: int = 14,
    current_focus_minutes: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Calculate real-time burnout probability based on elapsed focus time, time of day, and recent tab switches.
    """
    base_prob = min(0.95, (current_focus_minutes / 45.0) * 0.4)
    # Adjust for afternoon slump (2-4 PM) or late night (>10 PM)
    if 14 <= current_hour <= 16 or current_hour >= 22:
        base_prob = min(0.95, base_prob + 0.15)
    
    risk = "High" if base_prob >= 0.7 else ("Moderate" if base_prob >= 0.4 else "Low")
    return BurnoutPredictionResponse(
        tab_switch_probability=round(base_prob, 2),
        burnout_risk=risk,
    )
