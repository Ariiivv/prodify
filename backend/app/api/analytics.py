from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.connection import get_db
from app.api.auth import get_current_user
from app.models import schemas as models

router = APIRouter()

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
    
    formatted = []
    for r in results:
        app = r[0]
        if app.lower().endswith('.exe'):
            app = app[:-4]
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
