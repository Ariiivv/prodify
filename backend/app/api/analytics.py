from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.models.connection import get_db
from app.api.auth import get_current_user
from app.models import schemas as models
from app.models.crud import build_user_performance_matrix
from app.services.metrics_engine import compute_report_analytics

router = APIRouter()

@router.get("/analytics/performance-matrix")
@router.get("/performance-matrix")
def get_user_performance_matrix(
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    return build_user_performance_matrix(db, current_user.id)


@router.get("/analytics/report")
@router.get("/report")
def get_analytics_report(
    workspace_id: Optional[int] = Query(None, description="Optional workspace ID to scope report"),
    days: int = Query(30, ge=7, le=90, description="Window size in days"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        return compute_report_analytics(db, current_user, workspace_id=workspace_id, days=days)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/distracting-apps")
def get_distracting_apps(
    limit: int = 6,
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    from app.services.activity_parser import parse_activity

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
    
    logs = db.query(
        models.ActivityLog
    ).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.ActivityLog.is_focused == 0
    ).all()
    
    app_counts = {}
    for log in logs:
        raw_app = (log.app_name or "").lower().strip()
        if raw_app in OS_SYSTEM_UTILITIES:
            continue
        display_name = getattr(log, "platform_name", None) or getattr(log, "clean_app_name", None)
        if not display_name:
            clean, plat, _ = parse_activity(log.window_title or "", log.app_name or "")
            display_name = plat or clean or log.app_name or "Unknown"
        if display_name and display_name.strip():
            app_counts[display_name] = app_counts.get(display_name, 0) + 1
        
    top_apps = sorted(app_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    formatted = [{"name": name, "count": count} for name, count in top_apps]
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
