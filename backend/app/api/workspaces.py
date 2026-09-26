from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.auth import get_current_user
from app.models import crud
from app.models import schemas as models
from app.models.connection import get_db


router = APIRouter(tags=["workspaces"])


class WorkspacePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    mode: str = Field(default="structured", min_length=1, max_length=80)
    category: Optional[str] = Field(default="mastery", pattern="^(sprint|mastery)$")
    target_hours: Optional[float] = Field(default=None, ge=0)
    deadline: Optional[date] = None
    daily_target_minutes: Optional[int] = Field(default=60, ge=0, le=720)
    work_duration: int = Field(default=25, ge=1, le=180)
    break_duration: int = Field(default=5, ge=1, le=60)
    focus_keywords: Optional[str] = Field(default=None, max_length=2000)
    camera_enabled: bool = False

    @field_validator('category', mode='after')
    @classmethod
    def validate_category(cls, v):
        return v or 'mastery'

    @model_validator(mode='after')
    def validate_sprint_requirements(self) -> 'WorkspacePayload':
        if self.category == 'sprint':
            if not self.deadline or self.target_hours is None:
                raise ValueError("deadline and target_hours are required for sprint category.")
        return self


class WorkspaceOut(WorkspacePayload):
    id: int
    user_id: str

    @field_validator('user_id', mode='before')
    def cast_to_string(cls, v):
        return str(v)

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
    from app.services.intent_classifier import clear_semantic_cache
    clear_semantic_cache()
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
class DailyGoalOut(BaseModel):
    date: date
    target_minutes_for_day: int
    actual_minutes_logged: int
    status: str
    model_config = ConfigDict(from_attributes=True)

@router.get("/{workspace_id}/daily-goals", response_model=list[DailyGoalOut])
def get_daily_goals(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    workspace = get_owned_workspace(workspace_id, current_user, db)
    
    if not workspace.mode or "structured" not in workspace.mode.lower():
        return []
        
    if not workspace.deadline or not workspace.target_hours:
        return []
        
    metrics = (
        db.query(models.WorkspaceMetrics.session_date, func.sum(models.WorkspaceMetrics.focus_minutes).label("total_minutes"))
        .filter(models.WorkspaceMetrics.workspace_id == workspace_id)
        .group_by(models.WorkspaceMetrics.session_date)
        .all()
    )
    
    metrics_by_date = {m.session_date: m.total_minutes for m in metrics}
    
    today = datetime.utcnow().date()
    created_date = workspace.created_at.date()
    deadline = workspace.deadline
    target_hours = workspace.target_hours
    
    if deadline < created_date:
        return []
        
    results = []
    current_date = created_date
    total_logged_before_current = 0
    
    total_logged_up_to_today = 0
    for d_i in range((min(today, deadline) - created_date).days + 1):
        d_val = created_date + timedelta(days=d_i)
        total_logged_up_to_today += metrics_by_date.get(d_val, 0)
        
    future_rem_days = (deadline - today).days
    if future_rem_days > 0:
        future_target = (target_hours * 60 - total_logged_up_to_today) / future_rem_days
    else:
        future_target = (target_hours * 60 - total_logged_up_to_today)
        
    while current_date <= deadline:
        actual = metrics_by_date.get(current_date, 0)
        
        if current_date <= today:
            days_rem = (deadline - current_date).days + 1
            if days_rem > 0:
                target_min = (target_hours * 60 - total_logged_before_current) / days_rem
            else:
                target_min = (target_hours * 60 - total_logged_before_current)
        else:
            target_min = future_target
            
        target_min = max(0.0, float(target_min))
        target_min_int = int(round(target_min))
        
        if current_date > today:
            status = "future"
        elif current_date == today:
            status = "today"
        else:
            if actual == 0:
                status = "none"
            elif actual < target_min_int:
                status = "under"
            elif actual >= target_min_int * 1.2:
                status = "exceeded"
            else:
                status = "met"
                
        results.append({
            "date": current_date,
            "target_minutes_for_day": target_min_int,
            "actual_minutes_logged": actual,
            "status": status
        })
        
        total_logged_before_current += actual
        current_date += timedelta(days=1)
        
    return results
