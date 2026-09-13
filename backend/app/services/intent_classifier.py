import os
import logging
import time
import hashlib
import threading
from typing import Optional
from openai import AsyncOpenAI

logger = logging.getLogger("prodify_telemetry")

client = AsyncOpenAI(
    api_key=os.getenv("GROQ_API_KEY", "missing_key"),
    base_url="https://api.groq.com/openai/v1",
)

# Focus classification keywords
FOCUS_KEYWORDS = [
    "odin project",
    "the odin project",
    "github",
    "stackoverflow",
    "documentation",
    "docs",
    "mdn",
    "w3schools",
    "tutorial",
    "reference",
    "api",
    "specification",
    "leetcode",
    "codewars",
    "hackerrank",
    "medium",
    "dev.to",
    "real python",
    "digitalocean",
    "geeksforgeeks",
]

# OS-level transient windows that should never be flagged as distracted
OS_WHITELIST = [
    "windows explorer",
    "task switching",
    "snippingtool",
    "snipping tool",
    "searchhost",
    "task switching",
    "windows shell",
    "dwm",
    "window switcher",
]

# Distraction keywords — when a browser tab title contains these, the user is distracted
DISTRACTION_KEYWORDS = [
    "youtube",
    "instagram",
    "facebook",
    "twitter",
    "x.com",
    "reddit",
    "tiktok",
    "snapchat",
    "discord",
    "twitch",
    "netflix",
    "spotify",
    "whatsapp",
    "telegram",
    "pinterest",
    "linkedin",
    "tumblr",
    "flickr",
    "9gag",
    "imgur",
    "buzzfeed",
    "viral",
    "memes",
    "gaming",
    "play",
    "game",
    "sports",
    "news",
    "entertainment",
    "shopping",
    "amazon",
    "flipkart",
    "ebay",
    "olx",
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


async def evaluate_semantics(app_name: str, window_title: str, intent: str) -> Optional[tuple[bool, str]]:
    """
    AI-powered semantic evaluation via Groq (Llama 3.3 70B).
    """
    prompt = (
        f"You are the Prodify Intent Engine. Your job is to scientifically evaluate user focus through deep semantic alignment, completely disregarding application heuristics.\n\n"
        f"USER SESSION INTENT / GOAL:\n'{intent}'\n\n"
        f"ACTIVE APPLICATION:\n'{app_name}'\n\n"
        f"ACTIVE WINDOW TITLE / CONTENT:\n'{window_title}'\n\n"
        f"SEMANTIC ALIGNMENT PRINCIPLE:\n"
        f"1. Content is King: The host application (Browser, IDE, YouTube) is irrelevant. You must analyze the specific content (Window Title, Active Document, Video Name).\n"
        f"2. Goal Synthesis: Evaluate if the active content conceptually aids, researches, or executes the user's stated session intent. (e.g., A user learning web development watching a programming tutorial on a video site is highly focused).\n"
        f"3. Nuanced Reasoning: Output your classification strictly in the required `TRUE|<reason>` or `FALSE|<reason>` format. The `<reason>` must sound like a sharp, observant mentor explaining exactly why the content aligns or misaligns with their goal."
    )

    try:
        completion = await client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=100,
            timeout=10.0,
        )
        answer = completion.choices[0].message.content.strip()
        logger.info(f"[SEMANTIC] Groq verdict: '{answer}' | app='{app_name}' title='{window_title[:60]}'")

        verdict_str = answer.upper()
        reason = ""

        for sep in ["|", "-", ":"]:
            if sep in answer:
                parts = [p.strip() for p in answer.split(sep, 1)]
                verdict_str = parts[0].upper()
                reason = parts[1] if len(parts) > 1 else ""
                break

        if not reason:
            if answer.upper().startswith("TRUE"):
                verdict_str = "TRUE"
                reason = answer[4:].strip(". -|:")
            elif answer.upper().startswith("FALSE"):
                verdict_str = "FALSE"
                reason = answer[5:].strip(". -|:")

        is_focused = "TRUE" in verdict_str
        if not reason:
            if is_focused:
                reason = f"{app_name} ({window_title[:45]}) aligns with your session intent"
            else:
                reason = f"Switching to {app_name} ({window_title[:45]}) does not align with your session intent: '{intent}'"

        return is_focused, reason

    except Exception as exc:
        logger.warning(
            f"[SEMANTIC] Groq call failed (defaulting to distracted): {exc}"
        )
        return False, f"Switching to {app_name} ({window_title[:45]}) does not match your session intent"


def classify_window(window_title: str, app_name: str) -> tuple[str, str]:
    """
    Classify a window as 'focused' or 'distracted'.
    Returns (status, reason)
    """
    print(f"🔍 [CLASSIFY] ENTER: app_name='{app_name}' | window_title='{window_title[:80]}'")

    if not app_name.strip() and not window_title.strip():
        print(f"🔍 [CLASSIFY] RESULT: focused (empty data guard)")
        return "focused", "No window data yet (startup guard)"

    combined = f"{app_name} {window_title}".lower()
    for safe_indicator in ("prodify", "antigravity", "electron", "5173", "vs code", "vscode"):
        if safe_indicator in combined:
            print(f"🔍 [CLASSIFY] RESULT: focused (self-app/dev tool: {safe_indicator})")
            return "focused", f"Self-app / active developer tool detected ({safe_indicator})"

    for os_keyword in OS_WHITELIST:
        if _fuzzy_contains(os_keyword, app_name) or _fuzzy_contains(os_keyword, window_title):
            print(f"🔍 [CLASSIFY] RESULT: focused (OS whitelist: {os_keyword})")
            return "focused", f"OS transient window ignored ({os_keyword})"

    if app_name.lower() == "code":
        print(f"🔍 [CLASSIFY] RESULT: focused (code app)")
        return "focused", "VS Code detected (code app)"

    ide_signals = ["vs code", "visual studio", "vscode"]
    for signal in ide_signals:
        if _fuzzy_contains(signal, app_name) or _fuzzy_contains(signal, window_title):
            print(f"🔍 [CLASSIFY] RESULT: focused (IDE fuzzy: {signal})")
            return "focused", f"IDE detected (fuzzy match: '{signal}')"

    browser_keywords = ["brave", "chrome", "chromium", "firefox", "msedge", "edge", "opera"]
    is_browser = any(_fuzzy_contains(b, app_name) for b in browser_keywords)

    if is_browser:
        title_lower = window_title.lower()
        for dist_keyword in DISTRACTION_KEYWORDS:
            if dist_keyword in title_lower:
                print(f"🔍 [CLASSIFY] RESULT: distracted (browser distraction: {dist_keyword})")
                return "distracted", f"Distracting content detected: '{dist_keyword}' ({window_title[:45]})"

        for keyword in FOCUS_KEYWORDS:
            if keyword in title_lower:
                print(f"🔍 [CLASSIFY] RESULT: focused (browser focus: {keyword})")
                return "focused", f"Productive browsing: '{keyword}' found in title"

        print(f"🔍 [CLASSIFY] RESULT: distracted (browser unrecognized site)")
        return "distracted", f"Browser tab ({window_title[:45]}) contains non-productive content"

    print(f"🔍 [CLASSIFY] RESULT: distracted (default fallback)")
    return "distracted", f"Switching to {app_name} ({window_title[:45]}) does not align with your session intent"


async def classify_with_intent(
    window_title: str,
    app_name: str,
    intent: str,
) -> tuple[str, str]:
    if not intent.strip():
        print(f"🔍 [INTENT] No intent set → using baseline classification for '{window_title[:60]}'")
        return classify_window(window_title, app_name)

    combined = f"{app_name} {window_title}".lower()
    for safe_indicator in ("prodify", "antigravity", "electron", "5173"):
        if safe_indicator in combined:
            return "focused", f"Active developer/self-app window ({safe_indicator})"

    for os_keyword in OS_WHITELIST:
        if _fuzzy_contains(os_keyword, app_name) or _fuzzy_contains(os_keyword, window_title):
            return "focused", f"OS transient window ({os_keyword})"

    cached = _semantic_cache.get(app_name, window_title, intent)
    if cached is not None:
        is_focused, cache_reason = cached
        if is_focused:
            print(f"🔍 [INTENT] Cache HIT → focused (title='{window_title[:60]}')")
            return "focused", cache_reason
        else:
            print(f"🔍 [INTENT] Cache HIT → distracted (title='{window_title[:60]}')")
            return "distracted", cache_reason

    _semantic_cache.set(app_name, window_title, intent, None)
    print(f"🔍 [INTENT] Cache MISS → evaluating with Semantic Alignment Engine for title='{window_title[:60]}'")

    result = await evaluate_semantics(app_name, window_title, intent)
    if result is not None:
        is_focused, ai_reason = result
        _semantic_cache.set(app_name, window_title, intent, result)
        if is_focused:
            return "focused", ai_reason
        else:
            return "distracted", ai_reason

    return "focused", "AI evaluation pending (temporary focused)"
