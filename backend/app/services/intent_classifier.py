import os
import logging
import time
import hashlib
import threading
import asyncio
from typing import Optional
from openai import AsyncOpenAI

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


_semantic_cache = SemanticCache()
_workspace_states = {}

def clear_semantic_cache():
    _semantic_cache.clear()


_last_eval_time = 0.0
_last_eval_target = ""
_eval_lock = asyncio.Lock()

async def evaluate_semantics(app_name: str, window_title: str, intent: str) -> Optional[tuple[bool, str]]:
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

    prompt = (
        f"You are an intelligent, objective focus alignment evaluator.\n"
        f"Your sole responsibility is to evaluate what the user is actively doing on screen against their declared focus goal, determining whether they should stay focused or be interrupted.\n\n"
        f"USER'S DECLARED GOAL (ACTIVE WORKSPACE):\n"
        f"\"{intent}\"\n\n"
        f"ACTIVE SCREEN CONTEXT:\n"
        f"Application Name: \"{app_name}\"\n"
        f"Active Window Title: \"{window_title}\"\n\n"
        f"### EVALUATION PRINCIPLES:\n\n"
        f"1. Declared Goal as the Sole Reference:\n"
        f"   - Read the user's declared goal carefully: \"{intent}\".\n"
        f"   - Base your decision strictly on the domain, subject, or task specified by the user.\n"
        f"   - Do NOT assume, demand, or evaluate against outside frameworks, languages, or tools not specified in \"{intent}\".\n"
        f"   - Judge by semantic substance and meaning, NEVER by superficial keywords.\n\n"
        f"2. Content-Level Decision:\n"
        f"   - Does the substance of \"{window_title}\" directly teach, reference, implement, or facilitate the domain of \"{intent}\"?\n"
        f"     * If YES -> Output VERDICT: TRUE.\n"
        f"     * If NO (e.g., entertainment, celebrity media, sports commentary, casual phone/tech reviews, gaming gameplay, memes, drama, or unrelated social feeds) -> Output VERDICT: FALSE.\n\n"
        f"3. Navigation Grace for Multipurpose Tools:\n"
        f"   - Multipurpose applications (browsers, search engines, file managers, desktop shells) can host both work and distractions.\n"
        f"   - If the user is on a browser homepage, blank/new tab, search bar, or directory root looking for resources -> Output VERDICT: TRUE (navigation grace).\n"
        f"   - Once a specific video, article, stream, or post is open and playing/reading, evaluate its SPECIFIC topic. If that content is off-topic entertainment -> Output VERDICT: FALSE.\n\n"
        f"4. Supporting Tools & Auxiliary Workflows:\n"
        f"   - Standard tools used to perform digital work (IDEs, code editors, terminal windows, official documentation, file directories) that support \"{intent}\" -> Output VERDICT: TRUE.\n\n"
        f"5. Zero Speculative Rationalization:\n"
        f"   - Base your evaluation strictly on the literal content of \"{window_title}\".\n"
        f"   - You are STRICTLY FORBIDDEN from inventing hypothetical excuses (e.g., \"watching this sports match or movie clip might inspire ideas\", \"they might build a tool for this game\").\n\n"
        f"### OUTPUT FORMAT:\n"
        f"Respond with exactly one line in this format:\n"
        f"VERDICT: [TRUE|FALSE] | REASON: [One clear sentence explaining whether the content directly serves the declared goal]"
    )

    try:
        completion = await client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=150,
            timeout=10.0,
        )
        answer = completion.choices[0].message.content.strip()
        logger.info(f"[SEMANTIC] Groq verdict: '{answer}' | app='{app_name}' title='{window_title[:60]}'")

        verdict_str = answer.upper()
        reason = ""

        if "|" in answer:
            parts = [p.strip() for p in answer.split("|", 1)]
            verdict_str = parts[0].upper().replace("VERDICT:", "").strip()
            reason = parts[1].replace("REASON:", "").strip() if len(parts) > 1 else ""
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

        return is_focused, reason

    except Exception as exc:
        logger.warning(f"[SEMANTIC] Groq call failed (defaulting to focused): {exc}")
        # Fail open: if Groq fails, default to focused (don't falsely pause)
        return True, "Focus tracking temporarily unavailable (assuming focused)"


def update_focus_state(
    workspace_id: int,
    current_goal: str,
    app_name: str,
    window_title: str,
    is_focused: bool,
    reason: str
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
        logger.info(f"[STATE] Goal updated for workspace {workspace_id}. State reset.")

    app_lower = app_name.lower().strip()
    title_lower = window_title.lower().strip()
    current_target = f"{app_lower}:{title_lower[:40]}"

    # Identify transient OS utility flickers (only known OS shell processes)
    _OS_SHELLS = {"explorer.exe", "shellexperiencehost.exe"}
    is_transient = (
        "task switch" in title_lower
        or "task switching" in title_lower
        or (app_lower in _OS_SHELLS and title_lower in ["", "running applications", "task switching"])
        or app_lower in ["snippingtool.exe", "screenclippinghost.exe"]
    )

    if is_focused:
        # If transient utility flicker happens while penalized, keep state but do not overwrite reason
        if is_transient and state["status"] in ["PENDING", "DISTRACTED"]:
            active_reason = state.get("active_distraction_reason") or reason
            return ("distracted" if state["status"] == "DISTRACTED" else "focused"), active_reason

        if state["status"] == "DISTRACTED":
            state["recovery_count"] = state.get("recovery_count", 0) + 1
            if state["recovery_count"] >= 2:
                state["status"] = "ALIGNED"
                state["pending_count"] = 0
                state["recovery_count"] = 0
                state["active_distraction_target"] = ""
                state["active_distraction_reason"] = ""
                return "focused", reason
            else:
                return "distracted", state["active_distraction_reason"]

        # ALIGNED or PENDING (or unhandled fallback): immediate reset
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

        # Any off-topic signal cancels a partial recovery
        if state["status"] == "DISTRACTED":
            state["recovery_count"] = 0

        # Always update the distraction reason to match the CURRENT unaligned target
        state["active_distraction_target"] = current_target
        state["active_distraction_reason"] = reason

        if state["status"] == "ALIGNED":
            state["status"] = "PENDING"
            state["pending_count"] = 1
            state["last_target"] = current_target
            logger.info(f"[STATE] ALIGNED -> PENDING (Strike 1) on '{current_target}'")
            return "focused", reason

        elif state["status"] == "PENDING":
            state["status"] = "DISTRACTED"
            state["pending_count"] = 2
            state["last_target"] = current_target
            logger.info(f"[STATE] PENDING -> DISTRACTED (Strike 2 LATCHED) on '{current_target}'")
            return "distracted", state["active_distraction_reason"]

        elif state["status"] == "DISTRACTED":
            state["last_target"] = current_target
            return "distracted", state["active_distraction_reason"]

    return "focused", reason


async def classify_with_intent(
    window_title: str,
    app_name: str,
    intent: str,
    workspace_id: Optional[int] = None,
) -> tuple[str, str]:
    if not intent.strip():
        logger.info(f"[INTENT] No intent set - defaulting to general productivity for '{window_title[:60]}'")
        intent = "General productivity work"

    # 1. Host Self-Awareness (Strict Process Name Check)
    app_lower = app_name.lower().strip()
    if app_lower in ["prodify.exe", "prodify", "app.exe"]:
        # Only align if the app itself is the host, protecting against folders named "prodify" in other apps
        return "focused", "Prodify session controller is intrinsically aligned"

    is_focused = True
    reason = ""

    # 2. Semantic Cache
    cached = _semantic_cache.get(app_name, window_title, intent)
    if cached is _PENDING:
        # Another tick already started an AI evaluation for this exact window.
        # Default to focused while waiting — don't fire a redundant Groq call.
        logger.info(f"[INTENT] Cache PENDING - skipping duplicate eval for title='{window_title[:60]}'")
        # Don't feed the state machine while an eval is in-flight for this window;
        # return current state without advancing strikes.
        return "focused", "Evaluating…"
    elif cached is not None:
        is_focused, reason = cached
        logger.info(f"[INTENT] Cache HIT - {'focused' if is_focused else 'distracted'} (title='{window_title[:60]}')")
    else:
        _semantic_cache.set(app_name, window_title, intent, None)
        logger.info(f"[INTENT] Cache MISS - evaluating with Semantic Alignment Engine for title='{window_title[:60]}'")
        result = await evaluate_semantics(app_name, window_title, intent)
        if result is not None:
            is_focused, reason = result
            _semantic_cache.set(app_name, window_title, intent, result)
        else:
            # evaluate_semantics returned None — should not happen, but fail open
            is_focused, reason = True, "Evaluating…"

    return update_focus_state(
        workspace_id=workspace_id or 0,
        current_goal=intent,
        app_name=app_name,
        window_title=window_title,
        is_focused=is_focused,
        reason=reason
    )
