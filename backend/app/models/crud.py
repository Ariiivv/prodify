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
    long_break_duration: Optional[int] = 15,
    long_break_interval: Optional[int] = 4,
    focus_keywords: Optional[str] = None,
    theme_color: Optional[str] = '#3b82f6',
    current_goal: Optional[str] = None,
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
        long_break_duration=long_break_duration,
        long_break_interval=long_break_interval,
        focus_keywords=focus_keywords,
        theme_color=theme_color,
        current_goal=current_goal,
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
    long_break_duration: Optional[int] = 15,
    long_break_interval: Optional[int] = 4,
    focus_keywords: Optional[str] = None,
    theme_color: Optional[str] = '#3b82f6',
    current_goal: Optional[str] = None,
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
    workspace.long_break_duration = long_break_duration
    workspace.long_break_interval = long_break_interval
    workspace.focus_keywords = focus_keywords
    if theme_color is not None:
        workspace.theme_color = theme_color
    workspace.current_goal = current_goal
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
    clean_app_name: Optional[str] = None,
    platform_name: Optional[str] = None,
    content_title: Optional[str] = None,
    ai_summary: Optional[str] = None,
    ai_reason: Optional[str] = None,
):
    """Permanently store a window classification activity log in a background session."""
    from app.models.connection import SessionLocal
    from app.models import schemas as models
    from app.services.activity_parser import parse_activity
    import logging
    logger = logging.getLogger("prodify_backend")
    
    # Auto-parse if not supplied
    if not clean_app_name or not platform_name or not content_title:
        parsed_clean, parsed_platform, parsed_content = parse_activity(window_title, app_name)
        clean_app_name = clean_app_name or parsed_clean
        platform_name = platform_name or parsed_platform
        content_title = content_title or parsed_content

    db = SessionLocal()
    try:
        record = models.ActivityLog(
            workspace_id=workspace_id,
            app_name=app_name,
            window_title=window_title,
            intent=intent,
            is_focused=1 if is_focused else 0,
            reason=reason,
            clean_app_name=clean_app_name,
            platform_name=platform_name,
            content_title=content_title,
            ai_summary=ai_summary,
            ai_reason=ai_reason or reason,
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


def build_user_performance_matrix(db: Session, user_id: str) -> dict:
    """
    Unified User Performance Matrix Assembler.
    Powers both the Gamified Dashboard UI and the AI Coach context.
    """
    from datetime import datetime, date, timedelta
    from sqlalchemy import func, desc, cast, Date

    today = date.today()

    workspaces = (
        db.query(models.Workspace)
        .filter(models.Workspace.user_id == user_id)
        .order_by(models.Workspace.created_at.asc())
        .all()
    )

    # User stats for streak
    user_stats = db.query(models.UserStats).filter(models.UserStats.user_id == user_id).first()
    current_global_streak = user_stats.current_global_streak if user_stats else 0
    longest_global_streak = user_stats.longest_global_streak if user_stats else 0

    if not workspaces:
        return {
            "global_summary": {
                "workspaces_cleared_today": 0,
                "total_active_workspaces": 0,
                "today_logged_minutes": 0,
                "today_target_minutes": 0,
                "today_logged_hours": 0.0,
                "today_target_hours": 0.0,
                "ten_day_form_pct": 100.0,
                "form_tier": "Calibrating",
                "focus_purity_pct": 0.0,
                "today_distractions_count": 0,
                "daily_verdict": "Not Started Today",
                "current_global_streak": current_global_streak,
                "longest_global_streak": longest_global_streak,
            },
            "workspaces_matrix": []
        }

    ws_ids = [w.id for w in workspaces]

    # Pre-fetch past 14 days daily logs
    past_14d = today - timedelta(days=14)
    daily_logs = db.query(models.DailyWorkspaceLog).filter(
        models.DailyWorkspaceLog.workspace_id.in_(ws_ids),
        models.DailyWorkspaceLog.date >= past_14d
    ).all()

    daily_log_map = {}
    for dl in daily_logs:
        daily_log_map[(dl.workspace_id, dl.date)] = dl.minutes_logged

    # Pre-fetch past 14 days session aggregation
    sessions = db.query(
        models.Session.workspace_id,
        cast(models.Session.start_time, Date).label("d"),
        func.sum(models.Session.duration).label("total_secs"),
    ).filter(
        models.Session.workspace_id.in_(ws_ids),
        models.Session.session_type == "FOCUS",
        models.Session.status == "COMPLETED",
        cast(models.Session.start_time, Date) >= past_14d
    ).group_by(
        models.Session.workspace_id,
        cast(models.Session.start_time, Date)
    ).all()

    session_day_map = {}
    for s in sessions:
        session_day_map[(s.workspace_id, s.d)] = round((s.total_secs or 0) / 60.0)

    def get_minutes_logged(workspace_id: int, target_date: date) -> int:
        dl_mins = daily_log_map.get((workspace_id, target_date), 0)
        sess_mins = session_day_map.get((workspace_id, target_date), 0)
        return max(dl_mins, sess_mins)

    # Pre-fetch all-time logged minutes per workspace
    all_time_totals = db.query(
        models.DailyWorkspaceLog.workspace_id,
        func.coalesce(func.sum(models.DailyWorkspaceLog.minutes_logged), 0)
    ).filter(
        models.DailyWorkspaceLog.workspace_id.in_(ws_ids)
    ).group_by(models.DailyWorkspaceLog.workspace_id).all()
    all_time_workspace_minutes = {wid: total_m for wid, total_m in all_time_totals}

    # Past 7 days list (oldest to today)
    past_7_days = [today - timedelta(days=6 - i) for i in range(7)]

    # Distraction telemetry grouped by workspace_id and humanized activity
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

    act_rows = db.query(
        models.ActivityLog.workspace_id,
        models.ActivityLog.app_name,
        models.ActivityLog.window_title,
        func.count(models.ActivityLog.id).label("cnt")
    ).filter(
        models.ActivityLog.workspace_id.in_(ws_ids),
        models.ActivityLog.is_focused == 0
    ).group_by(
        models.ActivityLog.workspace_id,
        models.ActivityLog.app_name,
        models.ActivityLog.window_title
    ).order_by(desc("cnt")).all()

    distractions_by_ws = {}
    for wid, app, title, cnt in act_rows:
        app_clean = (app or "").lower().strip()
        if app_clean in OS_SYSTEM_UTILITIES:
            continue
        if wid not in distractions_by_ws:
            distractions_by_ws[wid] = []
        if len(distractions_by_ws[wid]) < 5:
            clean_app, platform, content = parse_activity(title or "", app or "")
            label = f"{platform} — '{content}'" if content and content != platform else platform
            distractions_by_ws[wid].append({
                "app": label,
                "platform": platform,
                "content": content,
                "clean_app": clean_app,
                "count": cnt
            })

    workspaces_matrix = []
    for ws in workspaces:
        cat_raw = (ws.category or "mastery").lower()
        is_sprint = cat_raw == "sprint"
        is_mastery = cat_raw == "mastery"
        is_active_req = is_sprint or is_mastery
        total_logged_mins = all_time_workspace_minutes.get(ws.id, 0)

        # Compute daily target minutes
        if is_sprint:
            if ws.target_hours and ws.deadline:
                days_left = max(1, (ws.deadline - today).days + 1)
                total_target_mins = round(ws.target_hours * 60)
                logged_so_far = total_logged_mins
                rem_mins = max(0, total_target_mins - logged_so_far)
                daily_target = max(15, round(rem_mins / days_left))
            else:
                daily_target = ws.daily_target_minutes or 60
        elif is_mastery:
            daily_target = ws.daily_target_minutes or 60
        else:
            # casual / quick_flow
            daily_target = ws.daily_target_minutes or 0

        today_mins = get_minutes_logged(ws.id, today)
        today_cleared = (today_mins >= daily_target) if daily_target > 0 else (today_mins > 0)

        # Card status label & tone
        # Card status label & tone
        ws_created_date = ws.created_at.date() if ws.created_at else today
        if today_cleared:
            card_status_label = "Cleared Today ✓"
            card_status_tone = "success"
        elif today_mins > 0:
            rem = max(0, daily_target - today_mins)
            card_status_label = f"{rem}m left today"
            card_status_tone = "progress"
        elif ws_created_date == today or total_logged_mins == 0:
            card_status_label = "Ready to Start"
            card_status_tone = "neutral"
        else:
            card_status_label = f"0m / {daily_target}m Today"
            card_status_tone = "danger"

        # 7-day chain
        chain = []
        for d in past_7_days:
            d_mins = get_minutes_logged(ws.id, d)
            if d < ws_created_date:
                status = "untracked"
            elif daily_target > 0 and d_mins >= daily_target:
                status = "cleared"
            elif daily_target <= 0 and d_mins > 0:
                status = "cleared"
            elif d_mins > 0:
                status = "partial"
            else:
                status = "missed"

            chain.append({
                "date": d.isoformat(),
                "day_name": d.strftime("%a"),
                "status": status,
                "minutes_logged": d_mins,
                "target_minutes": daily_target,
            })

        workspaces_matrix.append({
            "id": ws.id,
            "name": ws.name,
            "category": cat_raw,
            "created_at": ws.created_at.isoformat() if ws.created_at else datetime.utcnow().isoformat(),
            "allowed_intent_whitelist": ws.current_goal or ws.focus_keywords or "",
            "today_logged_minutes": today_mins,
            "daily_target_minutes": daily_target,
            "today_cleared": today_cleared,
            "is_active_requirement": is_active_req,
            "current_streak": ws.current_streak or 0,
            "longest_streak": ws.longest_streak or 0,
            "card_status_label": card_status_label,
            "card_status_tone": card_status_tone,
            "seven_day_chain": chain,
            "top_distracting_os_apps": distractions_by_ws.get(ws.id, []),
        })

    # Global summary calculations
    active_matrix = [wm for wm in workspaces_matrix if wm["is_active_requirement"]]
    total_active_workspaces = len(active_matrix)
    workspaces_cleared_today = sum(1 for wm in active_matrix if wm["today_cleared"])

    today_logged_minutes = sum(wm["today_logged_minutes"] for wm in workspaces_matrix)
    today_target_minutes = sum(wm["daily_target_minutes"] for wm in active_matrix)

    # 10-day form
    earliest_ws_date = min((w.created_at.date() for w in workspaces if w.created_at), default=today)
    last_10_days = [today - timedelta(days=9 - i) for i in range(10)]
    eligible_days = [d for d in last_10_days if d >= earliest_ws_date]

    daily_form_scores = []
    for d in eligible_days:
        # Workspaces that existed on day d and require progress
        d_workspaces = [wm for wm in active_matrix if date.fromisoformat(wm["created_at"][:10]) <= d]
        if not d_workspaces:
            continue
        d_logged = sum(get_minutes_logged(wm["id"], d) for wm in d_workspaces)
        d_target = sum(wm["daily_target_minutes"] for wm in d_workspaces)
        if d_target > 0:
            daily_form_scores.append(min(1.0, d_logged / d_target) * 100.0)
        elif d_logged > 0:
            daily_form_scores.append(100.0)

    # Check total sessions to detect brand-new users on day 1
    total_sessions_count = db.query(models.Session).filter(
        models.Session.workspace_id.in_(ws_ids)
    ).count()

    if total_sessions_count == 0 or not daily_form_scores:
        ten_day_form_pct = 100.0
        form_tier = "Calibrating"
    else:
        ten_day_form_pct = round(sum(daily_form_scores) / len(daily_form_scores), 1)
        if ten_day_form_pct >= 80.0:
            form_tier = "Locked In"
        elif ten_day_form_pct >= 40.0:
            form_tier = "Warming Up"
        else:
            form_tier = "Slumping"

    # Focus purity across past 7 days
    cutoff_7d = datetime.utcnow() - timedelta(days=7)
    tick_counts = db.query(
        models.ActivityLog.is_focused,
        func.count(models.ActivityLog.id)
    ).filter(
        models.ActivityLog.workspace_id.in_(ws_ids),
        models.ActivityLog.timestamp >= cutoff_7d
    ).group_by(models.ActivityLog.is_focused).all()

    focused_ticks = 0
    distracted_ticks = 0
    for is_f, cnt in tick_counts:
        if is_f == 1:
            focused_ticks += cnt
        else:
            distracted_ticks += cnt

    total_ticks = focused_ticks + distracted_ticks
    if total_ticks == 0:
        focus_purity_pct = 0.0
    elif distracted_ticks == 0:
        focus_purity_pct = 100.0
    else:
        focus_purity_pct = round((focused_ticks / total_ticks) * 100.0, 1)

    # Today's distractions count
    today_sess_distractions = db.query(func.coalesce(func.sum(models.Session.distraction_count), 0)).filter(
        models.Session.workspace_id.in_(ws_ids),
        cast(models.Session.start_time, Date) == today
    ).scalar() or 0

    today_act_distractions = db.query(models.ActivityLog).filter(
        models.ActivityLog.workspace_id.in_(ws_ids),
        models.ActivityLog.is_focused == 0,
        cast(models.ActivityLog.timestamp, Date) == today
    ).count()

    today_distractions_count = max(int(today_sess_distractions), int(today_act_distractions))

    # Daily verdict
    if total_active_workspaces > 0 and workspaces_cleared_today == total_active_workspaces:
        daily_verdict = "Perfect Day Locked"
    elif today_logged_minutes > 0:
        remaining_targets = max(0, total_active_workspaces - workspaces_cleared_today)
        daily_verdict = f"{remaining_targets} Target{'s' if remaining_targets != 1 else ''} Remaining"
    else:
        daily_verdict = "Not Started Today"

    global_summary = {
        "workspaces_cleared_today": workspaces_cleared_today,
        "total_active_workspaces": total_active_workspaces,
        "today_logged_minutes": today_logged_minutes,
        "today_target_minutes": today_target_minutes,
        "today_logged_hours": round(today_logged_minutes / 60.0, 1),
        "today_target_hours": round(today_target_minutes / 60.0, 1),
        "ten_day_form_pct": ten_day_form_pct,
        "form_tier": form_tier,
        "focus_purity_pct": focus_purity_pct,
        "today_distractions_count": today_distractions_count,
        "daily_verdict": daily_verdict,
        "current_global_streak": current_global_streak,
        "longest_global_streak": longest_global_streak,
    }

    return {
        "global_summary": global_summary,
        "workspaces_matrix": workspaces_matrix,
    }
