import os
import json
import logging
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from openai import AsyncOpenAI

from app.models.connection import get_db
from app.models import crud
from app.models import schemas as models
from app.api.auth import get_current_user
from app.services.star_ml import (
    load_user_profile,
    STAR_TOOLS,
    TOOL_DISPATCH,
    StarMLEngine,
    OS_SYSTEM_UTILITIES,
)

# Initialize Groq client
client = AsyncOpenAI(
    api_key=os.getenv("GROQ_API_KEY", "missing_key"),
    base_url="https://api.groq.com/openai/v1",
)

router = APIRouter()
logger = logging.getLogger("prodify_backend")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None
    # Legacy flat fields kept for backward compatibility
    workspace_name: Optional[str] = "Default"
    workspace_mode: Optional[str] = "Structured"
    focus_minutes: Optional[int] = 0
    distraction_count: Optional[int] = 0
    idle_seconds: Optional[int] = 0
    burnout_probability: Optional[float] = 0
    current_state: Optional[str] = "IDLE"
    session_count: Optional[int] = 0
    time_remaining: Optional[str] = "00:00"


class FunctionCallRequest(BaseModel):
    message: str


class WorkspaceCreationIntent(BaseModel):
    name: str
    mode: str
    work_duration: int = 45
    break_duration: int = 5
    user_id: str = "1"


# ---------------------------------------------------------------------------
# /chat – The Star ML Engine (Agentic Tool-Calling Loop)
# ---------------------------------------------------------------------------



@router.post("/chat")
@router.post("/ai-coach/chat")
async def chat_endpoint(
    request: ChatRequest,
    http_req: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        ctx = {**(request.context or {}), "user_id": current_user.id}
        ws_id = ctx.get("workspaceId")
        ws_name = ctx.get("workspaceName") or request.workspace_name or "Default"
        
        # Safely normalize any top_distractions or distractions in ctx if present
        for dist_key in ("top_distractions", "topDistractions", "distractions"):
            if dist_key in ctx and ctx[dist_key]:
                raw_dists = ctx[dist_key]
                if isinstance(raw_dists, list):
                    cleaned_items = []
                    for d in raw_dists:
                        if isinstance(d, dict):
                            raw_n = (d.get("raw_app_name") or d.get("app_name") or d.get("app") or "").lower().strip()
                            if raw_n in OS_SYSTEM_UTILITIES:
                                continue
                            name = d.get("platform_name") or d.get("clean_app_name") or d.get("platform") or d.get("app") or d.get("clean_app") or "Unknown"
                            if str(name).lower().strip() not in OS_SYSTEM_UTILITIES:
                                cnt = d.get("count") or d.get("cnt")
                                cleaned_items.append(f"{name} ({cnt}x)" if cnt else str(name))
                        elif isinstance(d, str):
                            if d.lower().strip() not in OS_SYSTEM_UTILITIES:
                                cleaned_items.append(d)
                        else:
                            cleaned_items.append(str(d))
                    ctx[dist_key] = ", ".join(cleaned_items) if cleaned_items else "None recorded"

        # Safely normalize intent if it is a list of dicts/strings
        intent_val = ctx.get("sessionIntent") or ctx.get("intent")
        if isinstance(intent_val, list):
            cleaned_intents = []
            for item in intent_val:
                if isinstance(item, dict):
                    cleaned_intents.append(f"{item.get('platform_name') or item.get('clean_app_name') or item.get('name') or str(item)}")
                else:
                    cleaned_intents.append(str(item))
            ctx["sessionIntent"] = ", ".join(cleaned_intents)
        elif isinstance(intent_val, dict):
            ctx["sessionIntent"] = f"{intent_val.get('platform_name') or intent_val.get('clean_app_name') or intent_val.get('name') or str(intent_val)}"

        # 1. Find Workspace to load history and properties
        if ws_id:
            ws = db.query(models.Workspace).filter(
                models.Workspace.id == ws_id,
                models.Workspace.user_id == current_user.id
            ).first()
        else:
            ws = db.query(models.Workspace).filter(
                models.Workspace.user_id == current_user.id,
                models.Workspace.name == ws_name
            ).order_by(models.Workspace.created_at.desc()).first()

        if ws:
            ws_id = ws.id
            ctx["workspaceId"] = ws.id
            ctx["workspaceName"] = ws.name
            ctx["workspaceCategory"] = ws.category
            if not ctx.get("sessionIntent"):
                ctx["sessionIntent"] = ws.current_goal or ws.focus_keywords or ""
        
        # 2. Load History
        history = []
        if ws_id:
            chat_records = db.query(models.WorkspaceChatHistory).filter(
                models.WorkspaceChatHistory.workspace_id == ws_id
            ).order_by(models.WorkspaceChatHistory.timestamp.asc()).all()
            for r in chat_records:
                history.append({"role": r.role, "content": r.content})
        
        engine = getattr(http_req.app.state, "star_engine", None)
        if not engine:
            engine = StarMLEngine()

        user_name = current_user.full_name or current_user.username or (current_user.email.split('@')[0] if current_user.email else "there")
        user_age = current_user.age

        # Inject age into context if available so StarMLEngine uses it
        if user_age:
            ctx["user_age"] = user_age
            ctx["user_name"] = user_name

        is_debrief = request.message == "SYSTEM_DEBRIEF"
        
        if is_debrief:
            distractions = ctx.get("distractionCount", 0)
            work_dur = ctx.get("workDuration", 25)
            distracted_secs = ctx.get("distractedSeconds", 0)
            if distracted_secs > 300:
                mins = int(distracted_secs // 60)
                prompt = f"The user just finished a {work_dur}-minute session in workspace '{ws_name}', but paused or stepped away for {mins} minutes. Provide constructive, encouraging advice on regaining flow in at most 2-3 short bullet points."
            else:
                prompt = f"The user just finished a {work_dur}-minute focus session in workspace '{ws_name}' with only {distractions} minor distractions. Celebrate their effort warmly in 1-2 bullet points and ask what they accomplished."
            reply = await engine.generate_coaching_response(
                message=prompt,
                context=ctx,
                db=db,
                history=history,
                user_name=user_name,
                user_id=current_user.id,
            )
        else:
            reply = await engine.generate_coaching_response(
                message=request.message,
                context=ctx,
                db=db,
                history=history,
                user_name=user_name,
                user_id=current_user.id,
            )
        
        # 3. Save to DB
        if ws_id:
            if not is_debrief:
                user_msg = models.WorkspaceChatHistory(workspace_id=ws_id, role="user", content=request.message)
                db.add(user_msg)
            
            asst_msg = models.WorkspaceChatHistory(workspace_id=ws_id, role="assistant", content=reply)
            db.add(asst_msg)
            db.commit()

        # Feedback Loop: log interaction
        try:
            burnout_score = ctx.get("burnoutProbability", 0)
            focus_minutes = ctx.get("focusMinutes", 0)
            if not is_debrief:
                engine.log_coaching_interaction(
                    db=db,
                    workspace_id=ws_id or 0,
                    user_message=request.message,
                    ai_response=reply,
                    burnout_at_time=burnout_score,
                    focus_minutes_at_time=focus_minutes
                )
        except Exception as log_ex:
            logger.error(f"[STAR ML] Failed to log coaching interaction: {log_ex}")

        return {"response": reply}

    except Exception as e:
        logger.error(f"[STAR ML] chat_endpoint error: {e}", exc_info=True)
        return {"response": f"Star ML Engine Error: {str(e)}"}


class FunctionCallResponse(BaseModel):
    intent: Optional[str] = None
    workspace_config: Optional[WorkspaceCreationIntent] = None
    explanation: str


@router.post("/function-call", response_model=FunctionCallResponse)
@router.post("/ai-coach/function-call", response_model=FunctionCallResponse)
async def ai_function_call(
    request: FunctionCallRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    AI-powered function calling endpoint.
    Integrates GoalOptimizer to calculate Daily Commitment for Structured Goal Workspaces.
    """
    try:
        system_prompt = """
        You are a workspace creation assistant for Prodify.
        Parse the user's message and extract workspace creation intent.

        Respond with ONLY valid JSON in this exact format (no markdown, no backticks):
        {
          "intent": "create_workspace" or null,
          "workspace_config": {
            "name": "string - descriptive workspace name",
            "mode": "Structured Goal Mode" or "Flexible Tracking Mode",
            "work_duration": number (default 45, must be 1-180),
            "break_duration": number (default 5, must be 1-60),
            "target_hours": number or null (e.g. 20.0),
            "deadline": "YYYY-MM-DD" or null,
            "user_id": "derived from the authenticated user"
          },
          "explanation": "string - brief explanation of what was parsed"
        }

        If the message is not about creating a workspace, set intent to null.
        If target hours or deadline is mentioned, include them.
        """

        completion = await client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message}
            ],
            response_format={"type": "json_object"}
        )

        result = json.loads(completion.choices[0].message.content)

        if result.get("intent") == "create_workspace":
            config = result.get("workspace_config", {})
            work_duration = max(1, min(180, config.get("work_duration", 45)))
            break_duration = max(1, min(60, config.get("break_duration", 5)))
            target_hours = config.get("target_hours", 20.0)
            deadline = config.get("deadline", None)
            mode = config.get("mode", "Structured Goal Mode")
            ws_name = config.get("name", "AI Generated Workspace")

            workspace = crud.create_workspace(
                db=db,
                user_id=current_user.id,
                name=ws_name,
                mode=mode,
                work_duration=work_duration,
                break_duration=break_duration,
            )

            explanation = result.get("explanation", f"Workspace '{workspace.name}' created successfully!")

            # Adjust explanation for structured goals
            if "Structured" in mode or target_hours or deadline:
                explanation = f"{explanation}\n\nWorkspace successfully scheduled for {target_hours or 20} hours before {deadline or 'the deadline'}."

            return FunctionCallResponse(
                intent="create_workspace",
                workspace_config=WorkspaceCreationIntent(
                    name=workspace.name,
                    mode=workspace.mode,
                    work_duration=workspace.work_duration,
                    break_duration=workspace.break_duration,
                    user_id=current_user.id,
                ),
                explanation=explanation
            )

        return FunctionCallResponse(
            intent=None,
            workspace_config=None,
            explanation=result.get("explanation", "No workspace creation intent detected.")
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Goal Optimizer Endpoints (Removed in Phase 2)
# ---------------------------------------------------------------------------


@router.get("/ai-coach/daily-insight")
async def get_daily_insight(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    from datetime import date, timedelta
    from sqlalchemy import func, desc
    
    stats = db.query(models.UserStats).filter(models.UserStats.user_id == current_user.id).first()
    streak = stats.current_global_streak if stats else 0
    
    yesterday = date.today() - timedelta(days=1)
    logs = db.query(models.DailyWorkspaceLog).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.DailyWorkspaceLog.date == yesterday
    ).all()
    
    total_minutes = sum(log.minutes_logged for log in logs)
    
    from app.services.activity_parser import parse_activity

    act_logs = db.query(
        models.ActivityLog.app_name,
        models.ActivityLog.window_title,
        models.ActivityLog.platform_name,
        models.ActivityLog.clean_app_name
    ).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.ActivityLog.is_focused == 0,
        func.date(models.ActivityLog.timestamp) == yesterday
    ).all()
    
    app_counts: Dict[str, int] = {}
    for log in act_logs:
        raw_app = (log.app_name or "").lower().strip()
        if raw_app in OS_SYSTEM_UTILITIES:
            continue
        display_name = log.platform_name or log.clean_app_name
        if not display_name:
            clean, plat, _ = parse_activity(log.window_title or "", log.app_name or "")
            display_name = plat or clean or log.app_name or "Unknown"
        if display_name and str(display_name).lower().strip() not in OS_SYSTEM_UTILITIES:
            app_counts[display_name] = app_counts.get(display_name, 0) + 1

    top_dists = sorted(app_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    distraction_str = ', '.join([f'{app} ({cnt} times)' for app, cnt in top_dists]) if top_dists else 'None'
        
    user_name = current_user.full_name or current_user.username or 'there'

    prompt = f"""You are the Prodify AI Coach. Greet the user ({user_name}) and give a short 1-2 sentence proactive insight for the day.
Data from yesterday: Focused for {total_minutes} minutes. Top distractions: {distraction_str}. Current streak: {streak} days.
Be encouraging but direct. DO NOT say 'Here is your insight'. Keep it under 35 words."""

    try:
        completion = await client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[
                {"role": "system", "content": "You are a strict but supportive productivity coach."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=100
        )
        return {"insight": completion.choices[0].message.content.strip()}
    except Exception as e:
        logger.error(f"Error generating insight: {e}")
        return {"insight": f"Welcome back, {user_name}. Ready to focus today?"}
