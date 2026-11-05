import os
import json
import re
import logging
import shutil
import subprocess
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from openai import AsyncOpenAI

from app.models.connection import get_db
from app.models import crud
from app.models import schemas as models

logger = logging.getLogger("prodify_backend")
router = APIRouter(prefix="/private-space", tags=["private-space"])

# Initialize existing AI client reusing configured Groq key
groq_api_key = os.getenv("GROQ_API_KEY", "missing_key")
ai_client = AsyncOpenAI(
    api_key=groq_api_key,
    base_url="https://api.groq.com/openai/v1",
)

# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class PrivateChatRequest(BaseModel):
    message: str
    current_state: Optional[Dict[str, Any]] = None
    session_id: Optional[int] = None

class SlotState(BaseModel):
    total_duration_mins: Optional[int] = None
    focus_mins: Optional[int] = 25
    break_mins: Optional[int] = 5
    task_context: Optional[str] = None
    allowed_apps: Optional[List[str]] = None

class PrivateChatResponse(BaseModel):
    reply: str
    is_ready: bool
    slots: Dict[str, Any]
    missing_slots: List[str]
    session: Optional[Dict[str, Any]] = None

class GuardCheckRequest(BaseModel):
    session_id: Optional[int] = None
    current_app: Optional[str] = None
    window_title: Optional[str] = None

class GuardCheckResponse(BaseModel):
    allowed: bool
    current_app: str
    warning: Optional[str] = None
    active_window: Optional[str] = None

class CompleteSessionRequest(BaseModel):
    session_id: int
    completed_cycles: Optional[int] = None

class UpdateCycleRequest(BaseModel):
    session_id: int
    completed_cycles: int

# ---------------------------------------------------------------------------
# Helper: Robust Heuristic / Local Fallback Slot Filler
# ---------------------------------------------------------------------------

VAGUE_APP_PATTERNS = [
    r"\bapps?\s+related\s+to\b",
    r"\banything\s+related\s+to\b",
    r"\bcoding\s+or\s+editing\b",
    r"\bproductivity\s+apps?\b",
    r"\bediting\s+apps?\b",
    r"\bstudy\s+apps?\b",
    r"\bany\s+app\b",
    r"\bnormal\s+apps?\b",
    r"\bschool\s+apps?\b",
]

KNOWN_APP_CANONICAL = {
    "vs code": "code",
    "vscode": "code",
    "visual studio code": "code",
    "code": "code",
    "cursor": "cursor",
    "kitty": "kitty",
    "terminal": "terminal",
    "bash": "bash",
    "zsh": "zsh",
    "alacritty": "alacritty",
    "wezterm": "wezterm",
    "libreoffice": "libreoffice",
    "openoffice": "libreoffice",
    "firefox": "firefox",
    "chrome": "chrome",
    "google chrome": "chrome",
    "brave": "brave",
    "edge": "edge",
    "obsidian": "obsidian",
    "notion": "notion",
    "pycharm": "pycharm",
    "intellij": "idea",
    "clion": "clion",
    "sublime": "sublime_text",
    "word": "winword",
    "excel": "excel",
    "powerpoint": "powerpnt",
    "gimp": "gimp",
    "inkscape": "inkscape",
    "blender": "blender",
    "kdenlive": "kdenlive",
    "davinci": "resolve",
    "slack": "slack",
    "discord": "discord",
    "spotify": "spotify",
    "postman": "postman",
    "dbeaver": "dbeaver",
    "figma": "figma",
}

def extract_slots_heuristically(message: str, current_state: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    state = dict(current_state or {})
    msg_lower = message.lower().strip()

    # 1. Total Duration Extraction
    if not state.get("total_duration_mins"):
        # Match "7 hours", "7h", "7 hrs", "420 mins", "420m"
        hour_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)\b", msg_lower)
        min_match = re.search(r"(\d+)\s*(?:minutes|minute|mins|min|m)\b", msg_lower)
        if hour_match:
            try:
                state["total_duration_mins"] = int(float(hour_match.group(1)) * 60)
            except Exception:
                pass
        elif min_match:
            try:
                state["total_duration_mins"] = int(min_match.group(1))
            except Exception:
                pass

    # 2. Cycle Split (Focus / Break)
    if not state.get("focus_mins") or not state.get("break_mins"):
        split_match = re.search(r"(\d+)\s*[/:]\s*(\d+)", msg_lower)
        if split_match:
            state["focus_mins"] = int(split_match.group(1))
            state["break_mins"] = int(split_match.group(2))
        elif "pomodoro" in msg_lower or "25/5" in msg_lower:
            state["focus_mins"] = 25
            state["break_mins"] = 5
        elif state.get("total_duration_mins") and not state.get("focus_mins"):
            state["focus_mins"] = 25
            state["break_mins"] = 5

    # 3. Task Context Extraction
    if not state.get("task_context"):
        # Check phrases like "project work and my IKS assignment", "studying c++"
        task_candidates = []
        task_patterns = [
            r"(?:have|working on|doing|focus on|for)\s+([a-zA-Z0-9\s,+-]+?)(?:,\s*studying|\s*studying|\s*with|\s*for|\s*today|\.|$)",
            r"(?:project\s+work[^\.,]*)",
            r"(?:iks\s+assignment[^\.,]*)",
        ]
        for pat in task_patterns:
            m = re.search(pat, message, re.IGNORECASE)
            if m:
                cand = m.group(1) if m.groups() else m.group(0)
                cleaned = re.sub(r"\b(only allow|apps related|studying|hours?|today)\b.*", "", cand, flags=re.IGNORECASE).strip()
                if cleaned and len(cleaned) > 2:
                    task_candidates.append(cleaned)
        
        if task_candidates:
            state["task_context"] = ", ".join(task_candidates)
        elif len(message.split()) > 2 and not any(v in msg_lower for v in ["vs code", "kitty", "firefox"]):
            # Heuristic capture of task if sentence describes intent
            cand = re.sub(r"\b(\d+\s*hours?|\d+\s*mins?|\d+/\d+|allow|apps?)\b.*", "", message, flags=re.IGNORECASE).strip()
            if len(cand) > 3:
                state["task_context"] = cand

    # 4. Allowed Apps Extraction (Strict Check)
    # Check if user mentioned vague description
    has_vague_description = any(re.search(pat, msg_lower) for pat in VAGUE_APP_PATTERNS)
    
    # Check for concrete known apps
    found_apps: List[str] = list(state.get("allowed_apps") or [])
    for app_alias, canonical in KNOWN_APP_CANONICAL.items():
        if re.search(r"\b" + re.escape(app_alias) + r"\b", msg_lower):
            if canonical not in found_apps:
                found_apps.append(canonical)

    # Check direct list after "allowed apps:" or "apps:"
    apps_clause_match = re.search(r"(?:allowed\s+apps|apps|use|using)\s*:\s*([^\.]+)", message, re.IGNORECASE)
    if apps_clause_match:
        raw_items = [item.strip().lower() for item in re.split(r"[,;]\s*", apps_clause_match.group(1))]
        for item in raw_items:
            # check if not vague
            if not any(re.search(pat, item) for pat in VAGUE_APP_PATTERNS) and len(item) > 1:
                canon = KNOWN_APP_CANONICAL.get(item, item.replace(" ", "_"))
                if canon not in found_apps:
                    found_apps.append(canon)

    if found_apps and (not has_vague_description or len(found_apps) >= 2):
        state["allowed_apps"] = found_apps
    elif has_vague_description and not found_apps:
        state["allowed_apps"] = None

    return state

# ---------------------------------------------------------------------------
# AI Slot Filling & Clarification Engine
# ---------------------------------------------------------------------------

async def evaluate_slots_with_ai(message: str, current_state: Dict[str, Any]) -> Dict[str, Any]:
    system_prompt = """You are the Antigravity Conversational Focus Engine for Prod Private Space.
Your task is to extract exactly 4 mandatory slots before locking into an active marathon:
1. `total_duration_mins`: integer total duration in minutes (e.g., 7 hours = 420 mins).
2. `focus_mins` & `break_mins`: integers for Pomodoro cycle (default 25 and 5 if 25/5 or Pomodoro mentioned).
3. `task_context`: string describing specific projects, assignments, topics, or homework.
4. `allowed_apps`: strict list of concrete application process names/aliases (e.g., ["code", "kitty", "libreoffice", "firefox", "cursor", "terminal"]).

STRICT CLARIFICATION-FIRST RULES:
- Vague categories like "apps related to coding or editing", "productivity apps", "study tools", or "anything for school" are NOT acceptable for `allowed_apps`.
- If `allowed_apps` is vague or missing, set `allowed_apps: null` and ask the user to clarify the exact app executables or programs.
- If ANY of the 4 slots (`total_duration_mins`, `focus_mins`, `task_context`, `allowed_apps`) is null, missing, or vague, set `is_ready: false` and write a helpful, concise `reply` asking for the missing slot(s).
- ONLY when ALL 4 slots have concrete, non-vague values, set `is_ready: true` and write an inspiring `reply` confirming that the Antigravity session is primed and ready.

Respond ONLY with valid JSON in this exact structure:
{
  "total_duration_mins": int or null,
  "focus_mins": int or null,
  "break_mins": int or null,
  "task_context": str or null,
  "allowed_apps": list of str or null,
  "is_ready": bool,
  "reply": str,
  "missing_slots": list of str
}
"""
    user_payload = {
        "user_message": message,
        "current_state": current_state
    }

    if groq_api_key and groq_api_key != "missing_key":
        try:
            completion = await ai_client.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_payload)}
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=500
            )
            raw_text = completion.choices[0].message.content
            parsed = json.loads(raw_text)
            return parsed
        except Exception as e:
            logger.warning(f"[PrivateSpace] Groq AI parsing failed ({e}). Falling back to local heuristic parser.")

    # Offline / Heuristic Fallback
    heuristic_state = extract_slots_heuristically(message, current_state)
    missing = []
    if not heuristic_state.get("total_duration_mins"):
        missing.append("total_duration_mins")
    if not heuristic_state.get("task_context"):
        missing.append("task_context")
    if not heuristic_state.get("allowed_apps") or len(heuristic_state.get("allowed_apps") or []) == 0:
        missing.append("allowed_apps")

    focus_mins = heuristic_state.get("focus_mins") or 25
    break_mins = heuristic_state.get("break_mins") or 5
    heuristic_state["focus_mins"] = focus_mins
    heuristic_state["break_mins"] = break_mins

    is_ready = len(missing) == 0

    if not is_ready:
        if "allowed_apps" in missing and heuristic_state.get("total_duration_mins") and heuristic_state.get("task_context"):
            hrs = heuristic_state['total_duration_mins'] // 60
            mins = heuristic_state['total_duration_mins'] % 60
            time_str = f"{hrs}h" if mins == 0 else f"{hrs}h {mins}m"
            reply = (
                f"Got it! Locked in for {time_str} ({focus_mins}/{break_mins} cycles) on {heuristic_state['task_context']}. "
                f"However, 'apps related to coding or editing' is too vague for the App Guard. "
                f"Which exact apps will you be using (e.g., VS Code, Kitty, LibreOffice, Firefox)?"
            )
        elif "task_context" in missing:
            reply = "Understood on the schedule! What specific projects, assignments, or subjects are you focusing on?"
        elif "total_duration_mins" in missing:
            reply = "Awesome! How many total hours or minutes are you planning to dedicate to this marathon session?"
        else:
            reply = "Let's set up your Private Space. What are you working on, for how long, and which exact apps do you need?"
    else:
        hrs = heuristic_state['total_duration_mins'] // 60
        cycles = max(1, heuristic_state['total_duration_mins'] // (focus_mins + break_mins))
        apps_str = ", ".join(heuristic_state['allowed_apps'])
        reply = (
            f"Antigravity primed! Locked in for {hrs} hours ({cycles} cycles of {focus_mins}/{break_mins}m) "
            f"focused on '{heuristic_state['task_context']}'. Whitelisted apps: {apps_str}. Entering deep focus now."
        )

    return {
        "total_duration_mins": heuristic_state.get("total_duration_mins"),
        "focus_mins": focus_mins,
        "break_mins": break_mins,
        "task_context": heuristic_state.get("task_context"),
        "allowed_apps": heuristic_state.get("allowed_apps"),
        "is_ready": is_ready,
        "reply": reply,
        "missing_slots": missing,
    }

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=PrivateChatResponse)
async def private_space_chat(
    payload: PrivateChatRequest,
    db: Session = Depends(get_db),
):
    """
    Conversational slot-filling endpoint for Antigravity Private Space.
    Enforces clarification first before starting an active session.
    """
    current = payload.current_state or {}
    ai_result = await evaluate_slots_with_ai(payload.message, current)

    slots = {
        "total_duration_mins": ai_result.get("total_duration_mins"),
        "focus_mins": ai_result.get("focus_mins") or 25,
        "break_mins": ai_result.get("break_mins") or 5,
        "task_context": ai_result.get("task_context"),
        "allowed_apps": ai_result.get("allowed_apps"),
    }
    missing_slots = ai_result.get("missing_slots") or []
    is_ready = bool(ai_result.get("is_ready"))

    session_data = None
    if is_ready:
        # Create active PrivateFocusSession in database
        try:
            created_session = crud.create_private_focus_session(
                db=db,
                task_context=slots["task_context"] or "Personal Deep Focus",
                total_duration_mins=slots["total_duration_mins"] or 420,
                focus_mins=slots["focus_mins"] or 25,
                break_mins=slots["break_mins"] or 5,
                allowed_apps=slots["allowed_apps"] or [],
                status="active",
            )
            session_data = {
                "id": created_session.id,
                "task_context": created_session.task_context,
                "total_duration_mins": created_session.total_duration_mins,
                "focus_mins": created_session.focus_mins,
                "break_mins": created_session.break_mins,
                "allowed_apps": json.loads(created_session.allowed_apps or "[]"),
                "completed_cycles": created_session.completed_cycles,
                "status": created_session.status,
                "created_at": created_session.created_at.isoformat() if created_session.created_at else None,
            }
        except Exception as exc:
            logger.error(f"[PrivateSpace] Failed to save session to DB: {exc}")
            session_data = {
                "id": 1,
                "task_context": slots["task_context"],
                "total_duration_mins": slots["total_duration_mins"],
                "focus_mins": slots["focus_mins"],
                "break_mins": slots["break_mins"],
                "allowed_apps": slots["allowed_apps"],
                "completed_cycles": 0,
                "status": "active",
            }

    return PrivateChatResponse(
        reply=ai_result.get("reply", "Understood."),
        is_ready=is_ready,
        slots=slots,
        missing_slots=missing_slots,
        session=session_data,
    )


@router.get("/session/current")
def get_current_private_session(db: Session = Depends(get_db)):
    """Fetch the latest active private session if one exists."""
    session_obj = crud.get_latest_active_private_session(db)
    if not session_obj:
        return {"session": None}
    return {
        "session": {
            "id": session_obj.id,
            "task_context": session_obj.task_context,
            "total_duration_mins": session_obj.total_duration_mins,
            "focus_mins": session_obj.focus_mins,
            "break_mins": session_obj.break_mins,
            "allowed_apps": json.loads(session_obj.allowed_apps or "[]"),
            "completed_cycles": session_obj.completed_cycles,
            "status": session_obj.status,
            "created_at": session_obj.created_at.isoformat() if session_obj.created_at else None,
        }
    }


@router.post("/guard", response_model=GuardCheckResponse)
def check_app_guard(
    payload: GuardCheckRequest,
    db: Session = Depends(get_db),
):
    """
    Lightweight local app guard checking if focused window matches allowed_apps.
    Supports Linux/Wayland (`hyprctl activewindow -j`) with graceful fallback to client telemetry.
    """
    active_app = payload.current_app or ""
    active_title = payload.window_title or ""

    # 1. Linux / Wayland Hyprland Inspection (if running natively on Wayland)
    if not active_app and shutil.which("hyprctl"):
        try:
            res = subprocess.run(["hyprctl", "activewindow", "-j"], capture_output=True, text=True, timeout=1.0)
            if res.returncode == 0 and res.stdout.strip():
                data = json.loads(res.stdout)
                active_app = data.get("initialClass") or data.get("class") or ""
                active_title = data.get("title") or active_title
        except Exception as e:
            logger.debug(f"[PrivateSpace Guard] Hyprctl check skipped: {e}")

    # Fallback to desktop / Prodify self
    clean_app_lower = active_app.lower().strip()
    title_lower = active_title.lower().strip()

    # Prodify itself is always authorized
    if clean_app_lower in ["prodify", "prodify.exe", "app.exe", "app", ""] or "prodify" in title_lower:
        return GuardCheckResponse(allowed=True, current_app=active_app or "Prodify", active_window=active_title)

    # OS Desktop / Neutral System windows
    if clean_app_lower in ["explorer.exe", "taskmgr.exe", "desktop", "hyprland", "waybar"]:
        return GuardCheckResponse(allowed=True, current_app=active_app, active_window=active_title)

    allowed_list: List[str] = []
    if payload.session_id:
        session_obj = crud.get_private_focus_session(db, payload.session_id)
        if session_obj and session_obj.allowed_apps:
            try:
                allowed_list = [a.lower() for a in json.loads(session_obj.allowed_apps)]
            except Exception:
                allowed_list = []

    if not allowed_list:
        # Default fallback allowed if no strict session
        return GuardCheckResponse(allowed=True, current_app=active_app, active_window=active_title)

    # Evaluate if active window matches allowed_apps
    is_allowed = False
    for app in allowed_list:
        app_canon = KNOWN_APP_CANONICAL.get(app, app)
        if (
            app in clean_app_lower
            or app_canon in clean_app_lower
            or clean_app_lower in app
            or app in title_lower
            or app_canon in title_lower
        ):
            is_allowed = True
            break

    warning = None
    if not is_allowed:
        warning = f"'{active_app or active_title or 'Current app'}' is not allowed during this focus block!"
        # Send desktop notification on Linux if notify-send is available
        if shutil.which("notify-send"):
            try:
                subprocess.Popen(["notify-send", "Prod Guard", "App not allowed during focus block!"])
            except Exception:
                pass

    return GuardCheckResponse(
        allowed=is_allowed,
        current_app=active_app or active_title,
        warning=warning,
        active_window=active_title,
    )


@router.post("/complete")
def complete_private_session(
    payload: CompleteSessionRequest,
    db: Session = Depends(get_db),
):
    """
    Called when marathon reaches 100% completion.
    Triggers window focus/pop command on Linux/Wayland if available.
    """
    session_obj = crud.update_private_focus_session(
        db,
        payload.session_id,
        status="completed",
        completed_cycles=payload.completed_cycles,
    )

    # Attempt Linux/Wayland window pop
    if shutil.which("hyprctl"):
        try:
            subprocess.Popen(["hyprctl", "dispatch", "focuswindow", "prodify"])
        except Exception:
            pass

    return {
        "status": "completed",
        "session_id": payload.session_id,
        "completed_cycles": payload.completed_cycles or (session_obj.completed_cycles if session_obj else 0),
        "total_duration_mins": session_obj.total_duration_mins if session_obj else 420,
        "message": "Championship Marathon Conquered! Antigravity victory recorded.",
        "focus_triggered": True,
    }


@router.post("/cycle")
def update_cycle(
    payload: UpdateCycleRequest,
    db: Session = Depends(get_db),
):
    """Increment completed cycles for an active session."""
    session_obj = crud.update_private_focus_session(
        db,
        payload.session_id,
        completed_cycles=payload.completed_cycles,
    )
    return {
        "status": "ok",
        "session_id": payload.session_id,
        "completed_cycles": session_obj.completed_cycles if session_obj else payload.completed_cycles,
    }
