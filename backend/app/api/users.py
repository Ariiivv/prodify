import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.connection import get_db
from app.models import schemas as models
from app.api.auth import get_current_user

logger = logging.getLogger("prodify_backend")

router = APIRouter(prefix="/users", tags=["users"])

class ResetDataResponse(BaseModel):
    message: str
    details: dict

@router.delete("/me/reset-data", response_model=ResetDataResponse)
def reset_user_data(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Deletes ALL workspaces and associated tracking and history data 
    (metrics, sessions, telemetry, coaching, chat) for the authenticated user.
    """
    # 1. Find all workspaces owned by the current user
    workspaces = db.query(models.Workspace.id).filter(models.Workspace.user_id == current_user.id).all()
    workspace_ids = [ws.id for ws in workspaces]

    if not workspace_ids:
        return ResetDataResponse(message="No workspaces found. Nothing to reset.", details={})

    # 2. Delete relevant rows from associated tables
    metrics_deleted = db.query(models.WorkspaceMetrics).filter(models.WorkspaceMetrics.workspace_id.in_(workspace_ids)).delete(synchronize_session=False)
    coaching_deleted = db.query(models.CoachingInteraction).filter(models.CoachingInteraction.workspace_id.in_(workspace_ids)).delete(synchronize_session=False)
    chat_deleted = db.query(models.WorkspaceChatHistory).filter(models.WorkspaceChatHistory.workspace_id.in_(workspace_ids)).delete(synchronize_session=False)
    
    # Extra safety/thoroughness - delete sessions, telemetry logs, and activity logs
    telemetry_deleted = db.query(models.TelemetryLog).filter(models.TelemetryLog.workspace_id.in_(workspace_ids)).delete(synchronize_session=False)
    activity_deleted = db.query(models.ActivityLog).filter(models.ActivityLog.workspace_id.in_(workspace_ids)).delete(synchronize_session=False)
    sessions_deleted = db.query(models.Session).filter(models.Session.workspace_id.in_(workspace_ids)).delete(synchronize_session=False)

    # 3. Delete the workspaces themselves
    workspaces_deleted = db.query(models.Workspace).filter(models.Workspace.user_id == current_user.id).delete(synchronize_session=False)

    db.commit()

    details = {
        "workspaces_deleted": workspaces_deleted,
        "metrics_deleted": metrics_deleted,
        "coaching_interactions_deleted": coaching_deleted,
        "chat_messages_deleted": chat_deleted,
        "telemetry_logs_deleted": telemetry_deleted,
        "activity_logs_deleted": activity_deleted,
        "sessions_deleted": sessions_deleted
    }
    
    total = sum(details.values())
    logger.info(f"User {current_user.id} reset data. Total records deleted: {total}")

    return ResetDataResponse(
        message=f"Successfully reset tracking data. Deleted {total} records.",
        details=details
    )
