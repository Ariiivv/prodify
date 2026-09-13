from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.models import crud
from app.models import schemas as models
from app.models.connection import get_db


router = APIRouter(tags=["workspaces"])


class WorkspacePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    mode: str = Field(default="structured", min_length=1, max_length=80)
    target_hours: Optional[float] = Field(default=None, ge=0)
    deadline: Optional[date] = None
    work_duration: int = Field(default=45, ge=1, le=180)
    break_duration: int = Field(default=5, ge=1, le=60)
    focus_keywords: Optional[str] = Field(default=None, max_length=2000)


class WorkspaceOut(WorkspacePayload):
    id: int
    user_id: int
    model_config = ConfigDict(from_attributes=True)

class ChatMessagePayload(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)

class ChatMessageOut(ChatMessagePayload):
    id: int
    workspace_id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class WorkspaceMetricsOut(BaseModel):
    id: int
    workspace_id: int
    workspace_name: str
    workspace_intent: Optional[str]
    session_date: date
    focus_minutes: int
    distraction_count: int
    burnout_score: float
    time_of_day: str
    mode: str
    completed: bool
    model_config = ConfigDict(from_attributes=True)

def get_owned_workspace(
    workspace_id: int, current_user: models.User, db: Session
) -> models.Workspace:
    workspace = (
        db.query(models.Workspace)
        .filter(
            models.Workspace.id == workspace_id,
            models.Workspace.user_id == current_user.id,
        )
        .first()
    )
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
    return workspace


@router.get("", response_model=list[WorkspaceOut])
def list_workspaces(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    return (
        db.query(models.Workspace)
        .filter(models.Workspace.user_id == current_user.id)
        .order_by(models.Workspace.created_at.desc())
        .all()
    )


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspacePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_workspace(db=db, user_id=current_user.id, **payload.model_dump())


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def read_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return get_owned_workspace(workspace_id, current_user, db)


@router.put("/{workspace_id}", response_model=WorkspaceOut)
def update_workspace(
    workspace_id: int,
    payload: WorkspacePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_owned_workspace(workspace_id, current_user, db)
    return crud.update_workspace(
        db=db, workspace_id=workspace_id, user_id=current_user.id, **payload.model_dump()
    )


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: int,
    keep_metrics: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    workspace = get_owned_workspace(workspace_id, current_user, db)
    db.delete(workspace)
    if not keep_metrics:
        db.query(models.WorkspaceMetrics).filter(models.WorkspaceMetrics.workspace_id == workspace_id).delete(synchronize_session=False)
    db.commit()

@router.get("/{workspace_id}/chat-history", response_model=list[ChatMessageOut])
def get_chat_history(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_owned_workspace(workspace_id, current_user, db)
    return (
        db.query(models.WorkspaceChatHistory)
        .filter(models.WorkspaceChatHistory.workspace_id == workspace_id)
        .order_by(models.WorkspaceChatHistory.timestamp.asc())
        .all()
    )

@router.post("/{workspace_id}/chat-history", response_model=ChatMessageOut, status_code=status.HTTP_201_CREATED)
def add_chat_message(
    workspace_id: int,
    payload: ChatMessagePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_owned_workspace(workspace_id, current_user, db)
    message = models.WorkspaceChatHistory(workspace_id=workspace_id, **payload.model_dump())
    db.add(message)
    db.commit()
    db.refresh(message)
    return message

@router.get("/{workspace_id}/metrics", response_model=list[WorkspaceMetricsOut])
def get_workspace_metrics(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_owned_workspace(workspace_id, current_user, db)
    return (
        db.query(models.WorkspaceMetrics)
        .filter(models.WorkspaceMetrics.workspace_id == workspace_id)
        .order_by(models.WorkspaceMetrics.session_date.desc())
        .all()
    )

class WorkspaceMetricsPayload(BaseModel):
    focus_minutes: int
    distraction_count: int
    burnout_score: float
    time_of_day: str
    completed: bool

@router.post("/{workspace_id}/metrics", response_model=WorkspaceMetricsOut, status_code=status.HTTP_201_CREATED)
def add_workspace_metrics(
    workspace_id: int,
    payload: WorkspaceMetricsPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    workspace = get_owned_workspace(workspace_id, current_user, db)
    
    metrics = models.WorkspaceMetrics(
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        workspace_intent=workspace.focus_keywords,
        session_date=datetime.utcnow().date(),
        focus_minutes=payload.focus_minutes,
        distraction_count=payload.distraction_count,
        burnout_score=payload.burnout_score,
        time_of_day=payload.time_of_day,
        mode=workspace.mode,
        completed=payload.completed,
    )
    
    db.add(metrics)
    db.commit()
    db.refresh(metrics)
    return metrics
