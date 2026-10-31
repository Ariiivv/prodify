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
from app.services.activity_parser import parse_activity

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
        self._data: dict[str, tuple[Optional[tuple[bool, str, str]], float]] = {}

    def _make_key(self, app_name: str, window_title: str, intent: str) -> str:
        raw_key = f"{intent.strip().lower()}:{app_name.strip().lower()}:{window_title.strip().lower()}"
        return hashlib.sha256(raw_key.encode()).hexdigest()

    def get(self, app_name: str, window_title: str, intent: str) -> Optional[tuple[bool, str, str]]:
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

    def set(self, app_name: str, window_title: str, intent: str, result: Optional[tuple[bool, str, str]]):
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
_session_overrides: dict[int, set[str]] = {}


def allow_window_for_session(workspace_id: int, app_name: str, window_title: str):
    clean_app, platform, content_title = parse_activity(window_title, app_name)
    app_key = f"{app_name.lower().strip()}:{window_title.lower().strip()[:50]}"
    content_key = (content_title or "").lower().strip()[:50]

    overrides = _session_overrides.setdefault(workspace_id, set())
    overrides.add(app_key)
    if content_key:
        overrides.add(content_key)

    current_goal = _workspace_states.get(workspace_id, {}).get("last_goal", "")
    _semantic_cache.set(app_name, window_title, current_goal, (True, "Marked as relevant by user for this session", "User Whitelisted"))
    if current_goal != "":
        _semantic_cache.set(app_name, window_title, "", (True, "Marked as relevant by user for this session", "User Whitelisted"))

    reset_workspace_focus_state(workspace_id)
    logger.info(f"[SESSION OVERRIDE] Whitelisted window '{window_title[:40]}' on '{app_name}' for workspace {workspace_id}")


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
        _session_overrides.pop(workspace_id, None)
    else:
        _workspace_states.clear()
        _session_overrides.clear()
    logger.info(f"[CACHE] Intent cache and focus states cleared (workspace_id={workspace_id}).")


# ---------------------------------------------------------------------------
# Dynamic Domain Concept Clusters for Semantic Alignment
# Covers modern creative, technical, research, academic, and business workflows
# without hardcoding any specific executable names or tool whitelists.
# ---------------------------------------------------------------------------
_DOMAIN_CONCEPT_CLUSTERS = [
    # Visual Art, Illustration & 3D Design
    {"art", "design", "drawing", "draw", "painting", "paint", "sketch", "illustration", "illustrate", "render", "rendering", "animation", "animate", "3d", "model", "modeling", "sculpt", "sculpting", "anatomy", "pose", "lighting", "color", "texture", "palette", "concept", "character", "composition", "blender", "photoshop", "figma", "procreate", "maya", "zbrush"},
    # Music Production & Audio Engineering
    {"music", "audio", "sound", "synthesis", "synth", "mixing", "mastering", "track", "daw", "instrument", "beat", "production", "vocals", "arrangement", "sample", "plugin", "reverb", "equalizer", "compression", "tempo", "ableton", "logic", "fl studio", "reaper"},
    # Software Engineering & Dev
    {"software", "code", "coding", "dev", "development", "developer", "programming", "program", "backend", "frontend", "web", "app", "api", "database", "db", "bug", "debug", "terminal", "algorithm", "tutorial", "docs", "documentation", "repository", "commit", "server", "architecture", "github", "stack", "react", "python", "fastapi"},
    # Science, Mathematics & Medical Research
    {"science", "study", "studying", "math", "mathematics", "physics", "chemistry", "biology", "medical", "medicine", "research", "experiment", "lab", "paper", "data", "analysis", "statistics", "clinical", "thesis", "proof", "derivation", "journal", "pubmed"},
    # History, Social Sciences & Humanities
    {"history", "documentary", "historical", "empire", "war", "civilization", "archaeology", "ancient", "archive", "period", "century", "monarchy", "culture", "philosophy", "sociology", "anthropology", "geopolitics", "law", "statute"},
    # Writing, Journalism & Literature
    {"writing", "writer", "write", "draft", "article", "essay", "novel", "book", "blog", "copywriting", "manuscript", "literature", "chapter", "script", "screenplay", "prose", "poetry", "publishing"},
    # Marketing, Growth & Business Management
    {"marketing", "brand", "branding", "growth", "advertising", "ad", "ads", "campaign", "trends", "audience", "social", "media", "content", "creator", "influencer", "seo", "analytics", "funnel", "customer", "sales", "strategy", "pr"},
    # General Productivity, Planning & Administration
    {"productivity", "planning", "plan", "budget", "finance", "schedule", "calendar", "organize", "notes", "tasks", "roadmap", "sheet", "sheets", "doc", "docs", "workspace", "workflow", "management", "project", "presentation", "meeting", "deck"},
]

_STOPWORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with",
    "of", "by", "from", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "this", "that", "these", "those",
    "it", "its", "my", "your", "his", "her", "their", "our", "you", "we", "they",
    "i", "me", "us", "him", "them", "how", "what", "why", "when", "where", "which"
}


def _extract_semantic_tokens(text: str) -> set[str]:
    import string
    clean = text.lower().translate(str.maketrans("", "", string.punctuation))
    return {t for t in clean.split() if len(t) > 2 and t not in _STOPWORDS}


def evaluate_semantics_offline(
    app_name: str, window_title: str, intent: str
) -> tuple[bool, str, str, float]:
    """
    Pure Dynamic Semantic Intent Matching Engine (Offline):
    - Strictly avoids application/executable whitelists or tool blacklists.
    - Evaluates 100% on dynamic semantic similarity between stated goal and window title.
    - Context-aware flexibility: recognizes multi-app fluid workflows across all professional/creative/academic domains.
    - Never flags an application purely based on executable name (e.g. browser.exe, code.exe, vlc.exe).
    """
    clean_app, platform, content_title = parse_activity(window_title, app_name)
    intent_clean = (intent or "").strip().lower()
    if not intent_clean or intent_clean in ["general", "none", "work", "focus"]:
        intent_clean = "general productivity and professional focus"

    content_clean = (content_title or window_title or "").strip().lower()
    full_context = f"{clean_app} {platform} {content_clean} {window_title}".strip().lower()

    intent_tokens = _extract_semantic_tokens(intent_clean)
    context_tokens = _extract_semantic_tokens(full_context)

    # 1. True Recreational Diversion Detection (Semantic Content Only)
    # Only trigger if the actual content title/subject represents an explicit entertainment diversion
    # AND the user's declared goal does not cover that domain.
    recreational_diversions = {
        "gameplay", "walkthrough", "speedrun", "esports", "streamer",
        "roblox", "minecraft", "fortnite", "valorant", "gta 5", "gta v", "gta",
        "funny moments", "prank", "cringe compilation", "meme compilation",
        "celebrity gossip", "reaction video", "shorts feed", "reels feed"
    }

    matched_diversion = [t for t in recreational_diversions if t in content_clean or t in full_context]
    intent_allows_diversion = any(t in intent_clean for t in matched_diversion) or any(
        term in intent_clean for term in ["game", "gaming", "stream", "entertainment", "social media", "content creation", "video editing"]
    )

    if matched_diversion and not intent_allows_diversion:
        return (
            False,
            f"Content '{content_title[:45] or window_title[:45]}' represents an off-task entertainment diversion from your declared goal.",
            "Off-task Diversion",
            0.85,
        )

    # 2. General / Broad Intent Handling
    is_broad_intent = any(
        kw in intent_clean for kw in [
            "general productivity", "deep work", "focus", "study", "learning", "research", "project", "work"
        ]
    ) and len(intent_tokens) <= 4

    # 3. Dynamic Multi-Scale Semantic Similarity
    # A. Word-level TF-IDF n-grams (1-3 words)
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        word_vec = TfidfVectorizer(ngram_range=(1, 3), stop_words="english", sublinear_tf=True)
        word_tfidf = word_vec.fit_transform([intent_clean, full_context])
        word_sim = float(cosine_similarity(word_tfidf[0:1], word_tfidf[1:2])[0][0])
    except Exception:
        word_sim = 0.0

    # B. Character n-gram similarity (morphological roots, compounding, abbreviations)
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        char_vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        char_tfidf = char_vec.fit_transform([intent_clean, full_context])
        char_sim = float(cosine_similarity(char_tfidf[0:1], char_tfidf[1:2])[0][0])
    except Exception:
        char_sim = 0.0

    # C. Direct Token Overlap & Morphological Stems
    overlap = len(intent_tokens & context_tokens)
    stem_matches = sum(1 for it in intent_tokens if any(it in ct or ct in it for ct in context_tokens))

    # D. Domain Concept Cluster Alignment
    shared_domains = 0
    for cluster in _DOMAIN_CONCEPT_CLUSTERS:
        if bool(intent_tokens & cluster) and bool(context_tokens & cluster):
            shared_domains += 1

    domain_boost = 0.30 if shared_domains > 0 else 0.0
    composite_score = (0.35 * word_sim) + (0.25 * char_sim) + (0.20 * (1.0 if stem_matches > 0 else 0.0)) + (0.20 * domain_boost)

    # 4. Pure Semantic Decision:
    # High direct similarity, shared domain, or stem overlap -> ALIGNED
    if composite_score >= 0.12 or overlap >= 1 or stem_matches >= 1 or shared_domains >= 1:
        return (
            True,
            f"'{content_title[:45] or window_title[:45]}' dynamically aligns with your declared objective.",
            "Aligned Activity",
            round(max(composite_score, 0.75), 2),
        )

    # Broad intent with no diversion signals -> ALIGNED
    if is_broad_intent:
        return (
            True,
            f"Active tool/content logically supports your general focus session.",
            "Aligned Workflow",
            0.70,
        )

    # Divergent from stated specific goal
    return (
        False,
        f"Window '{content_title[:45] or window_title[:45]}' diverges from your declared goal: '{intent[:40]}'.",
        "Divergent Activity",
        round(1.0 - composite_score, 2),
    )


_last_eval_time = 0.0
_last_eval_target = ""
_eval_lock = asyncio.Lock()


async def evaluate_semantics(app_name: str, window_title: str, intent: str) -> Optional[tuple[bool, str, str]]:
    """
    Intelligent semantic workflow alignment engine with dynamic ecosystem inference.
    Uses LLM as the primary intelligence when available, with generalized smart offline fallback.
    """
    has_groq = bool(os.getenv("GROQ_API_KEY") and os.getenv("GROQ_API_KEY") != "missing_key")

    if not has_groq:
        offline_focused, offline_reason, offline_summary, _ = evaluate_semantics_offline(
            app_name=app_name, window_title=window_title, intent=intent
        )
        logger.info(f"[SEMANTIC] GROQ_API_KEY missing - using smart offline inference: focused={offline_focused}")
        return offline_focused, offline_reason, offline_summary

    global _last_eval_time, _last_eval_target
    current_target_key = f"{intent.lower().strip()}:{app_name.lower().strip()}:{window_title.lower().strip()}"
    
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

    clean_app, platform, content_title = parse_activity(window_title, app_name)

    system_prompt = """You are Prodify's pure semantic intent evaluation engine.
Your job is to determine whether the user's active window or browser tab dynamically aligns with their declared goal or workspace objective.

CORE PRINCIPLES:
1. STRICTLY NO APP NAME BIAS: Never approve or reject an application based on its executable name (e.g., chrome.exe, code.exe, vlc.exe, brave.exe, blender.exe, word.exe). A browser or video player is a universal canvas: an art student watching a figure drawing reference or tutorial on YouTube, a developer reading API docs or StackOverflow on Chrome, a researcher watching a historical documentary on VLC, or an audio engineer studying sound design tutorials are all 100% focused.
2. DYNAMIC CONTENT CONTEXT: Evaluate the contextual relevance of the window title and active content topic against the user's declared goal. Ask: "Does this specific content logically support, inform, inspire, or serve as tooling for the user's stated objective?"
3. FLUID MULTI-APP WORKFLOWS: Real-world knowledge work and creative workflows span multiple apps (code editors, terminals, web browsers, design tools, document readers, video tutorials, audio DAWs, notes). If the active activity is a logical part of that workflow, mark it as TRUE (Aligned).
4. CLEAR DISTRACTIONS ONLY: Only flag an activity as FALSE if the window content represents an unambiguous, off-task recreational diversion (e.g., video gaming, comedy pranks, binge entertainment streaming, online shopping, mindless social media feeds) that has no relevance to their declared objective.
5. DOMAIN-SPECIFIC LENIENCY: If the user's goal itself involves game development, social media marketing, video editing, or entertainment analysis, respect that context and do not flag related content as off-task.

OUTPUT FORMAT:
Respond with exactly one line in this format:
VERDICT: [TRUE|FALSE] | SUMMARY: [Short 3-5 word summary] | REASON: [One clear sentence explaining the contextual relevance or divergence]"""

    user_prompt = (
        f"USER'S DECLARED GOAL (ACTIVE WORKSPACE):\n"
        f"\"{intent}\"\n\n"
        f"ACTIVE SCREEN CONTEXT:\n"
        f"Application: \"{clean_app}\" ({app_name})\n"
        f"Platform / Ecosystem: \"{platform}\"\n"
        f"Active Content / Title: \"{content_title}\"\n"
        f"Raw Window Title: \"{window_title}\""
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
        logger.warning(f"[SEMANTIC] Groq call failed (falling back to smart offline engine): {exc}")
        offline_focused, offline_reason, offline_summary, _ = evaluate_semantics_offline(
            app_name=app_name, window_title=window_title, intent=intent
        )
        return offline_focused, offline_reason, offline_summary


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

        # If already distracted, keep distracted and update active reason
        if state["status"] == "DISTRACTED":
            state["active_distraction_target"] = current_target
            state["active_distraction_reason"] = reason
            state["last_target"] = current_target
            return "distracted", reason

        # Known cached distraction -> Instant trigger (skips grace debounce)
        if is_cache_hit:
            state["status"] = "DISTRACTED"
            state["pending_count"] = 2
            state["last_target"] = current_target
            state["active_distraction_target"] = current_target
            state["active_distraction_reason"] = reason
            logger.info(f"[STATE] -> DISTRACTED (Instant Cached Trigger) on '{current_target}'")
            return "distracted", reason

        # Fresh evaluation: Strike 1 grace period (1-poll debounce for navigation/browser switches)
        if state.get("pending_count", 0) == 0:
            state["status"] = "PENDING"
            state["pending_count"] = 1
            state["last_target"] = current_target
            state["active_distraction_target"] = current_target
            state["active_distraction_reason"] = reason
            logger.info(f"[STATE] -> PENDING (Strike 1 grace debounce) on '{current_target}'")
            return "focused", f"Notice: '{window_title[:40]}' may be off-task"
        else:
            state["status"] = "DISTRACTED"
            state["pending_count"] = 2
            state["last_target"] = current_target
            state["active_distraction_target"] = current_target
            state["active_distraction_reason"] = reason
            logger.info(f"[STATE] -> DISTRACTED (Strike 2 confirmed) on '{current_target}'")
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

    # 2.5. Per-Workspace Session Override Whitelist (User explicitly marked window as relevant)
    if workspace_id and workspace_id in _session_overrides:
        clean_app, platform, content_title = parse_activity(window_title, app_name)
        app_key = f"{app_name.lower().strip()}:{window_title.lower().strip()[:50]}"
        content_key = (content_title or "").lower().strip()[:50]
        window_key = window_title.lower().strip()[:50]
        overrides = _session_overrides[workspace_id]
        if app_key in overrides or (content_key and content_key in overrides) or window_key in overrides:
            logger.info(f"[INTENT] Whitelist match in workspace {workspace_id} for '{window_title[:50]}'")
            status, reason = update_focus_state(
                workspace_id=workspace_id,
                current_goal=intent,
                app_name=app_name,
                window_title=window_title,
                is_focused=True,
                reason="Marked as relevant for this session by user",
                is_cache_hit=True,
            )
            return status, reason, "User Whitelisted"

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
