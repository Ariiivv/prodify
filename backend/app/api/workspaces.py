import os
import logging
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


logger = logging.getLogger("prodify_workspaces")

router = APIRouter(tags=["workspaces"])


class WorkspacePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    mode: str = Field(default="structured", min_length=1, max_length=80)
    category: Optional[str] = Field(default="mastery", pattern="^(sprint|mastery|casual|quick_work)$")
    target_hours: Optional[float] = Field(default=None, ge=0)
    deadline: Optional[date] = None
    daily_target_minutes: Optional[int] = Field(default=60, ge=0, le=720)
    work_duration: int = Field(default=25, ge=1, le=180)
    break_duration: int = Field(default=5, ge=1, le=60)
    long_break_duration: int = Field(default=15, ge=1, le=180)
    long_break_interval: int = Field(default=4, ge=1, le=20)
    focus_keywords: Optional[str] = Field(default=None, max_length=2000)
    current_goal: Optional[str] = Field(default=None, max_length=2000)
    theme_color: Optional[str] = Field(default='#3b82f6', max_length=20)
    camera_enabled: bool = False
    status: Optional[str] = Field(default="active", pattern="^(active|paused|completed)$")

    @field_validator('category', mode='after')
    @classmethod
    def validate_category(cls, v):
        return v or 'mastery'

    @model_validator(mode='after')
    def validate_sprint_requirements(self) -> 'WorkspacePayload':
        if self.category in ('casual', 'quick_work'):
            self.daily_target_minutes = 0
        elif self.category == 'sprint':
            if not self.deadline or self.target_hours is None:
                raise ValueError("deadline and target_hours are required for sprint category.")
            if self.daily_target_minutes is None or self.daily_target_minutes <= 0:
                days_remaining = max(1, (self.deadline - date.today()).days + 1)
                calculated = int(round((self.target_hours * 60) / days_remaining))
                self.daily_target_minutes = max(15, min(720, calculated))
        elif self.category == 'mastery' and (self.daily_target_minutes is None or self.daily_target_minutes <= 0):
            self.daily_target_minutes = 60
        return self


class WorkspaceOut(WorkspacePayload):
    id: int
    user_id: str
    status: Optional[str] = "active"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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
    workspace_id: Optional[int]
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
    from app.services.intent_classifier import clear_intent_cache
    clear_intent_cache(workspace_id)
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
    
    # Clear intent cache for this workspace
    from app.services.intent_classifier import clear_intent_cache
    clear_intent_cache(workspace_id)
    
    # Full hard cascade deletion across all child records and user streak recalculation
    crud.delete_workspace(
        db=db,
        workspace_id=workspace_id,
        keep_metrics=keep_metrics,
    )


class WorkspaceGoalPatch(BaseModel):
    current_goal: str


class WorkspaceStatusPatch(BaseModel):
    status: str = Field(..., pattern="^(active|paused|completed)$")


@router.patch("/{workspace_id}/status", response_model=WorkspaceOut)
def patch_workspace_status(
    workspace_id: int,
    payload: WorkspaceStatusPatch,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    workspace = get_owned_workspace(workspace_id, current_user, db)
    workspace.status = payload.status
    db.commit()
    db.refresh(workspace)
    return workspace


@router.patch("/{workspace_id}/goal", response_model=WorkspaceOut)
def patch_workspace_goal(
    workspace_id: int,
    payload: WorkspaceGoalPatch,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    workspace = get_owned_workspace(workspace_id, current_user, db)
    workspace.current_goal = payload.current_goal
    db.commit()
    db.refresh(workspace)
    from app.services.intent_classifier import clear_intent_cache
    clear_intent_cache(workspace_id)
    return workspace


class DistractionOut(BaseModel):
    id: int
    app_name: str
    window_title: str
    timestamp: datetime
    reason: Optional[str]


@router.get("/{workspace_id}/distractions", response_model=list[DistractionOut])
def get_workspace_distractions(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_owned_workspace(workspace_id, current_user, db)
    from app.services.star_ml import OS_SYSTEM_UTILITIES
    raw_logs = (
        db.query(models.ActivityLog)
        .filter(models.ActivityLog.workspace_id == workspace_id, models.ActivityLog.is_focused == 0)
        .order_by(models.ActivityLog.timestamp.desc())
        .limit(200)
        .all()
    )
    return [l for l in raw_logs if (l.app_name or '').lower().strip() not in OS_SYSTEM_UTILITIES][:100]


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
        completed=int(payload.completed),
    )
    
    db.add(metrics)
    db.commit()
    db.refresh(metrics)
    return metrics


@router.post("/{workspace_id}/complete-summary")
async def get_sprint_completion_summary(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    workspace = get_owned_workspace(workspace_id, current_user, db)
    
    # 1. Fetch sessions stats
    completed_sessions = (
        db.query(models.Session)
        .filter(
            models.Session.workspace_id == workspace_id,
            models.Session.session_type == "FOCUS",
            models.Session.status == "COMPLETED",
        )
        .all()
    )
    total_focus_secs = sum(s.duration or 0 for s in completed_sessions)
    total_focus_hours = round(total_focus_secs / 3600.0, 1)
    total_distracted_secs = sum(s.distracted_seconds or 0 for s in completed_sessions)
    session_count = len(completed_sessions)
    
    focus_purity = 100.0
    if total_focus_secs > 0:
        focus_purity = round(max(0.0, (total_focus_secs - min(total_distracted_secs, total_focus_secs)) / total_focus_secs * 100.0), 1)
        
    # Calculate performance tier
    target_hours = workspace.target_hours or 0.0
    completion_pct = round((total_focus_hours / target_hours * 100), 1) if target_hours > 0 else 100.0
    
    if completion_pct >= 90 and focus_purity >= 80:
        tier = "S-Tier"
        tier_title = "Apex Master"
    elif completion_pct >= 75 and focus_purity >= 65:
        tier = "A-Tier"
        tier_title = "Elite Execution"
    elif completion_pct >= 50:
        tier = "B-Tier"
        tier_title = "Solid Effort"
    else:
        tier = "C-Tier"
        tier_title = "Mission Attempted"
        
    # 2. Fetch recent chat history to recall past context
    recent_chats = (
        db.query(models.WorkspaceChatHistory)
        .filter(models.WorkspaceChatHistory.workspace_id == workspace_id)
        .order_by(models.WorkspaceChatHistory.timestamp.desc())
        .limit(15)
        .all()
    )
    recent_chats.reverse()
    chat_summary_snippets = [f"{c.role}: {c.content[:150]}" for c in recent_chats]
    chat_context = "\n".join(chat_summary_snippets) if chat_summary_snippets else "No prior chat messages recorded."
    
    # 3. Fetch top distractions from ActivityLog
    from app.services.activity_parser import parse_activity
    raw_distractions = (
        db.query(models.ActivityLog)
        .filter(models.ActivityLog.workspace_id == workspace_id, models.ActivityLog.is_focused == 0)
        .limit(100)
        .all()
    )
    distraction_apps = set()
    for l in raw_distractions:
        p = parse_activity(l.app_name or "", l.window_title or "")
        if not p.is_os_utility and p.clean_app_name:
            distraction_apps.add(p.clean_app_name)
    top_distractions_str = ", ".join(list(distraction_apps)[:4]) or "Virtually zero distractions"

    user_name = current_user.full_name or current_user.username or (current_user.email.split('@')[0] if current_user.email else "Warrior")

    # 4. Generate Groq completion debrief
    prompt = f"""You are the Prodify AI Peak Performance Coach. The user '{user_name}' has just completed their Sprint '{workspace.name}'!

Sprint Details:
- Stated Goal / Focus Intent: "{workspace.current_goal or workspace.focus_keywords or 'Sprint Completion'}"
- Total Target: {target_hours} hours
- Actual Logged: {total_focus_hours} hours ({completion_pct}% of goal)
- Completed Sessions: {session_count}
- Focus Purity: {focus_purity}%
- Performance Tier: {tier} ({tier_title})
- Major Distractions Overcome: {top_distractions_str}

Recent Conversation Memory with AI Coach in this Workspace:
{chat_context}

Instructions:
1. Provide a warm, authentic, highly personalized Sprint Debrief (3 short paragraphs maximum).
2. Explicitly recall at least one specific topic, blocker, or goal they discussed with you in their chat history (if present), congratulating them on overcoming it.
3. Announce their {tier} ({tier_title}) rating and what it says about their discipline.
4. Give a motivating closing punchline for their next milestone.
Keep the tone encouraging, respectful, like a legendary mentor. Do not use generic filler words."""

    try:
        from openai import AsyncOpenAI
        groq_client = AsyncOpenAI(
            api_key=os.getenv("GROQ_API_KEY", "missing_key"),
            base_url="https://api.groq.com/openai/v1",
        )
        resp = await groq_client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"),
            messages=[
                {"role": "system", "content": "You are the Prodify AI Performance Coach delivering an inspiring mission-complete debrief."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.6,
            max_tokens=500,
        )
        coach_message = resp.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Failed to generate debrief with Groq: {e}")
        coach_message = (
            f"Spectacular achievement, {user_name}! You completed your sprint '{workspace.name}' "
            f"with {total_focus_hours} hours logged across {session_count} deep work sessions and a "
            f"{focus_purity}% focus purity. You earned a proud {tier} rating. Take pride in your dedication!"
        )

    return {
        "workspace_id": workspace.id,
        "workspace_name": workspace.name,
        "tier": tier,
        "tier_title": tier_title,
        "total_focus_hours": total_focus_hours,
        "target_hours": target_hours,
        "completion_pct": completion_pct,
        "session_count": session_count,
        "focus_purity": focus_purity,
        "coach_message": coach_message,
        "completed_at": datetime.utcnow().isoformat(),
    }
