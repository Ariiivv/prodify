from sqlalchemy.orm import Session
from app.models import schemas as models
from datetime import date
from typing import Optional, List


def create_workspace(
    db: Session,
    user_id: str,
    name: str,
    mode: str,
    category: Optional[str] = "mastery",
    target_hours: Optional[float] = None,
    deadline: Optional[date] = None,
    daily_target_minutes: Optional[int] = 60,
    work_duration: Optional[int] = 45,
    break_duration: Optional[int] = 5,
    focus_keywords: Optional[str] = None,
    camera_enabled: bool = False,
) -> models.Workspace:
    """Create a new workspace for a given user."""
    workspace = models.Workspace(
        user_id=user_id,
        name=name,
        mode=mode,
        category=category,
        target_hours=target_hours,
        deadline=deadline,
        daily_target_minutes=daily_target_minutes,
        work_duration=work_duration,
        break_duration=break_duration,
        focus_keywords=focus_keywords,
        camera_enabled=camera_enabled,
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
    user_id: str,
    name: str,
    mode: str,
    category: Optional[str] = "mastery",
    target_hours: Optional[float] = None,
    deadline: Optional[date] = None,
    daily_target_minutes: Optional[int] = 60,
    work_duration: Optional[int] = 45,
    break_duration: Optional[int] = 5,
    focus_keywords: Optional[str] = None,
    camera_enabled: bool = False,
) -> models.Workspace:
    """Update an existing workspace's fields."""
    workspace = get_workspace(db, workspace_id=workspace_id)
    if not workspace:
        raise ValueError(f"Workspace with id {workspace_id} not found")

    workspace.user_id = user_id
    workspace.name = name
    workspace.mode = mode
    workspace.category = category
    workspace.target_hours = target_hours
    workspace.deadline = deadline
    workspace.daily_target_minutes = daily_target_minutes
    workspace.work_duration = work_duration
    workspace.break_duration = break_duration
    workspace.focus_keywords = focus_keywords
    workspace.camera_enabled = camera_enabled

    db.commit()
    db.refresh(workspace)
    return workspace


def delete_workspace(db: Session, workspace_id: int):
    """Delete a workspace by its ID."""
    db_workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if db_workspace:
        db.delete(db_workspace)
        db.commit()
    return db_workspace


def share_workspace(
    db: Session,
    workspace_id: int,
    user_id: str,
) -> models.Workspace:
    """Share a workspace with another user by reassigning ownership."""
    workspace = get_workspace(db, workspace_id=workspace_id)
    if not workspace:
        raise ValueError(f"Workspace with id {workspace_id} not found")

    workspace.user_id = user_id
    db.commit()
    db.refresh(workspace)
    return workspace


def log_activity_record_async(
    app_name: str,
    window_title: str,
    intent: str,
    is_focused: bool,
    reason: str,
    workspace_id: Optional[int] = None,
):
    """Permanently store a window classification activity log in a background session."""
    from app.models.connection import SessionLocal
    from app.models import schemas as models
    import logging
    logger = logging.getLogger("prodify_backend")
    db = SessionLocal()
    try:
        record = models.ActivityLog(
            # Activity is meaningful only in the workspace that initiated the
            # focus session. Do not silently attach unscoped activity to an
            # unrelated workspace (the old fallback was workspace id 1).
            workspace_id=workspace_id,
            app_name=app_name,
            window_title=window_title,
            intent=intent,
            is_focused=1 if is_focused else 0,
            reason=reason,
        )
        db.add(record)
        db.commit()
    except Exception as e:
        logger.error(f"Error asynchronously saving activity log: {e}")
    finally:
        db.close()


def get_recent_activity_logs(
    db: Session, user_id: Optional[str] = None, days: int = 7, limit: int = 300
) -> List[models.ActivityLog]:
    """Fetch recent activity logs for AI coach pattern analysis."""
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(days=days)
    query = db.query(models.ActivityLog).filter(models.ActivityLog.timestamp >= cutoff)
    if user_id is not None:
        query = query.join(models.Workspace).filter(models.Workspace.user_id == user_id)
    return query.order_by(models.ActivityLog.timestamp.desc()).limit(limit).all()


# --- User & Auth CRUD Operations ---
def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    """Fetch a user by email address."""
    return db.query(models.User).filter(models.User.email == email).first()


def get_user_by_google_id(db: Session, google_id: str) -> Optional[models.User]:
    """Fetch a user by unique Google ID."""
    if not google_id:
        return None
    return db.query(models.User).filter(models.User.google_id == google_id).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[models.User]:
    """Fetch a user by primary key ID."""
    return db.query(models.User).filter(models.User.id == user_id).first()


def create_user(
    db: Session,
    email: str,
    username: str,
    hashed_password: Optional[str] = None,
    auth_provider: str = "email",
    google_id: Optional[str] = None,
    avatar_url: Optional[str] = None,
    id: Optional[str] = None,
    full_name: Optional[str] = None,
    age: Optional[int] = None,
) -> models.User:
    """Create a new user profile."""
    user = models.User(
        id=id,
        email=email,
        username=username,
        hashed_password=hashed_password,
        auth_provider=auth_provider,
        google_id=google_id,
        avatar_url=avatar_url,
        full_name=full_name,
        age=age,
    )
    if id is None:
        import uuid
        user.id = str(uuid.uuid4())
        
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_or_create_daily_log(db: Session, workspace_id: int, log_date: date, session_minutes: int, intent_score: float) -> models.DailyWorkspaceLog:
    from datetime import timedelta
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace with id {workspace_id} not found")

    target_req = workspace.daily_target_minutes if workspace.category == "mastery" else 60

    log = db.query(models.DailyWorkspaceLog).filter(
        models.DailyWorkspaceLog.workspace_id == workspace_id,
        models.DailyWorkspaceLog.date == log_date
    ).first()

    if not log:
        log = models.DailyWorkspaceLog(
            workspace_id=workspace_id,
            date=log_date,
            category=workspace.category,
            target_minutes_required=target_req,
            minutes_logged=0,
            intent_score=0.0,
            target_met=False
        )
        db.add(log)
        db.commit()
        db.refresh(log)

    log.minutes_logged += session_minutes
    if log.intent_score == 0.0:
        log.intent_score = intent_score
    else:
        log.intent_score = (log.intent_score + intent_score) / 2.0

    if not log.target_met and log.minutes_logged >= log.target_minutes_required:
        log.target_met = True
        
        yesterday = log_date - timedelta(days=1)
        prev_log = db.query(models.DailyWorkspaceLog).filter(
            models.DailyWorkspaceLog.workspace_id == workspace_id,
            models.DailyWorkspaceLog.date == yesterday
        ).first()

        if prev_log and prev_log.target_met:
            workspace.current_streak += 1
        else:
            workspace.current_streak = 1
            
        if workspace.current_streak > workspace.longest_streak:
            workspace.longest_streak = workspace.current_streak

    db.commit()
    db.refresh(log)
    return log

def evaluate_global_streak(db: Session, user_id: str, log_date: date):
    from datetime import timedelta
    workspaces = db.query(models.Workspace).filter(models.Workspace.user_id == user_id).all()
    if not workspaces:
        return

    all_met = True
    for ws in workspaces:
        # Check if they have a log and if target_met is True
        log = db.query(models.DailyWorkspaceLog).filter(
            models.DailyWorkspaceLog.workspace_id == ws.id,
            models.DailyWorkspaceLog.date == log_date
        ).first()
        if not log or not log.target_met:
            all_met = False
            break

    if all_met:
        stats = db.query(models.UserStats).filter(models.UserStats.user_id == user_id).first()
        if not stats:
            stats = models.UserStats(user_id=user_id, current_global_streak=0, longest_global_streak=0)
            db.add(stats)
            db.commit()
            db.refresh(stats)

        yesterday = log_date - timedelta(days=1)
        if stats.last_global_perfect_date == yesterday:
            stats.current_global_streak += 1
        elif stats.last_global_perfect_date != log_date:
            stats.current_global_streak = 1

        if stats.current_global_streak > stats.longest_global_streak:
            stats.longest_global_streak = stats.current_global_streak

        stats.last_global_perfect_date = log_date
        db.commit()
