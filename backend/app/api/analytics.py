from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.models.connection import get_db
from app.models import schemas as models
from app.api.auth import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])

class GlobalMetricsOut(BaseModel):
    total_focus_hours: float
    best_workspace_name: Optional[str]
    best_time_of_day: Optional[str]
    average_burnout_score: float
    total_distractions: int
    most_productive_day: Optional[str]

@router.get("/global-metrics", response_model=GlobalMetricsOut)
def get_global_metrics(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    metrics = db.query(models.WorkspaceMetrics).join(models.Workspace).filter(models.Workspace.user_id == current_user.id).all()
    if not metrics:
        return GlobalMetricsOut(
            total_focus_hours=0.0,
            best_workspace_name=None,
            best_time_of_day=None,
            average_burnout_score=0.0,
            total_distractions=0,
            most_productive_day=None,
        )

    total_focus_minutes = sum(m.focus_minutes for m in metrics)
    total_distractions = sum(m.distraction_count for m in metrics)
    average_burnout_score = sum(m.burnout_score for m in metrics) / len(metrics)
    
    # Best workspace by focus minutes
    # group by workspace_name in case there are multiple sessions
    workspace_focus = {}
    for m in metrics:
        workspace_focus[m.workspace_name] = workspace_focus.get(m.workspace_name, 0) + m.focus_minutes
    best_workspace = max(workspace_focus.items(), key=lambda x: x[1])[0] if workspace_focus else None
    
    # Best time of day
    time_of_day_counts = {}
    for m in metrics:
        time_of_day_counts[m.time_of_day] = time_of_day_counts.get(m.time_of_day, 0) + m.focus_minutes
    best_time_of_day = max(time_of_day_counts.items(), key=lambda x: x[1])[0] if time_of_day_counts else None
    
    # Most productive day of week
    day_counts = {}
    for m in metrics:
        day_name = m.session_date.strftime("%A")
        day_counts[day_name] = day_counts.get(day_name, 0) + m.focus_minutes
    most_productive_day = max(day_counts.items(), key=lambda x: x[1])[0] if day_counts else None

    return GlobalMetricsOut(
        total_focus_hours=total_focus_minutes / 60.0,
        best_workspace_name=best_workspace,
        best_time_of_day=best_time_of_day,
        average_burnout_score=average_burnout_score,
        total_distractions=total_distractions,
        most_productive_day=most_productive_day,
    )


@router.get("/global")
def get_global_stats(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import date, timedelta
    stats = db.query(models.UserStats).filter(models.UserStats.user_id == current_user.id).first()
    cutoff = date.today() - timedelta(days=10)
    
    logs = db.query(models.DailyWorkspaceLog).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.DailyWorkspaceLog.date >= cutoff
    ).all()
    
    score = sum(log.intent_score for log in logs) / len(logs) if logs else 0.0
    
    return {
        "current_global_streak": stats.current_global_streak if stats else 0,
        "longest_global_streak": stats.longest_global_streak if stats else 0,
        "ten_day_rolling_score": round(score, 1)
    }

@router.get("/workspace/{workspace_id}/recent")
def get_workspace_recent(workspace_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=7)
    
    logs = db.query(models.DailyWorkspaceLog).filter(
        models.DailyWorkspaceLog.workspace_id == workspace_id,
        models.DailyWorkspaceLog.date >= cutoff
    ).order_by(models.DailyWorkspaceLog.date.asc()).all()
    
    return [
        {
            "date": log.date.isoformat(),
            "target_met": log.target_met,
            "minutes_logged": log.minutes_logged,
            "target_minutes_required": log.target_minutes_required
        }
        for log in logs
    ]

@router.get("/calendar")
def get_calendar(year: int, month: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import date, timedelta
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year+1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month+1, 1) - timedelta(days=1)
        
    logs = db.query(models.DailyWorkspaceLog).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.DailyWorkspaceLog.date >= start_date,
        models.DailyWorkspaceLog.date <= end_date
    ).all()
    
    result = {}
    for log in logs:
        ds = log.date.isoformat()
        if ds not in result:
            result[ds] = {"total_logged": 0, "perfect_day": True, "workspaces_active": 0}
        
        result[ds]["total_logged"] += log.minutes_logged
        result[ds]["workspaces_active"] += 1
        if not log.target_met:
            result[ds]["perfect_day"] = False
            
    return result

@router.get("/distracting-apps")
def get_distracting_apps(
    limit: int = 6,
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    from sqlalchemy import func, desc
    
    results = db.query(
        models.ActivityLog.app_name, 
        func.count(models.ActivityLog.id).label('count')
    ).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.ActivityLog.is_focused == 0
    ).group_by(
        models.ActivityLog.app_name
    ).order_by(
        desc('count')
    ).limit(limit).all()
    
    # Format the app name to be cleaner (strip .exe, etc)
    formatted = []
    for r in results:
        app = r[0]
        if app.lower().endswith('.exe'):
            app = app[:-4]
        # Capitalize appropriately if mostly lowercase
        if app.islower():
            app = app.capitalize()
        formatted.append({"name": app, "count": r[1]})
        
    return formatted

@router.get("/distraction-heatmap")
def get_distraction_heatmap(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=7)
    
    logs = db.query(models.ActivityLog.timestamp).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.ActivityLog.is_focused == 0,
        models.ActivityLog.timestamp >= cutoff
    ).all()
    
    heatmap = [[0 for _ in range(24)] for _ in range(7)]
    for log in logs:
        dt = log.timestamp
        if dt:
            heatmap[dt.weekday()][dt.hour] += 1
            
    return {"heatmap": heatmap}
