import os
import json
import logging
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional, Any
from sqlalchemy.orm import Session
from openai import AsyncOpenAI
from app.models import crud
from app.models import schemas as models

logger = logging.getLogger("prodify_backend")

# ---------------------------------------------------------------------------
# User Profile – Persistent Long-Term Memory (JSON)
# ---------------------------------------------------------------------------
_PROFILE_PATH = Path("data/user_profile.json")

_DEFAULT_PROFILE = {
    "name": "Pranav",
    "preferred_sprint_minutes": 45,
    "preferred_break_minutes": 5,
    "known_productive_apps": ["VS Code", "Terminal", "Brave Browser", "Antigravity"],
    "known_distraction_triggers": [],
    "coaching_notes": [],
    "last_updated": None,
}


def load_user_profile() -> dict:
    """Load persistent user profile from disk. Create default if missing."""
    try:
        if _PROFILE_PATH.exists():
            with open(_PROFILE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as exc:
        logger.warning(f"[STAR ML] Failed to read user_profile.json: {exc}")
    return _DEFAULT_PROFILE.copy()


def save_user_profile(profile: dict):
    """Persist user profile to disk."""
    try:
        _PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        profile["last_updated"] = datetime.utcnow().isoformat()
        with open(_PROFILE_PATH, "w", encoding="utf-8") as f:
            json.dump(profile, f, indent=2, default=str)
        logger.info("[STAR ML] User profile saved successfully.")
    except Exception as exc:
        logger.error(f"[STAR ML] Failed to save user_profile.json: {exc}")


# ---------------------------------------------------------------------------
# Tool Functions – The Star ML Engine's analytical instruments
# ---------------------------------------------------------------------------

def tool_get_focus_metrics(db: Session) -> dict:
    """Returns focus density, vitality rating, and session counts from the last 7 days."""
    logger.info("[STAR ML TOOL] get_focus_metrics called")
    logs = crud.get_recent_activity_logs(db, days=7, limit=300)

    if not logs:
        return {
            "focus_density_pct": 100,
            "vitality": "Unknown (no data)",
            "total_window_switches": 0,
            "focused_switches": 0,
            "distracted_switches": 0,
            "data_available": False,
        }

    total = len(logs)
    focused = sum(1 for l in logs if l.is_focused == 1)
    distracted = total - focused
    density = round((focused / total) * 100) if total > 0 else 100
    vitality = "High" if density >= 80 else ("Moderate" if density >= 60 else "Low / Fatigued")

    return {
        "focus_density_pct": density,
        "vitality": vitality,
        "total_window_switches": total,
        "focused_switches": focused,
        "distracted_switches": distracted,
        "data_available": True,
    }


def tool_get_top_distractions(db: Session) -> dict:
    """SQL aggregation: top 5 distraction apps with frequency and peak time-of-day."""
    logger.info("[STAR ML TOOL] get_top_distractions called")
    cutoff = datetime.utcnow() - timedelta(days=7)
    logs = (
        db.query(models.ActivityLog)
        .filter(models.ActivityLog.timestamp >= cutoff, models.ActivityLog.is_focused == 0)
        .order_by(models.ActivityLog.timestamp.desc())
        .limit(300)
        .all()
    )

    if not logs:
        return {"distractions": [], "peak_distraction_hour": None, "data_available": False}

    app_counts: Dict[str, int] = {}
    hour_counts: Dict[int, int] = {}
    for l in logs:
        app = l.app_name or "Unknown"
        app_counts[app] = app_counts.get(app, 0) + 1
        if l.timestamp:
            h = l.timestamp.hour
            hour_counts[h] = hour_counts.get(h, 0) + 1

    top_5 = sorted(app_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    peak_hour = max(hour_counts, key=hour_counts.get) if hour_counts else None
    peak_label = f"{peak_hour}:00–{peak_hour+1}:00" if peak_hour is not None else "N/A"

    return {
        "distractions": [{"app": app, "count": cnt} for app, cnt in top_5],
        "peak_distraction_hour": peak_label,
        "total_distraction_events": sum(app_counts.values()),
        "data_available": True,
    }


def tool_get_session_history(db: Session) -> dict:
    """Retrieves the last 5 completed focus sessions with duration and workspace."""
    logger.info("[STAR ML TOOL] get_session_history called")
    sessions = (
        db.query(models.Session)
        .filter(models.Session.session_type == "FOCUS")
        .order_by(models.Session.start_time.desc())
        .limit(5)
        .all()
    )

    if not sessions:
        return {"sessions": [], "data_available": False}

    results = []
    for s in sessions:
        ws = db.query(models.Workspace).filter(models.Workspace.id == s.workspace_id).first()
        results.append({
            "workspace": ws.name if ws else f"WS#{s.workspace_id}",
            "status": s.status,
            "duration_minutes": round(s.duration / 60, 1) if s.duration else 0,
            "started": s.start_time.strftime("%Y-%m-%d %I:%M %p") if s.start_time else "N/A",
            "pause_reason": s.pause_reason,
        })

    return {"sessions": results, "data_available": True}


def tool_optimize_workspace_goal(db: Session) -> dict:
    """Calculates a custom daily commitment schedule based on target hours, deadline, and past session history."""
    logger.info("[STAR ML TOOL] optimize_workspace_goal called")
    from app.services.goal_optimizer import calculate_daily_plan
    # Fetch active or latest structured workspace if available
    ws = (
        db.query(models.Workspace)
        .order_by(models.Workspace.id.desc())
        .first()
    )
    target_hours = ws.target_hours if ws and ws.target_hours else 20.0
    deadline = ws.deadline if ws and ws.deadline else None
    name = ws.name if ws else "Your Goal Workspace"
    return calculate_daily_plan(
        target_hours=target_hours,
        deadline=deadline,
        db=db,
        workspace_name=name,
    )


def analyze_user_patterns(db: Session) -> dict:
    from datetime import date
    metrics = db.query(models.WorkspaceMetrics).all()
    if not metrics:
        return {
            "peak_hour": "N/A",
            "peak_workspace": "N/A",
            "avg_session_length": 0,
            "distraction_triggers": [],
            "burnout_pattern": "low",
            "consistency_score": 0,
            "best_day_of_week": "N/A"
        }
    
    time_of_day_counts = {}
    workspace_focus = {}
    workspace_sessions = {}
    workspace_distractions = {}
    day_counts = {}
    active_days = set()
    today = date.today()

    for m in metrics:
        time_of_day_counts[m.time_of_day] = time_of_day_counts.get(m.time_of_day, 0) + m.focus_minutes
        workspace_focus[m.workspace_name] = workspace_focus.get(m.workspace_name, 0) + m.focus_minutes
        workspace_sessions[m.workspace_name] = workspace_sessions.get(m.workspace_name, 0) + 1
        workspace_distractions[m.workspace_name] = workspace_distractions.get(m.workspace_name, 0) + m.distraction_count
        
        day_name = m.session_date.strftime("%A")
        day_counts[day_name] = day_counts.get(day_name, 0) + m.focus_minutes
        
        if (today - m.session_date).days < 7:
            active_days.add(m.session_date)

    peak_hour = max(time_of_day_counts.items(), key=lambda x: x[1])[0] if time_of_day_counts else "N/A"
    
    peak_workspace = "N/A"
    highest_avg = 0
    for w in workspace_focus:
        avg = workspace_focus[w] / workspace_sessions[w]
        if avg > highest_avg:
            highest_avg = avg
            peak_workspace = w

    avg_session_length = sum(workspace_focus.values()) / sum(workspace_sessions.values()) if workspace_sessions else 0
    
    distraction_triggers = [k for k, v in sorted(workspace_distractions.items(), key=lambda item: item[1], reverse=True)[:3]]
    
    avg_burnout = sum(m.burnout_score for m in metrics) / len(metrics)
    if avg_burnout > 60:
        burnout_pattern = "high risk"
    elif avg_burnout >= 30:
        burnout_pattern = "moderate"
    else:
        burnout_pattern = "low"
        
    consistency_score = len(active_days)
    best_day_of_week = max(day_counts.items(), key=lambda x: x[1])[0] if day_counts else "N/A"
    
    return {
        "peak_hour": peak_hour,
        "peak_workspace": peak_workspace,
        "avg_session_length": round(avg_session_length, 1),
        "distraction_triggers": distraction_triggers,
        "burnout_pattern": burnout_pattern,
        "consistency_score": consistency_score,
        "best_day_of_week": best_day_of_week
    }

def get_coaching_history(db: Session) -> dict:
    interactions = db.query(models.CoachingInteraction).order_by(models.CoachingInteraction.timestamp.desc()).limit(10).all()
    return {"history": [{"user": i.user_message, "ai": i.ai_response, "burnout": i.burnout_score_at_time, "focus_minutes": i.focus_minutes_at_time, "timestamp": i.timestamp} for i in interactions]}

# ---------------------------------------------------------------------------
# Tool-calling schema for Groq (OpenAI-compatible function calling)
# ---------------------------------------------------------------------------

STAR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_focus_metrics",
            "description": "Returns 7-day focus density percentage, vitality rating (High/Moderate/Low), and total focused vs distracted window switches. Call this when the user asks about their performance, focus score, or current status.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_distractions",
            "description": "Returns the top 5 most frequent distraction apps, the peak distraction hour of day, and total distraction events over the last 7 days. Call this when the user asks about patterns, distractions, what is killing their focus, or wants a behavioral breakdown.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_session_history",
            "description": "Returns the last 5 completed focus sessions with workspace name, duration, status, and pause reasons. Call this when the user asks about recent sessions, history, or completion rates.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "optimize_workspace_goal",
            "description": "Calculates the mathematical Daily Commitment schedule (target hours remaining / days until deadline adjusted by user historical sprint pace). Call this when the user asks about their deadline, goal plan, schedule, how many sessions to do daily, or when discussing a structured goal workspace.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_patterns",
            "description": "Returns the full pattern analysis of the user including peak focus times, best workspaces, distraction triggers, and burnout patterns.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_coaching_history",
            "description": "Returns the last 10 coaching interactions to understand previous advice given.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# Map tool names to Python callables
TOOL_DISPATCH = {
    "get_focus_metrics": tool_get_focus_metrics,
    "get_top_distractions": tool_get_top_distractions,
    "get_session_history": tool_get_session_history,
    "optimize_workspace_goal": tool_optimize_workspace_goal,
    "get_user_patterns": analyze_user_patterns,
    "get_coaching_history": get_coaching_history,
}


class StarMLEngine:
    """
    Star ML Engine – Personal Productivity Architect & Agentic Cognition System.
    Encapsulates Groq tool-calling loops and long-term user context.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        if not self.api_key or self.api_key == "missing_key":
            logger.error("[STAR ML] Initialization failed: GROQ_API_KEY environment variable is missing or invalid.")
            raise ValueError("StarMLEngine initialization failed: GROQ_API_KEY environment variable is missing or invalid.")

        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url="https://api.groq.com/openai/v1",
        )
        logger.info("🌟 StarMLEngine initialized successfully with Groq API key.")

    async def generate_coaching_response(
        self,
        message: str,
        context: Dict[str, Any],
        db: Session,
        history: list = None,
        user_name: str = "there",
    ) -> str:
        """Runs the multi-round agentic tool-calling loop."""
        history = history or []
        ws_name = context.get("workspaceName", "Default")
        focus_minutes = context.get("focusMinutes", 0)
        distraction_count = context.get("distractionCount", 0)
        burnout_probability = context.get("burnoutProbability", 0)
        time_remaining = context.get("timeRemaining", "00:00")
        focus_keywords = context.get("focusKeywords", [])

        profile = await asyncio.to_thread(load_user_profile)

        intent_val = context.get("sessionIntent") or context.get("intent") or focus_keywords or ""
        if isinstance(intent_val, list):
            current_intent = ", ".join(str(k) for k in intent_val)
        else:
            current_intent = str(intent_val)

        # Gather dynamic user patterns
        patterns = analyze_user_patterns(db)
        metrics = db.query(models.WorkspaceMetrics).all()
        total_focus_hours = sum(m.focus_minutes for m in metrics) / 60.0 if metrics else 0.0
        total_sessions = len(metrics)

        # Ensure context defaults
        context = context or {}
        user_name = context.get('user_name', user_name)
        user_age = context.get('user_age', None)

        system_prompt = f"""You are Prodify Intelligence — a sharp, data-driven productivity coach.
You have full memory of this conversation and the user's long-term patterns.
Never introduce yourself if previous messages exist.
The user's name is {user_name}. Greet them or refer to them by this name when appropriate.

USER PROFILE (from ML analysis):
- Name: {user_name}
{f'- Age: {user_age}' if user_age else ''}
- Peak focus hour: {patterns['peak_hour']}
- Best workspace: {patterns['peak_workspace']}
- Average session length: {patterns['avg_session_length']} minutes
- Burnout pattern: {patterns['burnout_pattern']}
- Consistency score: {patterns['consistency_score']}/7 days
- Distraction hotspots: {', '.join(patterns['distraction_triggers']) if patterns['distraction_triggers'] else 'None'}

CURRENT SESSION:
- Workspace: {ws_name}
- Intent: {current_intent or 'General productivity'}
- Mode: {context.get('workspaceMode', 'General')}
- Focus minutes so far: {focus_minutes}
- Burnout score: {burnout_probability:.2f}%
- Distractions this session: {distraction_count}

GLOBAL STATS:
- Total focus hours logged: {total_focus_hours:.1f}
- Total sessions completed: {total_sessions}

Be direct, specific, and reference the user's actual data. Never give generic advice.
If burnout score is above 70%, always recommend a break first before anything else.
If consistency score is below 3, address the habit gap directly."""

        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": message})

        max_tool_rounds = 3
        for round_num in range(max_tool_rounds):
            completion = await self.client.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=messages,
                tools=STAR_TOOLS,
                tool_choice="auto",
                temperature=0.7,
                max_tokens=650,
            )

            response_message = completion.choices[0].message

            if response_message.tool_calls:
                messages.append(response_message)
                for tool_call in response_message.tool_calls:
                    fn_name = tool_call.function.name
                    executor = TOOL_DISPATCH.get(fn_name)
                    if executor:
                        try:
                            result = await asyncio.to_thread(executor, db)
                        except Exception as tex:
                            logger.error(f"[STAR ML] Tool {fn_name} failed: {tex}")
                            result = {"error": str(tex), "data_available": False}
                    else:
                        result = {"error": f"Unknown tool: {fn_name}"}

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result, default=str),
                    })
                continue

            final_text = response_message.content
            return (final_text or "").strip() or "Star ML Engine generated no output. Try rephrasing."

        last_content = completion.choices[0].message.content
        return (last_content or "").strip() or "Analysis timed out. Please try a more specific question."

    def log_coaching_interaction(
        self,
        db: Session,
        workspace_id: int,
        user_message: str,
        ai_response: str,
        burnout_at_time: float,
        focus_minutes_at_time: float
    ):
        interaction = models.CoachingInteraction(
            workspace_id=workspace_id or 0,
            user_message=user_message,
            ai_response=ai_response,
            burnout_score_at_time=burnout_at_time,
            focus_minutes_at_time=focus_minutes_at_time
        )
        db.add(interaction)
        db.commit()

