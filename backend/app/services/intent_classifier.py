import os
import logging
import time
import hashlib
import threading
import asyncio
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from openai import AsyncOpenAI

# Ensure environment variables are loaded from backend/.env
load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger("prodify_telemetry")

client = AsyncOpenAI(
    api_key=os.getenv("GROQ_API_KEY", "missing_key"),
    base_url="https://api.groq.com/openai/v1",
)


# ---------------------------------------------------------------------------
# Semantic Cache — AI-powered cache for window classification results.
# ---------------------------------------------------------------------------
_PENDING = (True, "__PENDING__")  # Sentinel for in-flight evaluations


class SemanticCache:
    _MAX_SIZE = 512
    _TTL_SECONDS = 300

    def __init__(self):
        self._lock = threading.Lock()
        self._data: dict[str, tuple[Optional[tuple[bool, str]], float]] = {}

    def _make_key(self, app_name: str, window_title: str, intent: str) -> str:
        raw_key = f"{intent.strip().lower()}:{app_name.strip().lower()}:{window_title.strip().lower()}"
        return hashlib.sha256(raw_key.encode()).hexdigest()

    def get(self, app_name: str, window_title: str, intent: str) -> Optional[tuple[bool, str]]:
        key = self._make_key(app_name, window_title, intent)
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            result, timestamp = entry
            if time.time() - timestamp > self._TTL_SECONDS:
                del self._data[key]
                return None
            # Return _PENDING sentinel for in-flight evaluations so caller can
            # distinguish "locked / evaluation in progress" from "no entry".
            if result is None:
                return _PENDING
            return result

    def set(self, app_name: str, window_title: str, intent: str, result: Optional[tuple[bool, str]]):
        key = self._make_key(app_name, window_title, intent)
        with self._lock:
            if len(self._data) >= self._MAX_SIZE:
                oldest_key = min(self._data, key=lambda k: self._data[k][1])
                del self._data[oldest_key]
            self._data[key] = (result, time.time())

    def invalidate(self, app_name: str, window_title: str, intent: str):
        key = self._make_key(app_name, window_title, intent)
        with self._lock:
            self._data.pop(key, None)
            
    def clear(self):
        with self._lock:
            self._data.clear()


# Cache & State Machine singletons (start clean on module reload)
_semantic_cache = SemanticCache()
_intent_cache = _semantic_cache
_workspace_states: dict[int, dict] = {}
_workspace_focus_state = _workspace_states


def clear_semantic_cache():
    """Alias for clear_intent_cache()."""
    clear_intent_cache()


def clear_intent_cache(workspace_id: Optional[int] = None):
    """
    Clears the semantic evaluation cache and resets the workspace focus state machine.
    If workspace_id is provided, resets focus state for that workspace.
    If workspace_id is None, clears all workspace states.
    Always flushes cached LLM verdicts so stale classifications never persist across intent changes.
    """
    _semantic_cache.clear()
    if workspace_id is not None:
        reset_workspace_focus_state(workspace_id)
    else:
        _workspace_states.clear()
    logger.info(f"[CACHE] Intent cache and focus states cleared (workspace_id={workspace_id}).")


_last_eval_time = 0.0
_last_eval_target = ""
_eval_lock = asyncio.Lock()

async def evaluate_semantics(app_name: str, window_title: str, intent: str) -> Optional[tuple[bool, str, str]]:
    """
    AI-powered semantic evaluation via Groq (Qwen 3.8 27B).
    """
    global _last_eval_time, _last_eval_target
    current_target_key = f"{app_name.lower().strip()}:{window_title.lower().strip()}"
    
    async with _eval_lock:
        now = time.time()
        time_since_last = now - _last_eval_time
        
        # Bypass throttle if it's a completely new window target
        if time_since_last < 2.0 and _last_eval_target == current_target_key:
            wait_time = 2.0 - time_since_last
            logger.info(f"[SEMANTIC] Throttling evaluation (waiting {wait_time:.1f}s) for identical title='{window_title[:60]}'")
            await asyncio.sleep(wait_time)
        
        _last_eval_time = time.time()
        _last_eval_target = current_target_key

    system_prompt = (
        "You are a strict, objective focus alignment evaluator enforcing a Strict Intent & Tool Whitelist Contract.\n"
        "Your sole responsibility is to evaluate whether the user's active application and window title strictly match their declared focus goal and permitted tools.\n\n"
        "### STRICT INTENT & TOOL WHITELIST CONTRACT:\n\n"
        "1. RULE 1 — EXPLICIT TOOL WHITELIST ENFORCEMENT:\n"
        "   - If the user's stated goal specifies which tools/apps they will use (e.g., 'use google docs and ai', 'reading pdf', 'research on browser'), ONLY those tools (e.g. Google Docs, AI assistants like Claude/ChatGPT/Gemini, PDF reader) are aligned (VERDICT: TRUE).\n"
        "   - If the user opens an application NOT mentioned in their intent—even if it looks 'productive' like Visual Studio Code (Code.exe), Antigravity.exe, any code editor, terminal, or localhost web dev server—you MUST return VERDICT: FALSE.\n"
        "   - Do NOT assume coding or IDEs are allowed unless the user's goal explicitly mentions coding, programming, software development, or VS Code.\n\n"
        "2. RULE 2 — ZERO ACRONYM / TOPIC HALLUCINATION:\n"
        "   - Never invent or imagine connections between different project names or acronyms.\n"
        "   - If the user's goal is 'CIS' and the window title says 'CEP' (e.g. 'localhost:4173 - CEP - Visual Studio Code'), 'CEP' is a completely different project. Do NOT claim 'CEP' is a 'CIS project'.\n"
        "   - Return VERDICT: FALSE when the active window refers to a different project or acronym.\n\n"
        "3. RULE 3 — BROWSER TAB SPECIFICITY:\n"
        "   - Inside a web browser (brave.exe, chrome.exe, msedge.exe, firefox.exe), evaluate the specific tab/page title against the topic and allowed tools:\n"
        "     * 'CIS samples from instructor - Claude' -> VERDICT: TRUE (Matches AI + CIS topic).\n"
        "     * 'Untitled document - Google Docs' -> VERDICT: TRUE (Matches Google Docs tool).\n"
        "     * 'fc barcelona vs paris saint-germain' -> VERDICT: FALSE (Unrelated sports search).\n"
        "   - Neutral blank/new tabs ('New Tab') receive temporary navigation grace (VERDICT: TRUE).\n"
        "   - Any specific web search query, video, article, or site that does NOT directly match the declared topic or allowed tools must return VERDICT: FALSE.\n\n"
        "4. ZERO SPECULATIVE RATIONALIZATION:\n"
        "   - Base your decision strictly on the literal text of the declared goal, application name, and window title.\n"
        "   - Never invent hypothetical excuses or secondary connections.\n\n"
        "### OUTPUT FORMAT:\n"
        "Respond with exactly one line in this format:\n"
        "VERDICT: [TRUE|FALSE] | SUMMARY: [Short 3-6 word summary] | REASON: [One clear sentence explaining why it is aligned or why it is a distraction]\n\n"
        "### EXAMPLES:\n"
        "- Goal: \"CIS learning and would use google docs and ai\"\n"
        "  App: \"Code.exe\", Title: \"localhost:4173 - CEP - Visual Studio Code\"\n"
        "  -> VERDICT: FALSE | SUMMARY: Unrelated project in VS Code | REASON: You are in Visual Studio Code working on project 'CEP', which is outside your stated goal of learning CIS using Google Docs and AI.\n"
        "- Goal: \"CIS learning and would use google docs and ai\"\n"
        "  App: \"brave.exe\", Title: \"CIS samples from instructor - Claude - Brave\"\n"
        "  -> VERDICT: TRUE | SUMMARY: Claude AI for CIS | REASON: Using Claude AI to study CIS aligns with your declared goal.\n"
        "- Goal: \"CIS learning and would use google docs and ai\"\n"
        "  App: \"brave.exe\", Title: \"fc barcelona vs paris saint-germain - Brave Search - Brave\"\n"
        "  -> VERDICT: FALSE | SUMMARY: Sports search | REASON: Searching for soccer matches is unrelated to your goal of learning CIS."
    )

    user_prompt = (
        f"USER'S DECLARED GOAL (ACTIVE WORKSPACE):\n"
        f"\"{intent}\"\n\n"
        f"ACTIVE SCREEN CONTEXT:\n"
        f"Application Name: \"{app_name}\"\n"
        f"Active Window Title: \"{window_title}\""
    )

    try:
        completion = await client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            max_tokens=150,
            timeout=10.0,
        )
        answer = completion.choices[0].message.content.strip()
        logger.info(f"[SEMANTIC] Groq verdict: '{answer}' | app='{app_name}' title='{window_title[:60]}'")

        verdict_str = answer.upper()
        reason = ""
        summary = ""

        if "|" in answer:
            parts = [p.strip() for p in answer.split("|")]
            verdict_str = parts[0].upper().replace("VERDICT:", "").strip()
            for part in parts[1:]:
                if part.upper().startswith("SUMMARY:"):
                    summary = part[8:].strip()
                elif part.upper().startswith("REASON:"):
                    reason = part[7:].strip()
            if not reason and len(parts) > 1 and not summary:
                reason = parts[-1].replace("REASON:", "").strip()
        elif "-" in answer:
            parts = [p.strip() for p in answer.split("-", 1)]
            verdict_str = parts[0].upper().replace("VERDICT:", "").strip()
            reason = parts[1].replace("REASON:", "").strip() if len(parts) > 1 else ""

        is_focused = "TRUE" in verdict_str
        
        if not reason:
            if is_focused:
                reason = f"Window '{window_title[:45]}' appears to align with your goal."
            else:
                reason = f"Window '{window_title[:45]}' is clearly unrelated to your goal: '{intent}'"

        if not summary:
            summary = reason[:50] + "..." if len(reason) > 50 else reason

        return is_focused, reason, summary

    except Exception as exc:
        logger.warning(f"[SEMANTIC] Groq call failed (defaulting to focused): {exc}")
        # Fail open: if Groq fails, default to focused (don't falsely pause)
        return True, "Focus tracking temporarily unavailable (assuming focused)", "System Error"


def update_focus_state(
    workspace_id: int,
    current_goal: str,
    app_name: str,
    window_title: str,
    is_focused: bool,
    reason: str,
    is_cache_hit: bool = False,
) -> tuple[str, str]:
    """
    Deterministically manages workspace state machine transitions.
    Prevents stale reason leakage by binding reasons strictly to the active target
    and clearing history whenever the user returns to an aligned state.
    """
    if not workspace_id:
        return ("focused" if is_focused else "distracted"), reason

    state = _workspace_states.setdefault(workspace_id, {
        "status": "ALIGNED",
        "pending_count": 0,
        "recovery_count": 0,
        "last_target": "",
        "last_goal": current_goal,
        "active_distraction_target": "",
        "active_distraction_reason": ""
    })

    # Goal changed: complete wipe
    if state.get("last_goal") != current_goal:
        state["status"] = "ALIGNED"
        state["pending_count"] = 0
        state["recovery_count"] = 0
        state["last_target"] = ""
        state["last_goal"] = current_goal
        state["active_distraction_target"] = ""
        state["active_distraction_reason"] = ""
        clear_intent_cache(workspace_id)
        logger.info(f"[STATE] Goal updated for workspace {workspace_id}. State reset and cache cleared.")

    app_lower = app_name.lower().strip()
    title_lower = window_title.lower().strip()
    current_target = f"{app_lower}:{title_lower[:40]}"

    # Identify transient OS utility flickers (only known OS shell processes)
    _OS_SHELLS = {"explorer.exe", "shellexperiencehost.exe"}
    
    is_transient = (
        (app_lower in _OS_SHELLS and (
            "task switch" in title_lower 
            or "task view" in title_lower 
            or "snap assist" in title_lower
            or title_lower in ["", "running applications"]
        ))
        or app_lower in ["snippingtool.exe", "screenclippinghost.exe"]
    )

    if is_focused:
        # If transient utility flicker happens while penalized, keep state but do not overwrite reason
        if is_transient and state["status"] in ["PENDING", "DISTRACTED"]:
            active_reason = state.get("active_distraction_reason") or reason
            return ("distracted" if state["status"] == "DISTRACTED" else "focused"), active_reason

        # Immediate clean unlatch / reset whenever the user focuses an aligned work window
        state["status"] = "ALIGNED"
        state["pending_count"] = 0
        state["recovery_count"] = 0
        state["last_target"] = current_target
        state["active_distraction_target"] = ""
        state["active_distraction_reason"] = ""
        return "focused", reason

    else:
        # Off-topic content (VERDICT: FALSE)
        if is_transient:
            active_reason = state.get("active_distraction_reason") or reason
            return ("distracted" if state["status"] == "DISTRACTED" else "focused"), active_reason

        state["active_distraction_target"] = current_target
        state["active_distraction_reason"] = reason

        # Instant Distraction Trigger: transition immediately to DISTRACTED (no PENDING / Strike 1 delay)
        state["status"] = "DISTRACTED"
        state["pending_count"] = 2
        state["last_target"] = current_target
        logger.info(f"[STATE] -> DISTRACTED (Instant Distraction Trigger) on '{current_target}'")
        return "distracted", state["active_distraction_reason"]

    return "focused", reason


def reset_workspace_focus_state(workspace_id: int):
    """Clean unlatch: resets workspace state machine back to ALIGNED immediately."""
    if workspace_id in _workspace_states:
        _workspace_states[workspace_id] = {
            "status": "ALIGNED",
            "pending_count": 0,
            "recovery_count": 0,
            "last_target": "",
            "last_goal": _workspace_states[workspace_id].get("last_goal", ""),
            "active_distraction_target": "",
            "active_distraction_reason": ""
        }
        logger.info(f"[STATE] Workspace {workspace_id} focus state unlatched/reset to ALIGNED.")


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


async def classify_with_intent(
    window_title: str,
    app_name: str,
    intent: str,
    workspace_id: Optional[int] = None,
) -> tuple[str, str, str]:
    if not intent.strip():
        logger.info(f"[INTENT] No intent set - defaulting to general productivity for '{window_title[:60]}'")
        intent = "General productivity work"

    # 1. Host Self-Awareness (Strict Process Name Check)
    app_lower = app_name.lower().strip()
    if app_lower in ["prodify.exe", "prodify", "app.exe"]:
        return "focused", "Prodify session controller is intrinsically aligned", "Prodify app"

    # 2. Whitelist OS System Utilities (Neutral system transitions)
    if app_lower in OS_SYSTEM_UTILITIES:
        state = _workspace_states.get(workspace_id or 0)
        if state and state.get("status") == "DISTRACTED":
            # Keep distracted but never overwrite active_distraction_reason or trigger new strikes
            return "distracted", state.get("active_distraction_reason") or "Session paused", "System Utility"
        return "focused", "System utility transition", "System Utility"

    is_focused = True
    reason = ""
    summary = ""
    is_cache_hit = False

    # 3. Semantic Cache
    cached = _semantic_cache.get(app_name, window_title, intent)
    if cached is _PENDING:
        logger.info(f"[INTENT] Cache PENDING - skipping duplicate eval for title='{window_title[:60]}'")
        return "focused", "Evaluating…", "Evaluating"
    elif cached is not None:
        is_focused, reason, summary = cached
        is_cache_hit = True
        logger.info(f"[INTENT] Cache HIT - {'focused' if is_focused else 'distracted'} (title='{window_title[:60]}')")
    else:
        _semantic_cache.set(app_name, window_title, intent, None)
        logger.info(f"[INTENT] Cache MISS - evaluating with Semantic Alignment Engine for title='{window_title[:60]}'")
        result = await evaluate_semantics(app_name, window_title, intent)
        if result is not None:
            is_focused, reason, summary = result
            _semantic_cache.set(app_name, window_title, intent, result)
        else:
            is_focused, reason, summary = True, "Evaluating…", "Evaluating"

    status, reason = update_focus_state(
        workspace_id=workspace_id or 0,
        current_goal=intent,
        app_name=app_name,
        window_title=window_title,
        is_focused=is_focused,
        reason=reason,
        is_cache_hit=is_cache_hit,
    )
    return status, reason, summary
