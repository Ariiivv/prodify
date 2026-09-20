import math
import logging
from datetime import date, datetime
from typing import Optional, Union
from sqlalchemy.orm import Session
from app.models import schemas as models
from app.services.star_ml import load_user_profile

logger = logging.getLogger("prodify_goal_optimizer")


def _format_deadline_display(deadline_date: date) -> str:
    """Format deadline date to e.g. '11th' or 'July 11th'."""
    day = deadline_date.day
    suffix = "th" if 11 <= day <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{deadline_date.strftime('%B')} {day}{suffix}"


def calculate_daily_plan(
    target_hours: float,
    deadline: Union[str, date, datetime, None],
    user_id: str = "1",
    db: Optional[Session] = None,
    workspace_name: str = "Goal Workspace",
) -> dict:
    """
    Predictive Goal Optimizer:
    Calculates daily session requirements mathematically and adjusts based on actual past user behavior.
    Returns structured metrics and clean Markdown recommendations for the AI Coach dashboard.
    """
    # 1. Normalize target hours
    t_hours = float(target_hours) if target_hours and target_hours > 0 else 10.0

    # 2. Calculate days until deadline
    today = datetime.utcnow().date()
    target_date = today

    if deadline:
        if isinstance(deadline, datetime):
            target_date = deadline.date()
        elif isinstance(deadline, date):
            target_date = deadline
        elif isinstance(deadline, str):
            try:
                target_date = datetime.fromisoformat(deadline.split("T")[0]).date()
            except Exception:
                target_date = today

    days_remaining = (target_date - today).days
    if days_remaining < 1:
        days_remaining = 1

    deadline_display = _format_deadline_display(target_date) if target_date != today else "upcoming"

    # 3. Inspect historical productivity to determine user's realistic sprint duration
    sprint_minutes = 25  # default productive block
    historical_sessions_count = 0

    if db:
        try:
            completed_sessions = (
                db.query(models.Session)
                .filter(
                    models.Session.session_type == "FOCUS",
                    models.Session.status == "COMPLETED",
                    models.Session.duration.isnot(None),
                    models.Session.duration > 300,
                )
                .all()
            )
            historical_sessions_count = len(completed_sessions)
            if historical_sessions_count >= 2:
                avg_duration_secs = sum(s.duration for s in completed_sessions) / historical_sessions_count
                avg_mins = round(avg_duration_secs / 60)
                # Snap to standard Pomodoro/Sprint blocks
                if avg_mins <= 32:
                    sprint_minutes = 25
                elif avg_mins <= 52:
                    sprint_minutes = 45
                else:
                    sprint_minutes = 60
            else:
                profile = load_user_profile()
                sprint_minutes = profile.get("preferred_sprint_minutes", 25)
        except Exception as exc:
            logger.warning(f"[GOAL OPTIMIZER] Error querying history: {exc}")
    else:
        profile = load_user_profile()
        sprint_minutes = profile.get("preferred_sprint_minutes", 25)

    # 4. Mathematical Goal Partitioning
    total_minutes_required = round(t_hours * 60)
    daily_minutes = round(total_minutes_required / days_remaining)
    sessions_per_day = max(1, math.ceil(daily_minutes / sprint_minutes))

    # Distribute sessions across morning and afternoon blocks
    morning_sessions = math.ceil(sessions_per_day * 0.6)
    afternoon_sessions = sessions_per_day - morning_sessions
    if afternoon_sessions < 0:
        afternoon_sessions = 0

    # 5. Format clean Markdown for dashboard UI
    markdown_plan = (
        f"### 🎯 Daily Commitment: {workspace_name}\n\n"
        f"I've analyzed your past behavior, and here is your custom plan to hit your **{deadline_display}** deadline.\n\n"
        f"* **Goal Pace**: **{t_hours}h** across **{days_remaining} day(s)** (**{daily_minutes}m/day**)\n"
        f"* **Behavioral Baseline**: Based on your session history, you perform best in **{sprint_minutes}m focus sprints**\n"
        f"* **Recommended Schedule**: Do **{morning_sessions} session(s) of {sprint_minutes}m** in the morning, and **{afternoon_sessions} in the afternoon** (**{sessions_per_day} sessions daily**)\n\n"
        f"Shall I set these **{sessions_per_day} x {sprint_minutes}m blocks** as your default daily commitment?"
    )

    logger.info(
        f"[GOAL OPTIMIZER] Plan calculated: {sessions_per_day}x{sprint_minutes}m/day for {t_hours}h over {days_remaining}d"
    )

    return {
        "target_hours": t_hours,
        "deadline": target_date.isoformat(),
        "deadline_display": deadline_display,
        "days_remaining": days_remaining,
        "historical_sprint_minutes": sprint_minutes,
        "daily_minutes_required": daily_minutes,
        "sessions_per_day": sessions_per_day,
        "morning_sessions": morning_sessions,
        "afternoon_sessions": afternoon_sessions,
        "commitment_markdown": markdown_plan,
        "summary_text": f"To hit your {deadline_display} deadline, based on your history, I recommend {sessions_per_day} sessions of {sprint_minutes}m daily ({morning_sessions} morning, {afternoon_sessions} afternoon).",
    }
