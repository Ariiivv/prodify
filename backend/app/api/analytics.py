from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.models.connection import get_db
from app.models import schemas as models

router = APIRouter(tags=["analytics"])

class GlobalMetricsOut(BaseModel):
    total_focus_hours: float
    best_workspace_name: Optional[str]
    best_time_of_day: Optional[str]
    average_burnout_score: float
    total_distractions: int
    most_productive_day: Optional[str]

@router.get("/global-metrics", response_model=GlobalMetricsOut)
def get_global_metrics(db: Session = Depends(get_db)):
    metrics = db.query(models.WorkspaceMetrics).all()
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
