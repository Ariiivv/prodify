"""
New Metrics API Endpoints (Part D)
===================================
Additive — does NOT remove any existing endpoints.

- GET /api/metrics/home     → Home dashboard metrics
- GET /api/metrics/workspace/{id}  → Workspace-scoped metrics
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.models.connection import get_db
from app.models import schemas as models
from app.api.auth import get_current_user
from app.services.metrics_engine import compute_home_metrics, compute_workspace_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/home")
def get_home_metrics(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns the full Home dashboard metrics payload:
    {
        momentum: {score, label, consistency, volume, quality},
        total_workspaces: int,
        deep_work_ratio_aggregate: float | null,
        peak_focus_window: {insufficient_data, ...} | {peak_range, alignment_rate, ...},
        current_streak: int,
        longest_streak: int,
        calendar: [{date, status}]
    }
    """
    return compute_home_metrics(db, current_user)


@router.get("/workspace/{workspace_id}")
def get_workspace_metrics(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns workspace-scoped metrics:
    {
        pace: {score, label, consistency, volume, quality},
        deep_work_ratio: float | null,
        calendar: [{date, status, actual_minutes, target_minutes}],
        workspace_streak_current: int,
        workspace_streak_longest: int,
        today_target_minutes: int,
        today_actual_minutes: float
    }
    """
    result = compute_workspace_metrics(db, current_user, workspace_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
    return result
