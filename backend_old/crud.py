from sqlalchemy.orm import Session
from database import models
from datetime import date
from typing import Optional, List


def create_workspace(
    db: Session,
    user_id: int,
    name: str,
    mode: str,
    target_hours: Optional[float] = None,
    deadline: Optional[date] = None,
    work_duration: Optional[int] = 45,
    break_duration: Optional[int] = 5,
) -> models.Workspace:
    """Create a new workspace for a given user."""
    workspace = models.Workspace(
        user_id=user_id,
        name=name,
        mode=mode,
        target_hours=target_hours,
        deadline=deadline,
        work_duration=work_duration,
        break_duration=break_duration,
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


def get_workspaces(db: Session, skip: int = 0, limit: int = 100) -> List[models.Workspace]:
    """Fetch all workspaces with pagination."""
    return (
        db.query(models.Workspace)
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_workspace(db: Session, workspace_id: int) -> Optional[models.Workspace]:
    """Fetch a single workspace by its ID."""
    return (
        db.query(models.Workspace)
        .filter(models.Workspace.id == workspace_id)
        .first()
    )


def update_workspace(
    db: Session,
    workspace_id: int,
    user_id: int,
    name: str,
    mode: str,
    target_hours: Optional[float] = None,
    deadline: Optional[date] = None,
    work_duration: Optional[int] = 45,
    break_duration: Optional[int] = 5,
) -> models.Workspace:
    """Update an existing workspace's fields."""
    workspace = get_workspace(db, workspace_id=workspace_id)
    if not workspace:
        raise ValueError(f"Workspace with id {workspace_id} not found")

    workspace.user_id = user_id
    workspace.name = name
    workspace.mode = mode
    workspace.target_hours = target_hours
    workspace.deadline = deadline
    workspace.work_duration = work_duration
    workspace.break_duration = break_duration

    db.commit()
    db.refresh(workspace)
    return workspace


def share_workspace(
    db: Session,
    workspace_id: int,
    user_id: int,
) -> models.Workspace:
    """Share a workspace with another user by reassigning ownership."""
    workspace = get_workspace(db, workspace_id=workspace_id)
    if not workspace:
        raise ValueError(f"Workspace with id {workspace_id} not found")

    workspace.user_id = user_id
    db.commit()
    db.refresh(workspace)
    return workspace