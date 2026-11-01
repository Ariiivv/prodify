import logging
import time
import hashlib
import threading
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional, Tuple
from app.services.activity_parser import parse_activity
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger("prodify_telemetry")
ClassificationResult = tuple[bool, str, str, float, str, str, int]

_STOPWORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with",
    "of", "by", "from", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "this", "that", "these", "those",
    "it", "its", "my", "your", "his", "her", "their", "our", "you", "we", "they",
    "i", "me", "us", "him", "them", "how", "what", "why", "when", "where", "which"
}

# Domain ontology mapping tech and academic subjects to expanded domain concepts
DOMAIN_ONTOLOGY: dict[str, set[str]] = {
    "cpp": {
        "c++", "cpp", "cplusplus", "pointer", "pointers", "memory", "compiler", "gcc", "clang", "g++",
        "template", "templates", "stl", "vector", "std", "header", "include", "oop", "class", "classes",
        "struct", "destructor", "constructor", "reference", "references", "syntax", "algorithm",
        "data structure", "concurrency", "thread", "programming", "code", "coding", "tutorial", "learn"
    },
    "c": {
        "c programming", "c language", "pointer", "pointers", "malloc", "free", "memory", "gcc",
        "header", "struct", "syntax", "algorithm", "code", "coding", "tutorial"
    },
    "csharp": {
        "c#", "csharp", "dotnet", ".net", "unity", "linq", "async", "await", "clr", "programming", "code", "coding"
    },
    "python": {
        "python", "py", "pip", "django", "fastapi", "flask", "numpy", "pandas", "matplotlib",
        "scikit", "pytorch", "tensorflow", "jupyter", "notebook", "dataframe", "programming", "code", "coding"
    },
    "web_dev": {
        "javascript", "typescript", "js", "ts", "react", "nextjs", "vue", "angular", "node", "nodejs",
        "npm", "frontend", "backend", "web", "css", "html", "dom", "tailwind", "api", "programming", "code", "coding"
    },
    "rust": {
        "rust", "cargo", "crate", "borrow", "lifetime", "trait", "ownership", "programming", "code", "coding"
    },
    "java": {
        "java", "jvm", "spring", "maven", "gradle", "jdk", "oop", "programming", "code", "coding"
    },
    "math": {
        "math", "mathematics", "calculus", "linear algebra", "algebra", "matrix", "vector", "eigenvalue",
        "eigenvector", "derivative", "integral", "theorem", "proof", "statistics", "probability"
    },
    "chemistry": {
        "chemistry", "organic", "reaction", "molecule", "mechanism", "synthesis", "acid", "base", "orbital", "chemical"
    },
    "biology": {
        "biology", "biological", "cell", "cellular", "genetics", "dna", "rna", "protein", "anatomy", "medical", "physiology"
    },
    "design": {
        "design", "ui", "ux", "figma", "blender", "photoshop", "art", "drawing", "illustration", "palette", "typography", "3d"
    },
    "video_editing": {
        "video", "editing", "davinci", "premiere", "cut", "timeline", "color grade", "keyframes", "render"
    },
    "general_programming": {
        "programming", "program", "code", "coding", "developer", "development", "software", "terminal",
        "debug", "debugging", "algorithm", "git", "github", "tutorial", "docs", "documentation", "api"
    }
}


@dataclass
class IntentProfile:
    raw_intent: str
    core_subject: str
    core_tokens: set[str] = field(default_factory=set)
    declared_channels: set[str] = field(default_factory=set)
    domain_concepts: set[str] = field(default_factory=set)
    is_broad: bool = False


def _normalize_tech_text(text: str) -> str:
    """
    Normalizes technical abbreviations and phrases so punctuation like '+' in C++
    and '#' in C# isn't stripped by standard tokenizers.
    """
    t = text.lower()
    t = re.sub(r"\bc\+\+\b", "cpp cplusplus", t)
    t = re.sub(r"\bc\s*\+\s*\+", "cpp cplusplus", t)
    t = re.sub(r"\bc#\b", "csharp", t)
    t = re.sub(r"\bc\s*#", "csharp", t)
    t = re.sub(r"\b\.net\b", "dotnet", t)
    t = re.sub(r"\bvs\s*code[d]?\b|\bvscode\b|\bvisual\s+studio\s+code\b", "vscode code_editor", t)
    t = re.sub(r"\byt\b|\byoutube\b", "youtube video_tutorial", t)
    t = re.sub(r"\bai\b|\bchatgpt\b|\bclaude\b|\bgemini\b|\bperplexity\b|\bllm\b", "ai_assistant llm_tool", t)
    t = re.sub(r"\bnode\.?js\b", "nodejs", t)
    t = re.sub(r"\breact\.?js\b", "reactjs", t)
    t = re.sub(r"\bvue\.?js\b", "vuejs", t)
    return t


def parse_intent_profile(raw_intent: str) -> IntentProfile:
    """
    True Semantic Intent Parser:
    Extracts core objective subject (e.g. 'c++') and declared auxiliary modalities
    (video learning, code editors, AI tools, documentation) from natural language goals.
    """
    intent_clean = (raw_intent or "").strip()
    if not intent_clean or intent_clean.lower() in ["general", "none", "work", "focus", "deep work"]:
        return IntentProfile(
            raw_intent=raw_intent or "General Productivity",
            core_subject="general productivity",
            core_tokens={"productivity", "work", "focus"},
            declared_channels={"general"},
            domain_concepts={"productivity", "work", "study", "research"},
            is_broad=True,
        )

    norm = _normalize_tech_text(intent_clean)

    # 1. Detect declared channels / auxiliary contexts
    channels: set[str] = set()
    if re.search(r"\b(youtube|video_tutorial|video|videos|course|courses|lecture|lectures|tutorial|tutorials|udemy|coursera|khan\s*academy|stream|watch|watching)\b", norm):
        channels.add("video_learning")
    if re.search(r"\b(ai_assistant|llm_tool|ai|chatgpt|claude|gemini|perplexity|copilot|llm|assistant|gpt|artificial\s*intelligence)\b", norm):
        channels.add("ai_tools")
    if re.search(r"\b(vscode|code_editor|editor|ide|terminal|cursor|pycharm|intellij|vim|neovim|sublime|code|coding)\b", norm):
        channels.add("code_editor")
    if re.search(r"\b(docs|documentation|reference|manual|api|specs|specification|stackoverflow|stack\s*overflow|github|arxiv|paper|papers|book|books|reading|textbook|pdf)\b", norm):
        channels.add("documentation")
    if re.search(r"\b(figma|blender|photoshop|premiere|davinci|resolve|illustrator|canva|design|drawing|paint|painting|3d|sculpt|animation|render)\b", norm):
        channels.add("creative_media")
    if re.search(r"\b(google\s*docs|notion|obsidian|word|notes|write|writing|essay|draft|journal)\b", norm):
        channels.add("writing_notes")

    # 2. Extract Core Subject by stripping boilerplate connectors and tool declarations
    subject_text = intent_clean.lower()
    strip_patterns = [
        r"\b(i'll\s*be|ill\s*be|i\s*will\s*be|i\s*would\s*be|i'm\s*going\s*to|im\s*going\s*to|i\s*am\s*going\s*to|i\s*want\s*to|i\s*am|im)\b",
        r"\b(learning|studying|practicing|working\s*on|doing|building|creating|exploring|preparing|focusing\s*on)\b",
        r"\b(using|used|uses|with|through|via|by|in|on|at|for|to|from|of|and|or)\b",
        r"\b(related\s*to\s*it|related\s*to|related|it|its|my|the|a|an)\b",
        r"\b(vs\s*code[d]?|vscode|visual\s*studio\s*code|code\s*editor|editor|ide|terminal)\b",
        r"\b(ai|chatgpt|claude|gemini|perplexity|copilot|llm|assistant)\b",
        r"\b(yt|youtube|video|videos|course|courses|tutorial|tutorials|lectures?)\b",
        r"\b(documentation|docs|reference|stackoverflow|google|browser)\b",
    ]
    for pat in strip_patterns:
        subject_text = re.sub(pat, " ", subject_text, flags=re.IGNORECASE)

    # Clean residual punctuation except + and #
    subject_cleaned = re.sub(r"[^\w\s+#.]", " ", subject_text).strip()
    subject_cleaned = re.sub(r"\s+", " ", subject_cleaned).strip()

    if not subject_cleaned:
        tokens = [w for w in re.sub(r"[^\w\s+#.]", " ", intent_clean.lower()).split() if w not in _STOPWORDS]
        core_subject = " ".join(tokens) if tokens else intent_clean
    else:
        core_subject = subject_cleaned

    # 3. Core tokens
    core_tokens = {w for w in re.sub(r"[^\w\s+#.]", " ", core_subject.lower()).split() if len(w) > 0 and w not in _STOPWORDS}
    if "c++" in intent_clean.lower() or "cpp" in core_tokens or "c++" in core_tokens:
        core_tokens.update({"c++", "cpp", "cplusplus"})
    if "c#" in intent_clean.lower() or "csharp" in core_tokens:
        core_tokens.update({"c#", "csharp"})

    # 4. Domain concept expansion
    domain_concepts: set[str] = set()
    for key, terms in DOMAIN_ONTOLOGY.items():
        if core_tokens & terms or any(t in core_subject.lower() for t in terms):
            domain_concepts.update(terms)

    if not domain_concepts:
        domain_concepts.update(core_tokens)

    if "code_editor" in channels or "cpp" in core_tokens or "python" in core_tokens or "rust" in core_tokens:
        domain_concepts.update(DOMAIN_ONTOLOGY["general_programming"])

    is_broad = len(core_tokens) <= 2 and any(t in core_tokens for t in ["study", "work", "focus", "project", "research", "learning"])

    return IntentProfile(
        raw_intent=raw_intent,
        core_subject=core_subject,
        core_tokens=core_tokens,
        declared_channels=channels,
        domain_concepts=domain_concepts,
        is_broad=is_broad,
    )


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


# Cache & State Machine singletons
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
    """Clears semantic evaluation cache and resets workspace focus state machine."""
    _semantic_cache.clear()
    with _state_lock:
        if workspace_id is not None:
            reset_workspace_focus_state(workspace_id)
            _session_overrides.pop(workspace_id, None)
        else:
            _workspace_states.clear()
            _session_overrides.clear()
    logger.info(f"[CACHE] Intent cache and focus states cleared (workspace_id={workspace_id}).")


def determine_engagement_mode(
    app_name: str,
    window_title: str,
    intent: str,
) -> tuple[str, int]:
    """
    Classifies active window into engagement_mode ('passive', 'mixed', 'interactive')
    and idle_allowance_seconds: passive ~900s, mixed ~300s, interactive ~120s.
    """
    clean_app, platform, content_title = parse_activity(window_title, app_name)
    combined = f"{clean_app} {platform} {content_title} {window_title} {intent}".lower()

    if platform == "YouTube" or any(t in combined for t in ["video", "lecture", "course", "reading", "pdf", "article", "stream"]):
        return "passive", 900
    if clean_app in ["VS Code", "Cursor", "Terminal", "PyCharm", "Command Prompt", "IntelliJ"] or any(t in combined for t in ["code", "coding", "typing", "editor"]):
        return "interactive", 120
    return "mixed", 300


def evaluate_semantics_offline(
    app_name: str, window_title: str, intent: str
) -> ClassificationResult:
    """
    Pure Dynamic Semantic Intent Matching Engine:
    - Strictly avoids hardcoded application/executable blacklists.
    - Parses both the core objective (e.g. 'C++') and declared auxiliary learning channels.
    - Evaluates via multi-scale TF-IDF and character n-gram cosine vector similarity.
    - Produces transparent, human-readable semantic explanations for each verdict.
    """
    clean_app, platform, content_title = parse_activity(window_title, app_name)
    title_clean = (content_title or window_title or "").strip()
    profile = parse_intent_profile(intent)

    app_lower = (app_name or "").lower().strip()
    title_lower = (window_title or "").lower().strip()
    content_lower = title_clean.lower()
    full_context = f"{clean_app} {platform} {title_clean} {window_title}".lower()

    engagement_mode, idle_allowance_seconds = determine_engagement_mode(
        app_name=app_name,
        window_title=window_title,
        intent=intent,
    )

    # 1. Explicit Entertainment / Gaming Distractions Check
    # Catches recreational streams, gaming, comedy compilations, and music videos
    entertainment_markers = [
        "gameplay", "walkthrough", "speedrun", "esports", "streamer", "twitch",
        "roblox", "minecraft", "fortnite", "valorant", "gta 5", "gta v", "gta", "cs:go", "call of duty", "warzone",
        "funny moments", "prank", "cringe compilation", "meme compilation",
        "music video", "official video", "lyric video", "album", "top hits",
        "celebrity gossip", "shorts feed", "reels feed"
    ]
    is_entertainment = any(m in full_context for m in entertainment_markers)
    intent_allows_entertainment = any(t in profile.domain_concepts for t in ["game", "gaming", "music", "entertainment"])

    # 2. Priority 1: Code Editor & Development Tools Check
    if clean_app in ["VS Code", "Cursor", "Terminal", "Command Prompt", "PyCharm", "IntelliJ", "Sublime Text", "Vim"]:
        if "code_editor" in profile.declared_channels or "general_programming" in profile.domain_concepts:
            reason = f"Active code editor '{clean_app}' ({title_clean[:40]}) directly serves your declared '{profile.core_subject}' programming goal."
            logger.info(f"[INTENT EVAL] Target: '{clean_app}' | Title: '{title_clean[:50]}' | Goal: '{intent[:40]}' | Verdict: ALIGNED ({reason})")
            return (
                True,
                reason,
                "Aligned Code Editor",
                0.95,
                "declared_code_editor_match",
                engagement_mode,
                idle_allowance_seconds,
            )

    # 3. Direct Core Subject Match (e.g. "c++" in "C++ in One Shot")
    subject_matched = False
    for tok in profile.core_tokens:
        if len(tok) < 2 and tok not in ["c", "r"]:
            continue
        if tok in ["c++", "cpp", "cplusplus"]:
            if re.search(r"\b(c\+\+|cpp|cplusplus)\b", content_lower) or re.search(r"\b(c\+\+|cpp|cplusplus)\b", full_context):
                subject_matched = True
                break
        elif tok in ["c#", "csharp"]:
            if re.search(r"\b(c#|csharp)\b", content_lower):
                subject_matched = True
                break
        else:
            if re.search(rf"\b{re.escape(tok)}\b", content_lower) or re.search(rf"\b{re.escape(tok)}\b", full_context):
                subject_matched = True
                break

    if subject_matched and not (is_entertainment and not intent_allows_entertainment):
        if platform == "YouTube" or "video_learning" in profile.declared_channels or "video" in content_lower:
            reason = f"Content '{title_clean[:45]}' semantically aligns with your declared goal '{profile.core_subject}'."
            logger.info(f"[INTENT EVAL] Target: '{clean_app}' | Title: '{title_clean[:50]}' | Goal: '{intent[:40]}' | Verdict: ALIGNED ({reason})")
            return (
                True,
                reason,
                "Aligned Video Tutorial",
                0.95,
                "semantic_subject_video_match",
                engagement_mode,
                idle_allowance_seconds,
            )
        else:
            reason = f"Content '{title_clean[:45]}' directly matches your declared objective '{profile.core_subject}'."
            logger.info(f"[INTENT EVAL] Target: '{clean_app}' | Title: '{title_clean[:50]}' | Goal: '{intent[:40]}' | Verdict: ALIGNED ({reason})")
            return (
                True,
                reason,
                "Aligned Subject Activity",
                0.90,
                "semantic_subject_direct_match",
                engagement_mode,
                idle_allowance_seconds,
            )

    # 4. Declared Tool / Auxiliary Channel Matching
    # A. AI Assistant
    if "ai_tools" in profile.declared_channels or platform == "AI Assistant":
        if platform == "AI Assistant" or clean_app == "AI Assistant":
            if not is_entertainment:
                reason = f"AI assistant research ({title_clean[:40]}) directly supports your declared learning workflow."
                logger.info(f"[INTENT EVAL] Target: '{clean_app}' | Title: '{title_clean[:50]}' | Goal: '{intent[:40]}' | Verdict: ALIGNED ({reason})")
                return (
                    True,
                    reason,
                    "Aligned AI Assistant",
                    0.88,
                    "declared_ai_assistant_match",
                    engagement_mode,
                    idle_allowance_seconds,
                )

    # B. Documentation / Reference
    if "documentation" in profile.declared_channels or "general_programming" in profile.domain_concepts:
        if platform in ["GitHub", "Stack Overflow", "Google Docs"] or "reference" in content_lower or "docs" in content_lower:
            if not is_entertainment:
                reason = f"Technical reference '{platform}' ({title_clean[:40]}) aligns with your declared learning workflow."
                logger.info(f"[INTENT EVAL] Target: '{clean_app}' | Title: '{title_clean[:50]}' | Goal: '{intent[:40]}' | Verdict: ALIGNED ({reason})")
                return (
                    True,
                    reason,
                    "Aligned Documentation",
                    0.85,
                    "declared_documentation_match",
                    engagement_mode,
                    idle_allowance_seconds,
                )

    # 5. Multi-Scale TF-IDF & Character N-Gram Vector Cosine Similarity
    norm_intent = _normalize_tech_text(f"{intent} {' '.join(list(profile.domain_concepts)[:25])}")
    norm_context = _normalize_tech_text(f"{clean_app} {platform} {title_clean} {window_title}")

    try:
        word_vec = TfidfVectorizer(ngram_range=(1, 3), stop_words="english", sublinear_tf=True)
        word_tfidf = word_vec.fit_transform([norm_intent, norm_context])
        word_sim = float(cosine_similarity(word_tfidf[0:1], word_tfidf[1:2])[0][0])
    except Exception:
        word_sim = 0.0

    try:
        char_vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        char_tfidf = char_vec.fit_transform([norm_intent, norm_context])
        char_sim = float(cosine_similarity(char_tfidf[0:1], char_tfidf[1:2])[0][0])
    except Exception:
        char_sim = 0.0

    domain_hits = sum(1 for term in profile.domain_concepts if term in content_lower or term in full_context)
    domain_score = min(1.0, domain_hits * 0.25)

    composite_score = (0.40 * word_sim) + (0.35 * char_sim) + (0.25 * domain_score)

    # 6. Semantic Threshold Evaluation
    if not is_entertainment and (composite_score >= 0.12 or domain_hits >= 1):
        reason = f"Content '{title_clean[:45]}' semantically aligns with your declared goal '{profile.core_subject or intent[:35]}'."
        logger.info(f"[INTENT EVAL] Target: '{clean_app}' | Title: '{title_clean[:50]}' | Goal: '{intent[:40]}' | Verdict: ALIGNED ({reason})")
        return (
            True,
            reason,
            "Aligned Semantic Workflow",
            round(max(composite_score, 0.75), 2),
            "tfidf_domain_semantic_alignment",
            engagement_mode,
            idle_allowance_seconds,
        )

    # 7. Broad Focus Handling
    if profile.is_broad and not is_entertainment:
        reason = f"Active tool/content logically supports your general focus session."
        logger.info(f"[INTENT EVAL] Target: '{clean_app}' | Title: '{title_clean[:50]}' | Goal: '{intent[:40]}' | Verdict: ALIGNED ({reason})")
        return (
            True,
            reason,
            "Aligned Focus Session",
            0.70,
            "broad_productivity_match",
            engagement_mode,
            idle_allowance_seconds,
        )

    # 8. Definite Distraction / Semantic Divergence
    if is_entertainment and not intent_allows_entertainment:
        divergence_reason = f"Window '{title_clean[:45]}' represents an off-task entertainment distraction from declared goal '{profile.core_subject or intent[:35]}'."
    else:
        divergence_reason = f"Window '{title_clean[:45]}' diverges from your declared goal: '{intent[:40]}' (zero semantic overlap with '{profile.core_subject or intent[:35]}')."

    logger.info(f"[INTENT EVAL] Target: '{clean_app}' | Title: '{title_clean[:50]}' | Goal: '{intent[:40]}' | Verdict: DISTRACTED ({divergence_reason})")
    return (
        False,
        divergence_reason,
        "Divergent Activity",
        round(max(0.0, 1.0 - composite_score), 2),
        "semantic_domain_divergence",
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
    Prevents stale reason leakage by binding reasons strictly to active targets
    and resetting immediately back to ALIGNED whenever the user returns to work.
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

    # Identify transient OS utility flickers
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

    app_lower = app_name.lower().strip()
    title_lower = window_title.lower().strip()
    if (
        title_lower == "prodify"
        or title_lower.startswith("prodify")
        or app_lower in ["prodify.exe", "prodify", "app.exe"]
    ):
        return "focused", "Prodify session controller is intrinsically aligned", "Prodify app", 1.0, "prodify_system_rule", "mixed", 300

    # Whitelist OS System Utilities (Neutral system transitions)
    if app_lower in OS_SYSTEM_UTILITIES:
        with _state_lock:
            state = dict(_workspace_states.get(workspace_id or 0, {}))
        if state and state.get("status") == "DISTRACTED":
            return "distracted", state.get("active_distraction_reason") or "Session paused", "System Utility", 0.0, "system_utility_latch", "mixed", 300
        return "focused", "System utility transition", "System Utility", 1.0, "system_utility_rule", "mixed", 300

    # Per-Workspace Session Override Whitelist (User explicitly marked window as relevant)
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

    # Semantic Cache
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
