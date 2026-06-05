from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime
from database.connection import get_db
from database import models

router = APIRouter()

class DistractionLog(BaseModel):
    workspace_id: int
    distraction_type: str
    timestamp: str

@router.post("/telemetry/distraction")
def log_distraction(payload: DistractionLog, db: Session = Depends(get_db)):
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
def get_total_sessions(db: Session = Depends(get_db)):
    """Return the total number of completed focus sessions across all workspaces."""
    total = db.query(func.count(models.Session.id)).filter(
        models.Session.session_type == "FOCUS",
        models.Session.status == "COMPLETED"
    ).scalar() or 0
    return {"total_sessions": total}

@router.get("/telemetry/total-sessions/{workspace_id}", response_model=TotalSessionsResponse)
def get_total_sessions_by_workspace(workspace_id: int, db: Session = Depends(get_db)):
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
def get_focus_density(workspace_id: int, db: Session = Depends(get_db)):
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

    # FDS: ratio of uninterrupted work time, penalized by distraction events
    if total_focus_seconds == 0:
        fds = 0.0
    else:
        penalty = min(distraction_count * 30, total_focus_seconds)  # 30s penalty per distraction
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
def get_distraction_velocity(workspace_id: int, db: Session = Depends(get_db)):
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
            velocity = (window_size / time_span * 60) if time_span > 0 else 0  # distractions per minute
            timestamps.append(end.isoformat())
            velocities.append(round(velocity, 2))

    return DistractionVelocityResponse(timestamps=timestamps, velocities=velocities)

class VolumetricEfficiencyResponse(BaseModel):
    workspace_labels: list[str]
    focus_minutes: list[int]

@router.get("/telemetry/volumetric-efficiency", response_model=VolumetricEfficiencyResponse)
def get_volumetric_efficiency(db: Session = Depends(get_db)):
    """Compare total active focus minutes across all workspaces."""
    workspaces = db.query(models.Workspace).all()
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