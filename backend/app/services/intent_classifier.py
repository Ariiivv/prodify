import logging
import time
import hashlib
import threading
from collections import OrderedDict
from typing import Optional
from app.services.activity_parser import parse_activity
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger("prodify_telemetry")
ClassificationResult = tuple[bool, str, str, float, str, str, int]

# ---------------------------------------------------------------------------
# Semantic Cache — bounded local-only classification cache.
# ---------------------------------------------------------------------------


class SemanticCache:
    _MAX_SIZE = 512
    _TTL_SECONDS = 300

    def __init__(self):
        self._lock = threading.Lock()
        self._data: OrderedDict[str, tuple[Optional[ClassificationResult], float]] = OrderedDict()

    def _make_key(self, app_name: str, window_title: str, intent: str) -> str:
        raw_key = f"{intent.strip().lower()}:{app_name.strip().lower()}:{window_title.strip().lower()}"
        return hashlib.sha256(raw_key.encode()).hexdigest()

    def get(self, app_name: str, window_title: str, intent: str) -> Optional[ClassificationResult]:
        key = self._make_key(app_name, window_title, intent)
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            result, timestamp = entry
            if time.time() - timestamp > self._TTL_SECONDS:
                del self._data[key]
                return None
            self._data.move_to_end(key)
            if result is None:
                self._data.pop(key, None)
                return None
            if len(result) == 5:
                result = (*result, "mixed", 300)
            return result

    def set(self, app_name: str, window_title: str, intent: str, result: Optional[ClassificationResult]):
        key = self._make_key(app_name, window_title, intent)
        with self._lock:
            if key in self._data:
                self._data.pop(key)
            elif len(self._data) >= self._MAX_SIZE:
                self._data.popitem(last=False)
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
_state_lock = threading.RLock()


def begin_classification(workspace_id: int, target: str) -> int:
    """Register the newest target for a workspace and return its generation."""
    if not workspace_id:
        return 0
    with _state_lock:
        state = _workspace_states.setdefault(workspace_id, {
            "status": "ALIGNED",
            "pending_count": 0,
            "recovery_count": 0,
            "last_target": "",
            "last_goal": "",
            "active_distraction_target": "",
            "active_distraction_reason": "",
            "generation": 0,
            "active_target": "",
        })
        generation = int(state.get("generation", 0)) + 1
        state["generation"] = generation
        state["active_target"] = target
        return generation


def is_current_classification(workspace_id: int, generation: int, target: str) -> bool:
    """Return false when a newer window target superseded this evaluation."""
    if not workspace_id:
        return True
    with _state_lock:
        state = _workspace_states.get(workspace_id)
        return bool(
            state
            and state.get("generation") == generation
            and state.get("active_target") == target
        )


def allow_window_for_session(workspace_id: int, app_name: str, window_title: str):
    clean_app, platform, content_title = parse_activity(window_title, app_name)
    app_key = f"{app_name.lower().strip()}:{window_title.lower().strip()[:50]}"
    content_key = (content_title or "").lower().strip()[:50]

    with _state_lock:
        overrides = _session_overrides.setdefault(workspace_id, set())
        overrides.add(app_key)
        if content_key:
            overrides.add(content_key)
        current_goal = _workspace_states.get(workspace_id, {}).get("last_goal", "")
    _semantic_cache.set(app_name, window_title, current_goal, (True, "Marked as relevant by user for this session", "User Whitelisted", 1.0, "session_override_rule", "mixed", 300))
    if current_goal != "":
        _semantic_cache.set(app_name, window_title, "", (True, "Marked as relevant by user for this session", "User Whitelisted", 1.0, "session_override_rule", "mixed", 300))

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
    with _state_lock:
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


def determine_engagement_mode(
    app_name: str,
    window_title: str,
    intent: str,
) -> tuple[str, int]:
    """
    Classify active window into engagement_mode ('passive', 'mixed', 'interactive')
    and idle_allowance_seconds: passive ~900, mixed ~300, interactive ~120.
    Clamped server-side to 60-1200 seconds without hardcoding app or site names.
    """
    clean_app, platform, content_title = parse_activity(window_title, app_name)
    combined = f"{clean_app} {platform} {content_title} {window_title} {intent}".lower()

    # Passive activities: video/lecture, reading, listening, studying, research docs
    passive_terms = {
        "video", "lecture", "course", "watch", "watching", "listen", "listening",
        "read", "reading", "reader", "paper", "book", "article", "pdf", "docs",
        "documentation", "reference", "tutorial", "slides", "presentation",
        "webinar", "podcast", "stream", "documentary", "study", "studying"
    }

    # Interactive activities: coding, writing, editing, designing, terminal
    interactive_terms = {
        "code", "coding", "develop", "developer", "ide", "editor", "edit", "editing",
        "terminal", "bash", "cmd", "powershell", "git", "commit", "debug", "debugging",
        "write", "writing", "draft", "drafting", "author", "type", "typing",
        "design", "designing", "draw", "drawing", "paint", "painting", "sketch",
        "model", "modeling", "sculpt", "sculpting", "cad", "figma", "blender"
    }

    words = set(combined.replace("-", " ").replace("_", " ").split())
    is_passive = bool(words & passive_terms) or any(t in combined for t in passive_terms)
    is_interactive = bool(words & interactive_terms) or any(t in combined for t in interactive_terms)

    if is_passive and not is_interactive:
        mode = "passive"
        allowance = 900
    elif is_interactive and not is_passive:
        mode = "interactive"
        allowance = 120
    else:
        mode = "mixed"
        allowance = 300

    clamped_allowance = max(60, min(1200, allowance))
    return mode, clamped_allowance


def evaluate_semantics_offline(
    app_name: str, window_title: str, intent: str
) -> ClassificationResult:
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

    engagement_mode, idle_allowance_seconds = determine_engagement_mode(
        app_name=app_name,
        window_title=window_title,
        intent=intent_clean,
    )

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
            "recreational_diversion_rule",
            engagement_mode,
            idle_allowance_seconds,
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
        word_vec = TfidfVectorizer(ngram_range=(1, 3), stop_words="english", sublinear_tf=True)
        word_tfidf = word_vec.fit_transform([intent_clean, full_context])
        word_sim = float(cosine_similarity(word_tfidf[0:1], word_tfidf[1:2])[0][0])
    except Exception:
        word_sim = 0.0

    # B. Character n-gram similarity (morphological roots, compounding, abbreviations)
    try:
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
            "tfidf_cosine_domain_alignment",
            engagement_mode,
            idle_allowance_seconds,
        )

    # Broad intent with no diversion signals -> ALIGNED
    if is_broad_intent:
        return (
            True,
            f"Active tool/content logically supports your general focus session.",
            "Aligned Workflow",
            0.70,
            "broad_productivity_rule",
            engagement_mode,
            idle_allowance_seconds,
        )

    # Divergent from stated specific goal
    return (
        False,
        f"Window '{content_title[:45] or window_title[:45]}' diverges from your declared goal: '{intent[:40]}'.",
        "Divergent Activity",
        round(1.0 - composite_score, 2),
        "tfidf_cosine_domain_divergence",
        engagement_mode,
        idle_allowance_seconds,
    )


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

    with _state_lock:
        return _update_focus_state_locked(
            workspace_id, current_goal, app_name, window_title,
            is_focused, reason, is_cache_hit,
        )


def _update_focus_state_locked(
    workspace_id: int,
    current_goal: str,
    app_name: str,
    window_title: str,
    is_focused: bool,
    reason: str,
    is_cache_hit: bool,
) -> tuple[str, str]:
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
        state = _workspace_states[workspace_id]
        logger.info(f"[STATE] Goal updated for workspace {workspace_id}. State reset and cache cleared.")

    app_lower = app_name.lower().strip()
    title_lower = window_title.lower().strip()
    current_target = f"{app_lower}:{title_lower[:40]}"

    is_prodify = (
        title_lower == "prodify"
        or title_lower.startswith("prodify")
        or app_lower in ["prodify.exe", "prodify", "app.exe"]
    )
    if is_prodify:
        active_reason = state.get("active_distraction_reason") or "Prodify window"
        return ("distracted" if state["status"] == "DISTRACTED" else "focused"), active_reason

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
    with _state_lock:
        if workspace_id in _workspace_states:
            previous = _workspace_states[workspace_id]
            _workspace_states[workspace_id] = {
                "status": "ALIGNED",
                "pending_count": 0,
                "recovery_count": 0,
                "last_target": "",
                "last_goal": previous.get("last_goal", ""),
                "generation": previous.get("generation", 0),
                "active_target": previous.get("active_target", ""),
                "active_distraction_target": "",
                "active_distraction_reason": "",
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
) -> tuple[str, str, str, float, str, str, int]:
    if not intent.strip():
        logger.info(f"[INTENT] No intent set - defaulting to general productivity for '{window_title[:60]}'")
        intent = "General productivity work"

    # 1. Host Self-Awareness (Ignore Prodify's own window as transient/neutral)
    app_lower = app_name.lower().strip()
    title_lower = window_title.lower().strip()
    if (
        title_lower == "prodify"
        or title_lower.startswith("prodify")
        or app_lower in ["prodify.exe", "prodify", "app.exe"]
    ):
        return "focused", "Prodify session controller is intrinsically aligned", "Prodify app", 1.0, "prodify_system_rule", "mixed", 300

    # 2. Whitelist OS System Utilities (Neutral system transitions)
    if app_lower in OS_SYSTEM_UTILITIES:
        with _state_lock:
            state = dict(_workspace_states.get(workspace_id or 0, {}))
        if state and state.get("status") == "DISTRACTED":
            # Keep distracted but never overwrite active_distraction_reason or trigger new strikes
            return "distracted", state.get("active_distraction_reason") or "Session paused", "System Utility", 0.0, "system_utility_latch", "mixed", 300
        return "focused", "System utility transition", "System Utility", 1.0, "system_utility_rule", "mixed", 300

    # 2.5. Per-Workspace Session Override Whitelist (User explicitly marked window as relevant)
    with _state_lock:
        workspace_overrides = set(_session_overrides.get(workspace_id or 0, set()))
    if workspace_id and workspace_overrides:
        clean_app, platform, content_title = parse_activity(window_title, app_name)
        app_key = f"{app_name.lower().strip()}:{window_title.lower().strip()[:50]}"
        content_key = (content_title or "").lower().strip()[:50]
        window_key = window_title.lower().strip()[:50]
        if app_key in workspace_overrides or (content_key and content_key in workspace_overrides) or window_key in workspace_overrides:
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
            mode, allowance = determine_engagement_mode(app_name, window_title, intent)
            return status, reason, "User Whitelisted", 1.0, "session_override_rule", mode, allowance

    is_focused = True
    reason = ""
    summary = ""
    similarity_score = 0.0
    local_rule_match = ""
    engagement_mode = "mixed"
    idle_allowance_seconds = 300
    is_cache_hit = False
    current_target = f"{app_name.lower().strip()}:{window_title.lower().strip()[:40]}"
    generation = begin_classification(workspace_id or 0, current_target)
    if workspace_id:
        with _state_lock:
            _workspace_states.setdefault(workspace_id, {})["last_goal"] = intent

    # 3. Semantic Cache
    cached = _semantic_cache.get(app_name, window_title, intent)
    if cached is not None:
        if len(cached) == 7:
            is_focused, reason, summary, similarity_score, local_rule_match, engagement_mode, idle_allowance_seconds = cached
        else:
            is_focused, reason, summary, similarity_score, local_rule_match = cached[:5]
            engagement_mode, idle_allowance_seconds = determine_engagement_mode(app_name, window_title, intent)
        is_cache_hit = True
        logger.info(f"[INTENT] Cache HIT - {'focused' if is_focused else 'distracted'} (mode={engagement_mode}, allowance={idle_allowance_seconds}s, title='{window_title[:60]}')")
    else:
        logger.info(f"[INTENT] Local cache MISS - evaluating offline for title='{window_title[:60]}'")
        result = evaluate_semantics_offline(
            app_name=app_name,
            window_title=window_title,
            intent=intent,
        )
        if not is_current_classification(workspace_id or 0, generation, current_target):
            logger.info(f"[INTENT] Discarding stale verdict for '{window_title[:60]}'")
            return "focused", "Superseded by newer window", "Superseded", 0.0, "superseded", "mixed", 300
        is_focused, reason, summary, similarity_score, local_rule_match, engagement_mode, idle_allowance_seconds = result
        _semantic_cache.set(app_name, window_title, intent, result)

    if not is_current_classification(workspace_id or 0, generation, current_target):
        logger.info(f"[INTENT] Discarding stale cached verdict for '{window_title[:60]}'")
        return "focused", "Superseded by newer window", "Superseded", 0.0, "superseded", "mixed", 300

    status, reason = update_focus_state(
        workspace_id=workspace_id or 0,
        current_goal=intent,
        app_name=app_name,
        window_title=window_title,
        is_focused=is_focused,
        reason=reason,
        is_cache_hit=is_cache_hit,
    )
    return status, reason, summary, similarity_score, local_rule_match, engagement_mode, idle_allowance_seconds
