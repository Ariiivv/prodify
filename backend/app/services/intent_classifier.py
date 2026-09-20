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

# OS-level transient windows that should never be flagged as distracted
OS_WHITELIST = [
    "windows explorer",
    "task switching",
    "task view",
    "snippingtool",
    "snipping tool",
    "searchhost",
    "startmenu",
    "windows default lock screen",
    "windows shell",
    "dwm",
    "window switcher",
]

# ---------------------------------------------------------------------------
# Normalization & fuzzy-matching helpers
# ---------------------------------------------------------------------------
def _normalize(text: str) -> str:
    """Lowercase and strip whitespace."""
    return text.lower().strip()


def _collapse_repeated(text: str) -> str:
    """Collapse consecutive duplicate characters, e.g. 'vvss' -> 'vs'."""
    if not text:
        return text
    chars = [text[0]]
    for ch in text[1:]:
        if ch != chars[-1]:
            chars.append(ch)
    return "".join(chars)


def _fuzzy_contains(keyword: str, text: str) -> bool:
    kw = _normalize(keyword)
    txt = _normalize(text)

    if kw in txt:
        return True

    kw_collapsed = _collapse_repeated(kw)
    txt_collapsed = _collapse_repeated(txt)
    if kw_collapsed in txt_collapsed:
        return True

    return False


# ---------------------------------------------------------------------------
# Semantic Cache — AI-powered cache for window classification results.
# ---------------------------------------------------------------------------
class SemanticCache:
    _MAX_SIZE = 512
    _TTL_SECONDS = 300

    def __init__(self):
        self._lock = threading.Lock()
        self._data: dict[str, tuple[Optional[tuple[bool, str]], float]] = {}

    def _make_key(self, app_name: str, window_title: str, intent: str) -> str:
        raw = f"{app_name.lower().strip()}::{window_title.lower().strip()}::{intent.lower().strip()}"
        return hashlib.sha256(raw.encode()).hexdigest()

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


_semantic_cache = SemanticCache()


_last_eval_time = 0.0
_eval_lock = asyncio.Lock()

async def evaluate_semantics(app_name: str, window_title: str, intent: str) -> Optional[tuple[bool, str]]:
    """
    AI-powered semantic evaluation via Groq (Llama 3.3 70B).
    """
    global _last_eval_time
    async with _eval_lock:
        now = time.time()
        time_since_last = now - _last_eval_time
        if time_since_last < 3.0:
            wait_time = 3.0 - time_since_last
            logger.info(f"[SEMANTIC] Throttling evaluation (waiting {wait_time:.1f}s) for title='{window_title[:60]}'")
            await asyncio.sleep(wait_time)
        
        _last_eval_time = time.time()

    prompt = (
        f"You are the Prodify Intent Classifier. Evaluate if the active window represents a genuine distraction from the user's stated goal.\n\n"
        f"USER GOAL / INTENT: '{intent}'\n"
        f"WINDOW TITLE: '{window_title}'\n"
        f"APPLICATION NAME: '{app_name}'\n\n"
        f"RULES FOR CLASSIFICATION:\n"
        f"1. Judge genuine topical/semantic relevance to the user's intent. Do not just look for exact keyword matches. Use deep reasoning.\n"
        f"2. Platform doesn't matter, content does. Learning and work can happen anywhere (YouTube, Wikipedia, StackOverflow, IDEs, PDF readers, course platforms, etc.). A YouTube video about C programming is highly relevant to 'learning C'.\n"
        f"3. Only flag a mismatch if the window is CLEARLY and OBVIOUSLY unrelated to the intent (e.g., scrolling Instagram, playing a video game, watching an unrelated entertainment vlog).\n"
        f"4. If a window title is ambiguous, generic (like 'New Tab', 'Home', 'Google Chrome', 'Settings'), or you are uncertain, you MUST default to TRUE (focused). False positives (incorrectly pausing) are strictly worse than missing a real distraction.\n"
        f"5. Do NOT hardcode assumptions. Reason freshly about this specific window against this specific intent. There are no hardcoded app restrictions.\n\n"
        f"OUTPUT FORMAT:\n"
        f"You must respond EXACTLY in this format: `VERDICT | REASON`\n"
        f"Where VERDICT is either `TRUE` (focused/relevant/ambiguous) or `FALSE` (clearly distracted).\n"
        f"Where REASON is a sharp, 1-sentence explanation of why it aligns or misaligns. If ambiguous, explain that you are giving the benefit of the doubt."
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
            verdict_str = parts[0].upper()
            reason = parts[1] if len(parts) > 1 else ""
        elif "-" in answer:
            parts = [p.strip() for p in answer.split("-", 1)]
            verdict_str = parts[0].upper()
            reason = parts[1] if len(parts) > 1 else ""

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


def classify_window(window_title: str, app_name: str) -> tuple[str, str]:
    """
    Classify a window as 'focused' or 'distracted' (baseline when no intent is set).
    Returns (status, reason)
    """
    print(f"🔍 [CLASSIFY] ENTER: app_name='{app_name}' | window_title='{window_title[:80]}'")

    if not app_name.strip() and not window_title.strip():
        print(f"🔍 [CLASSIFY] RESULT: focused (empty data guard)")
        return "focused", "No window data yet (startup guard)"

    for os_keyword in OS_WHITELIST:
        if _fuzzy_contains(os_keyword, app_name) or _fuzzy_contains(os_keyword, window_title):
            print(f"🔍 [CLASSIFY] RESULT: focused (OS whitelist: {os_keyword})")
            return "focused", f"OS transient window ignored ({os_keyword})"

    print(f"🔍 [CLASSIFY] RESULT: focused (default fallback)")
    return "focused", "AI evaluation not yet provided (temporary focused)"


async def classify_with_intent(
    window_title: str,
    app_name: str,
    intent: str,
) -> tuple[str, str]:
    if not intent.strip():
        print(f"🔍 [INTENT] No intent set - using baseline classification for '{window_title[:60]}'")
        return classify_window(window_title, app_name)

    for os_keyword in OS_WHITELIST:
        if _fuzzy_contains(os_keyword, app_name) or _fuzzy_contains(os_keyword, window_title):
            return "focused", f"OS transient window ({os_keyword})"

    cached = _semantic_cache.get(app_name, window_title, intent)
    if cached is not None:
        is_focused, cache_reason = cached
        if is_focused:
            print(f"🔍 [INTENT] Cache HIT - focused (title='{window_title[:60]}')")
            return "focused", cache_reason
        else:
            print(f"🔍 [INTENT] Cache HIT - distracted (title='{window_title[:60]}')")
            return "distracted", cache_reason

    _semantic_cache.set(app_name, window_title, intent, None)
    print(f"🔍 [INTENT] Cache MISS - evaluating with Semantic Alignment Engine for title='{window_title[:60]}'")

    result = await evaluate_semantics(app_name, window_title, intent)
    if result is not None:
        is_focused, ai_reason = result
        _semantic_cache.set(app_name, window_title, intent, result)
        if is_focused:
            return "focused", ai_reason
        else:
            return "distracted", ai_reason

    return "focused", "AI evaluation pending (temporary focused)"
