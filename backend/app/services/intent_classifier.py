"""
Production Semantic Intent Classifier & Focus State Machine for Prodify.
Provides dynamic natural-language goal parsing, semantic evaluation without blacklists,
strictness enforcement, open-container content validation, and hysteresis state machine.
"""

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
    "i", "me", "us", "him", "them", "how", "what", "why", "when", "where", "which",
    "will", "would", "shall", "should", "can", "could", "may", "might", "must",
    "stuff", "things", "laptop", "pc", "computer", "session", "today", "tomorrow"
}

# Domain ontology mapping concepts across diverse academic and professional fields
DOMAIN_ONTOLOGY: dict[str, set[str]] = {
    "medicine": {
        "usmle", "step 1", "cardiology", "pharmacology", "heart", "ecg", "ekg", "st elevation",
        "myocardial", "infarction", "arrhythmia", "antiarrhythmic", "vaughan williams", "ace inhibitor",
        "ace inhibitors", "kidney disease", "beta blocker", "first aid", "anki", "cardiac", "ventricular",
        "atrial", "coronary", "artery", "syndrome", "hypertension", "angina", "statins"
    },
    "law": {
        "law", "constitutional", "torts", "tort", "cases", "legal", "brief", "marbury", "madison",
        "supreme court", "justia", "westlaw", "negligence", "duty of care", "intentional infliction",
        "emotional distress", "strict liability", "damages", "plaintiff", "defendant", "appellate", "jurisdiction"
    },
    "audio": {
        "audio", "mixing", "mix", "mastering", "stems", "eq", "equalizer", "reaper", "fabfilter",
        "plugins", "woodwinds", "brass", "reverb", "decay", "staging", "compression", "daw", "frequencies",
        "gain", "limiter", "orchestral", "orchestra", "strings", "symphonic"
    },
    "civil_engineering": {
        "civil", "concrete", "beam", "reinforcement", "rebar", "structures", "autocad", "mathcad",
        "development length", "tension", "shear", "moment", "structural", "load", "bearing", "eurocode", "aci"
    },
    "japanese": {
        "japanese", "kanji", "n3", "n2", "n1", "n4", "n5", "jisho", "conversational", "hiragana", "katakana",
        "grammar", "vocabulary", "jlpt", "reading", "bunpro", "wanikani", "listening"
    },
    "finance": {
        "finance", "financial", "dcf", "valuation", "excel", "equity research", "wacc", "terminal value",
        "sensitivity", "10-k", "edgar", "sec", "ebitda", "cash flow", "unlevered", "fcf", "discount rate",
        "modeling", "balance sheet", "income statement", "capital expenditure"
    },
    "genetics": {
        "genetics", "crispr", "cas9", "guide rna", "off-target", "literature review", "ncbi", "pubmed", "molecular biology", "biology", "dna replication", "polymerase", "replication", "translation", "transcription",
        "dna", "rna", "mutation", "cleavage", "homology", "endonuclease", "editing", "genome"
    },
    "cybersecurity": {
        "penetration testing", "pentest", "kali", "nmap", "wireshark", "port scanning", "burp suite",
        "vulnerability", "packet capture", "tcp syn", "exploit", "cve", "network", "firewall", "payload"
    },
    "machine_learning": {
        "machine learning", "deep learning", "transformer", "attention", "pytorch", "huggingface",
        "multi-head", "tensorboard", "cuda", "loss", "weights", "gradients", "forward pass", "backpropagation",
        "llm", "neural network", "bert", "gpt", "jupyter", "jupyterlab", "train.py", "batch_size", "epoch"
    },
    "creative_writing": {
        "writing", "novel", "fiction", "fantasy", "chapter", "chapters", "scrivener", "plot", "character arc",
        "worldbuilding", "dialogue", "prose", "protagonist", "antagonist", "synopsis", "manuscript",
        "sanderson", "climax", "pacing", "tension", "sensory", "story", "dungeon"
    },
    "graphic_design": {
        "design", "graphic", "vector", "logo", "typography", "kerning", "illustrator", "behance",
        "branding", "font", "fonts", "typeface", "typefaces", "sans-serif", "serif", "layout", "grid", "color palette", "bezier", "svg"
    },
    "mathematics": {
        "algebra", "quadratic", "polynomial", "polynomials", "equations", "factoring", "factor", "khan academy", "desmos",
        "parabola", "vertex", "roots", "discriminant", "coefficients", "calculus", "functions", "graphing", "grouping"
    },
    "philosophy": {
        "philosophy", "kant", "critique of pure reason", "epistemology", "synthetic a priori",
        "transcendental", "stanford encyclopedia", "ethics", "metaphysics", "reason", "critique"
    },
    "devops": {
        "terraform", "infrastructure", "aws", "vpc", "modules", "iac", "cloud", "docker", "kubernetes",
        "subnets", "security group", "route53", "s3", "deploy", "provisioning"
    },
    "game_dev": {
        "game dev", "gamedev", "procedural", "dungeon", "generation", "bsp", "godot", "unity",
        "binary space partitioning", "tileset", "roguelike", "algorithm", "2d", "physics"
    },
    "animation_3d": {
        "3d", "animation", "rigging", "inverse kinematics", "ik", "blender", "weight painting",
        "armature", "bone", "mesh", "topology", "skinning", "pose", "keyframes"
    },
    "pastry": {
        "pastry", "french", "culinary", "laminated", "dough", "textbook", "croissant", "baking",
        "butter", "turns", "viennoiserie", "proofing", "yeast", "puff pastry"
    },
    "architecture": {
        "architecture", "architectural", "visualization", "lighting", "sketchup", "v-ray",
        "cantilever", "villa", "minimalist", "exterior", "render", "facade", "archdaily", "plans"
    },
    "economics": {
        "economics", "macroeconomics", "macroeconomic", "inflation", "monetary policy", "central bank",
        "rstudio", "r studio", "interest rates", "fomc", "federal reserve", "gdp", "econometrics", "phillips curve",
        "cpi", "time series", "autoregressive"
    },
    "aviation": {
        "aviation", "pilot", "ground school", "meteorology", "weather theory", "airspace", "charts",
        "faa", "adiabatic", "lapse rate", "thunderstorms", "metar", "metars", "radar", "aviationweather",
        "flight", "sectional", "altimeter"
    },
    "automotive": {
        "automotive", "engine", "internal combustion", "thermodynamic", "otto cycle", "ansys", "cfd",
        "combustion", "four-stroke", "cylinder", "thermal", "efficiency", "piston", "exhaust"
    },
    "cpp": {
        "c++", "cpp", "cplusplus", "pointer", "pointers", "memory", "compiler", "gcc", "clang",
        "template", "templates", "stl", "vector", "std", "header", "include", "oop", "struct",
        "syntax", "algorithm", "cppreference", "boost", "programming", "code", "coding"
    },
    "rust": {
        "rust", "cargo", "borrow", "borrowing", "lifetime", "lifetimes", "ownership", "memory safety",
        "leetcode", "crate", "traits", "pattern matching", "concurrency", "programming", "code", "coding"
    },
    "chemistry_biochemistry": {
        "chemistry", "organic chemistry", "biochemistry", "cell biology", "enzyme", "inhibition",
        "curves", "competitive", "non-competitive", "reaction", "kinetics", "substrate", "michaelis menten",
        "allosteric", "metabolism", "pathway", "molecular"
    }
}

EXTENSION_MAPPINGS: dict[str, str] = {
    "rs": "rust",
    "cpp": "cpp",
    "cxx": "cpp",
    "cc": "cpp",
    "hpp": "cpp",
    "h": "cpp",
    "c": "c",
    "py": "python",
    "ipynb": "python",
    "js": "javascript",
    "ts": "typescript",
    "tsx": "react",
    "jsx": "react",
    "java": "java",
    "cs": "csharp",
    "go": "golang",
    "rb": "ruby",
    "php": "php",
    "tf": "terraform",
    "sql": "sql",
    "r": "rstudio",
}


@dataclass
class IntentProfile:
    raw_intent: str
    core_subject: str
    core_tokens: set[str] = field(default_factory=set)
    named_tools: set[str] = field(default_factory=set)
    declared_channels: set[str] = field(default_factory=set)
    domain_concepts: set[str] = field(default_factory=set)
    strictness: str = "FLEXIBLE"
    is_broad: bool = False


def _normalize_tech_text(text: str) -> str:
    """Normalizes technical abbreviations and phrases."""
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


def _is_generic_or_uninitialized(title: str, app_name: str) -> bool:
    """Detects uninitialized, empty, or generic application states that get benefit of doubt."""
    tl = title.lower().strip()
    al = app_name.lower().strip()
    if not tl or len(tl) <= 2:
        return True
    
    generic_exact = {
        "new tab", "untitled", "untitled document", "document", "new chat",
        "chat", "dashboard", "home", "start", "welcome", "blank", "search",
        "loading", "page", "new file", "scratchpad", "notes", "anki - dashboard",
        "anki - anki"
    }
    if tl in generic_exact:
        return True
    
    if re.match(r"^untitled(-\d+)?(\.\w+)?$", tl):
        return True
    if re.search(r"\bpage\s*\d+\b", tl):
        return True
    if re.search(r"\b(untitled\s*document|untitled\s*file|untitled\s*spreadsheet|new\s*tab)\b", tl):
        return True
    if re.search(r"\buntitled\d*\.\w+\b", tl):
        return True
    if re.search(r"^anki\s*-\s*(dashboard|decks|browse)$", tl):
        return True
    if re.match(r"^(chatgpt|claude|gemini|copilot)(\s*-\s*(new\s*chat|chat))?$", tl):
        return True

    return False


def _is_generic_ai_assistant(app_name: str, platform: str, title: str) -> bool:
    """Generically recognizes AI conversational assistants by pattern."""
    combined = f"{app_name} {platform} {title}".lower()
    patterns = [
        r"\b(ai\s*assistant|chatgpt|claude|gemini|copilot|perplexity|grok|deepseek|ollama|lm\s*studio)\b",
        r"\b(llm|gpt-?4|gpt-?3|claude-?3|sonnet|opus|haiku|chat\s*bot|generative\s*ai)\b",
        r"\b(new\s*chat|chat\s*history|model:\s*gpt)\b",
    ]
    return any(re.search(p, combined) for p in patterns)


def parse_intent_profile(raw_intent: str) -> IntentProfile:
    """
    Parses intent strictly from natural language:
    - Exclusivity detection ('only', 'just', 'nothing else').
    - Core objective subject extraction.
    - Named tools extraction across conjunctions ('and', 'or', commas).
    - Semantic concept expansion across domain ontology.
    """
    intent_clean = (raw_intent or "").strip()
    if not intent_clean or intent_clean.lower() in ["general", "none", "work", "focus", "deep work"]:
        return IntentProfile(
            raw_intent=raw_intent or "General Productivity",
            core_subject="general productivity",
            core_tokens={"productivity", "work", "focus"},
            named_tools=set(),
            domain_concepts={"productivity", "work", "study", "research", "focus"},
            strictness="FLEXIBLE",
            is_broad=True,
        )

    intent_lower = intent_clean.lower()

    # 1. Detect Natural Language Strictness / Exclusivity
    strict_signals = [
        r"\b(only|just|nothing\s*else|exclusively|solely|strictly|no\s*other|single\s*tool)\b",
        r"^i\s*(will|would)?\s*(only|just)\s*use\b",
        r"^only\s*use\b",
    ]
    is_strict = any(re.search(sig, intent_lower) for sig in strict_signals)

    # 2. Extract Named Tools
    named_tools: set[str] = set()
    tool_clause_match = re.search(r"(?:using|use|in|on|with|through|via|only use|just use|only|just)\s+([a-zA-Z0-9_+#. ,&/-]+)$", intent_lower)
    if tool_clause_match:
        clause = tool_clause_match.group(1)
        items = re.split(r"\s*(?:\band\b|\bor\b|,|&|\+)\s*", clause)
        for item in items:
            clean_item = item.strip()
            clean_item = re.sub(r"\b(the|a|an|my|some|all|any|to|it|its|nothing\s*else|stuff|on|my|laptop)\b", "", clean_item).strip()
            if clean_item and len(clean_item) > 1 and clean_item not in _STOPWORDS:
                named_tools.add(clean_item)

    normalized_named_tools: set[str] = set()
    for t in named_tools:
        normalized_named_tools.add(t)
        t_nospaces = t.replace(" ", "")
        normalized_named_tools.add(t_nospaces)
        if t in ["yt", "youtube", "yt vids", "yt videos", "youtube videos"]:
            normalized_named_tools.update({"youtube", "video"})
        elif t in ["vs code", "vscode", "vs coded", "visual studio code"]:
            normalized_named_tools.update({"vscode", "vs code", "visual studio code", "code editor", "code"})
        elif t in ["ai", "ai tools", "chatgpt"]:
            normalized_named_tools.update({"ai", "chatgpt", "ai assistant", "claude", "gemini"})
        elif "davinci" in t:
            normalized_named_tools.update({"davinci", "davinci resolve"})
        elif "file explorer" in t or "explorer" in t:
            normalized_named_tools.update({"explorer", "file explorer", "windows explorer"})
        elif "jupyter" in t:
            normalized_named_tools.update({"jupyter", "jupyterlab", "jupyter lab"})
        elif "r studio" in t or "rstudio" in t:
            normalized_named_tools.update({"rstudio", "r studio"})

    # 3. Extract Core Subject by stripping boilerplate connectors and container words
    subject_text = intent_lower
    strip_boilerplate = [
        r"\b(i'll\s*be|ill\s*be|i\s*will\s*be|i\s*would\s*be|i'm\s*going\s*to|im\s*going\s*to|i\s*am\s*going\s*to|i\s*want\s*to|i\s*am|im|yo\s*im\s*tryna|tryna|gonna\s*be|grinding)\b",
        r"\b(learning|studying|practicing|working\s*on|doing|building|creating|exploring|preparing|focusing\s*on|reviewing|revising|designing|writing|reading|crafting|modeling|implementing|training|mixing)\b",
        r"\b(using|used|uses|with|through|via|by|in|on|at|for|to|from|of|and|or)\b",
        r"\b(related\s*to\s*it|related\s*to|related|it|its|my|the|a|an|some|stuff|things|laptop|tomorrow's\s*exam|exam)\b",
        r"\b(only\s*use|just\s*use|nothing\s*else|only|just|exclusively|solely)\b",
        r"\b(yt\s*vids|yt\s*videos|yt|youtube\s*videos|youtube\s*lessons|youtube|video|videos|vids|lessons|courses?|tutorials?)\b",
        r"\b(ai\s*tools|ai|chatgpt|claude|gemini)\b",
        r"\b(vs\s*code[d]?|vscode|code\s*editor)\b",
    ]
    for pat in strip_boilerplate:
        subject_text = re.sub(pat, " ", subject_text, flags=re.IGNORECASE)

    subject_cleaned = re.sub(r"[^\w\s+#.]", " ", subject_text).strip()
    subject_cleaned = re.sub(r"\s+", " ", subject_cleaned).strip()

    if not subject_cleaned:
        tokens = [w for w in re.sub(r"[^\w\s+#.]", " ", intent_lower).split() if w not in _STOPWORDS]
        core_subject = " ".join(tokens) if tokens else intent_clean
    else:
        core_subject = subject_cleaned

    container_words = {"youtube", "yt", "vids", "videos", "tutorial", "tutorials", "lessons", "course", "courses", "notes", "laptop"}
    core_tokens = {
        w for w in re.sub(r"[^\w\s+#.]", " ", core_subject).split()
        if len(w) >= 2 and w not in _STOPWORDS and w not in container_words
    }
    if "c++" in intent_lower or "cpp" in core_tokens:
        core_tokens.update({"c++", "cpp", "cplusplus"})
    if "c#" in intent_lower or "csharp" in core_tokens:
        core_tokens.update({"c#", "csharp"})
    if "r" in intent_lower.split() or "r studio" in intent_lower or "rstudio" in intent_lower:
        core_tokens.update({"r studio", "rstudio"})

    domain_concepts: set[str] = set()
    intent_full_words = set(re.sub(r"[^\w\s+#.]", " ", intent_lower).split())
    for domain_name, terms in DOMAIN_ONTOLOGY.items():
        if terms & core_tokens or terms & intent_full_words or any(t in intent_lower for t in [domain_name, domain_name.replace("_", " ")]):
            domain_concepts.update(terms)

    is_broad = len(core_tokens) <= 2 and any(t in core_tokens for t in ["study", "work", "focus", "project", "research", "learning"])

    return IntentProfile(
        raw_intent=raw_intent,
        core_subject=core_subject,
        core_tokens=core_tokens,
        named_tools=normalized_named_tools,
        declared_channels=normalized_named_tools,
        domain_concepts=domain_concepts,
        strictness="STRICT" if is_strict else "FLEXIBLE",
        is_broad=is_broad,
    )


def _stem_match(token: str, target: str) -> bool:
    """Matches words with identical base stems after removing standard inflectional suffixes."""
    if token == target:
        return True
    s1 = re.sub(r"(ing|ed|es|s)$", "", token)
    s2 = re.sub(r"(ing|ed|es|s)$", "", target)
    if len(s1) >= 4 and len(s2) >= 4:
        return s1 == s2
    return False


def determine_engagement_mode(
    app_name: str,
    window_title: str,
    intent: str,
) -> tuple[str, int]:
    clean_app, platform, content_title = parse_activity(window_title, app_name)
    combined = f"{clean_app} {platform} {content_title} {window_title} {intent}".lower()

    if platform == "YouTube" or any(t in combined for t in ["video", "lecture", "course", "reading", "pdf", "article", "stream"]):
        return "passive", 900
    if clean_app in ["VS Code", "Cursor", "Terminal", "PyCharm", "Command Prompt", "IntelliJ", "RStudio"] or any(t in combined for t in ["code", "coding", "typing", "editor"]):
        return "interactive", 120
    return "mixed", 300


def evaluate_semantics_offline(
    app_name: str, window_title: str, intent: str
) -> ClassificationResult:
    """
    Evaluates semantic alignment purely from the intent profile and window content:
    - Respects strictness (exclusivity vs flexible).
    - Validates tool + content title for open containers.
    - Zero hardcoded blacklists or application discrimination.
    """
    clean_app, platform, content_title = parse_activity(window_title, app_name)
    title_clean = (content_title or window_title or "").strip()
    profile = parse_intent_profile(intent)

    clean_app_lower = clean_app.lower()
    app_lower = (app_name or "").lower().strip()
    clean_app_nospace = clean_app_lower.replace(" ", "")
    title_lower = title_clean.lower()
    full_title_lower = (window_title or "").lower().strip()
    full_context = f"{clean_app} {platform} {title_clean} {window_title}".lower()

    engagement_mode, idle_allowance_seconds = determine_engagement_mode(app_name, window_title, intent)
    is_ai = _is_generic_ai_assistant(app_name, platform, window_title)
    is_browser = platform in ["Google Chrome", "Brave Browser", "Edge", "Firefox", "Browser"] or "browser" in clean_app_lower
    is_open_container = platform == "YouTube" or is_browser or is_ai or "reddit" in full_context or "twitch" in full_context

    # 1. STRICTNESS ENFORCEMENT
    if profile.strictness == "STRICT":
        tool_matched = False
        matched_named_tool = ""
        for tool in profile.named_tools:
            tool_clean = tool.lower()
            if len(tool_clean) <= 2:
                continue
            if tool_clean in clean_app_lower or tool_clean in app_lower or clean_app_lower in tool_clean:
                tool_matched = True
                matched_named_tool = tool
                break
            if is_browser and tool_clean in ["figma", "github", "overleaf", "youtube", "notion", "chatgpt"]:
                if tool_clean in title_lower or tool_clean in platform.lower():
                    tool_matched = True
                    matched_named_tool = tool
                    break

        if not tool_matched:
            divergence_reason = f"Strict mode: Window '{title_clean[:45]}' on '{clean_app}' is outside your declared exclusive tools ({', '.join(profile.named_tools)})."
            return (
                False,
                divergence_reason,
                "Strict Mode Divergence",
                0.0,
                "strict_mode_unauthorized_tool",
                engagement_mode,
                idle_allowance_seconds,
            )

        # If it matched a declared tool, BUT it's an open container (browser, YouTube, AI chat):
        # Do not return True immediately! Proceed to content validation so off-topic content is flagged!
        if not is_open_container:
            return (
                True,
                f"Strict mode: Active tool '{clean_app}' matches your declared exclusive tool '{matched_named_tool}'.",
                "Aligned Strict Tool",
                1.0,
                "strict_mode_tool_pass",
                engagement_mode,
                idle_allowance_seconds,
            )

    # 2. GENERIC / UNINITIALIZED TITLES GET BENEFIT OF THE DOUBT
    if _is_generic_or_uninitialized(window_title, app_name) or _is_generic_or_uninitialized(title_clean, app_name):
        return (
            True,
            f"Generic window title '{title_clean[:35]}' given benefit of doubt until specific content loads.",
            "Generic Window Benefit of Doubt",
            0.80,
            "generic_title_benefit_of_doubt",
            engagement_mode,
            idle_allowance_seconds,
        )

    # 3. CODE FILE EXTENSION RECOGNITION IN EDITORS
    ext_match = re.search(r"\.(\w+)(?:\s*[-—]|\s*$)", title_lower)
    if ext_match:
        file_ext = ext_match.group(1).lower()
        mapped_lang = EXTENSION_MAPPINGS.get(file_ext)
        if mapped_lang:
            if (mapped_lang in profile.core_tokens or mapped_lang in profile.domain_concepts or
                mapped_lang in profile.raw_intent.lower() or mapped_lang in profile.named_tools):
                return (
                    True,
                    f"Active code file '{title_clean[:45]}' directly matches your declared '{mapped_lang}' programming workflow.",
                    "Aligned Code File",
                    0.95,
                    "code_file_extension_match",
                    engagement_mode,
                    idle_allowance_seconds,
                )

    # 4. DEDICATED TOOL CHECK
    is_open_container = platform == "YouTube" or is_browser or is_ai or "reddit" in full_context or "twitch" in full_context
    named_tool_active = any(
        (t in clean_app_lower or t in app_lower or t in clean_app_nospace)
        for t in profile.named_tools if len(t) > 2
    )

    if named_tool_active and not is_open_container:
        return (
            True,
            f"Active tool '{clean_app}' directly supports your declared workflow ({', '.join(profile.named_tools)}).",
            "Aligned Dedicated Tool",
            0.92,
            "declared_dedicated_tool_match",
            engagement_mode,
            idle_allowance_seconds,
        )

    # Terminal / Dev execution in programming/ML contexts
    is_terminal = any(term in clean_app_lower for term in ["terminal", "powershell", "cmd", "command prompt", "bash"])
    if is_terminal and any(t in profile.domain_concepts for t in ["pytorch", "python", "cpp", "rust", "terraform", "pentest"]):
        if any(kw in title_lower for kw in ["python", "train", "cargo", "gcc", "pytest", "terraform", "nmap"]):
            return (
                True,
                f"Terminal execution '{title_clean[:45]}' directly supports your technical workflow.",
                "Aligned Terminal Process",
                0.90,
                "terminal_execution_match",
                engagement_mode,
                idle_allowance_seconds,
            )

    # 5. CONTENT TITLE EVALUATION FOR OPEN CONTAINERS & DOCUMENTS
    clean_content_for_matching = re.sub(r"\b(chatgpt|claude|gemini|copilot|youtube|google chrome|brave|edge|reddit)\b", " ", title_lower)
    clean_content_for_matching = re.sub(r"[^\w\s+#.]", " ", clean_content_for_matching).strip()

    # A. Check Domain Concept Matches
    matched_domain_concepts = [
        concept for concept in profile.domain_concepts
        if re.search(r"\b" + re.escape(concept) + r"\b", clean_content_for_matching) or
           re.search(r"\b" + re.escape(concept) + r"\b", full_title_lower) or
           any(_stem_match(concept, word) for word in clean_content_for_matching.split())
    ]
    if matched_domain_concepts:
        top_concept = matched_domain_concepts[0]
        return (
            True,
            f"Content '{title_clean[:45]}' relates to domain concept '{top_concept}' within your '{profile.core_subject}' goal.",
            "Aligned Domain Concept",
            0.90,
            "domain_concept_match",
            engagement_mode,
            idle_allowance_seconds,
        )

    # B. Check Direct Core Subject Token Matches (with stemming)
    matched_core_tokens = [
        tok for tok in profile.core_tokens
        if (tok in ["c++", "cpp", "cplusplus"] and any(c in clean_content_for_matching for c in ["c++", "cpp", "cplusplus"])) or
           (tok in ["c#", "csharp"] and any(c in clean_content_for_matching for c in ["c#", "csharp"])) or
           (re.search(r"\b" + re.escape(tok) + r"\b", clean_content_for_matching)) or
           any(_stem_match(tok, word) for word in clean_content_for_matching.split())
    ]
    if matched_core_tokens:
        top_tok = matched_core_tokens[0]
        return (
            True,
            f"Content '{title_clean[:45]}' semantically matches your '{top_tok}' objective.",
            "Aligned Core Subject",
            0.88,
            "core_subject_token_match",
            engagement_mode,
            idle_allowance_seconds,
        )

    # C. Multi-scale TF-IDF Semantic Similarity on Cleaned Content
    norm_intent = _normalize_tech_text(f"{intent} {profile.core_subject}")
    norm_content = _normalize_tech_text(clean_content_for_matching)

    word_sim = 0.0
    char_sim = 0.0
    if len(norm_content) > 3:
        try:
            word_vec = TfidfVectorizer(ngram_range=(1, 2), stop_words="english", sublinear_tf=True)
            word_tfidf = word_vec.fit_transform([norm_intent, norm_content])
            word_sim = float(cosine_similarity(word_tfidf[0:1], word_tfidf[1:2])[0][0])
        except Exception:
            word_sim = 0.0

        try:
            char_vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
            char_tfidf = char_vec.fit_transform([norm_intent, norm_content])
            char_sim = float(cosine_similarity(char_tfidf[0:1], char_tfidf[1:2])[0][0])
        except Exception:
            char_sim = 0.0

    composite_score = (0.65 * word_sim) + (0.35 * char_sim)

    if composite_score >= 0.16:
        return (
            True,
            f"Content '{title_clean[:45]}' semantically serves your declared '{profile.core_subject}' domain (similarity: {composite_score:.2f}).",
            "Aligned Semantic Similarity",
            round(max(composite_score, 0.75), 2),
            "semantic_vector_similarity_match",
            engagement_mode,
            idle_allowance_seconds,
        )

    # Broad focus with neutral work tools
    if profile.is_broad and not is_open_container:
        return (
            True,
            f"Active work tool '{clean_app}' logically supports your general focus session.",
            "Aligned Broad Work",
            0.70,
            "broad_work_pass",
            engagement_mode,
            idle_allowance_seconds,
        )

    # Divergence / Distraction:
    reason = f"Window '{title_clean[:45]}' diverges from your declared goal '{intent[:40]}' (zero semantic overlap with '{profile.core_subject}')."
    return (
        False,
        reason,
        "Divergent Activity",
        round(max(0.0, 1.0 - composite_score), 2),
        "semantic_zero_overlap_divergence",
        engagement_mode,
        idle_allowance_seconds,
    )


# ---------------------------------------------------------------------------
# STATE MACHINE, CACHING & WORKSPACE SESSION MANAGEMENT
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


_semantic_cache = SemanticCache()
_intent_cache = _semantic_cache
_workspace_states: dict[int, dict] = {}
_session_overrides: dict[int, set[str]] = {}
_state_lock = threading.RLock()


def begin_classification(workspace_id: int, target: str) -> int:
    """Register the newest target for a workspace and return its generation."""
    if not workspace_id:
        return 0
    with _state_lock:
        state = _workspace_states.setdefault(workspace_id, {
            "status": "FOCUSED",
            "consecutive_aligned": 0,
            "consecutive_off_intent": 0,
            "session_strikes": 0,
            "last_flagged_time": 0.0,
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
    clear_intent_cache()


def clear_intent_cache(workspace_id: Optional[int] = None):
    _semantic_cache.clear()
    with _state_lock:
        if workspace_id is not None:
            reset_workspace_focus_state(workspace_id)
            _session_overrides.pop(workspace_id, None)
        else:
            _workspace_states.clear()
            _session_overrides.clear()
    logger.info(f"[CACHE] Intent cache and focus states cleared (workspace_id={workspace_id}).")


def reset_workspace_focus_state(workspace_id: int):
    """Clean unlatch: resets workspace state machine back to FOCUSED while preserving session strikes."""
    with _state_lock:
        if workspace_id in _workspace_states:
            st = _workspace_states[workspace_id]
            st["status"] = "FOCUSED"
            st["consecutive_aligned"] = 0
            st["consecutive_off_intent"] = 0
            st["active_distraction_target"] = ""
            st["active_distraction_reason"] = ""
            logger.info(f"[STATE] Workspace {workspace_id} state reset to FOCUSED (latch released).")


def update_focus_state(
    workspace_id: int,
    current_goal: str,
    app_name: str,
    window_title: str,
    is_focused: bool,
    reason: str,
    is_cache_hit: bool = False,
) -> tuple[str, str]:
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
        "status": "FOCUSED",
        "consecutive_aligned": 0,
        "consecutive_off_intent": 0,
        "session_strikes": 0,
        "last_flagged_time": 0.0,
        "last_target": "",
        "last_goal": current_goal,
        "active_distraction_target": "",
        "active_distraction_reason": "",
        "generation": 0,
        "active_target": "",
    })

    # Goal updated: complete reset
    if state.get("last_goal") != current_goal:
        state["status"] = "FOCUSED"
        state["consecutive_aligned"] = 0
        state["consecutive_off_intent"] = 0
        state["session_strikes"] = 0
        state["last_flagged_time"] = 0.0
        state["last_target"] = ""
        state["last_goal"] = current_goal
        state["active_distraction_target"] = ""
        state["active_distraction_reason"] = ""
        clear_intent_cache(workspace_id)
        state = _workspace_states[workspace_id]
        logger.info(f"[STATE] Goal updated for workspace {workspace_id}. State reset and cache cleared.")

    clean_app, _, content_title = parse_activity(window_title, app_name)
    title_clean = content_title or window_title
    app_lower = app_name.lower().strip()
    title_lower = window_title.lower().strip()
    current_target = f"{app_lower}:{title_lower[:40]}"

    is_prodify = (
        title_lower == "prodify"
        or title_lower.startswith("prodify")
        or app_lower in ["prodify.exe", "prodify", "app.exe"]
    )
    _OS_SHELLS = {"explorer.exe", "shellexperiencehost.exe", "snippingtool.exe", "screenclippinghost.exe", "taskmgr.exe"}
    is_neutral = is_prodify or (app_lower in _OS_SHELLS and title_lower in ["", "running applications", "task view", "task switch", "snap assist"])

    if is_neutral:
        active_reason = state.get("active_distraction_reason") or "Neutral system window"
        out_status = "distracted" if state["status"] == "DISTRACTED" else "focused"
        logger.info(
            f"[INTENT TICK] normalized title: '{title_clean[:50]}' | detected tool: '{clean_app}' | "
            f"verdict: NEUTRAL | reason: '{active_reason}' | state: {state['status']} | "
            f"bad: {state['consecutive_off_intent']} | good: {state['consecutive_aligned']} | strikes: {state['session_strikes']}"
        )
        return out_status, active_reason

    if is_focused:
        state["consecutive_off_intent"] = 0
        state["consecutive_aligned"] += 1

        # Recovery: 2 consecutive ALIGNED ticks clears counters and releases latch
        if state["consecutive_aligned"] >= 2:
            state["status"] = "FOCUSED"
            state["active_distraction_target"] = ""
            state["active_distraction_reason"] = ""
            out_status = "focused"
            out_reason = reason
        else:
            if state["status"] == "DISTRACTED":
                out_status = "focused"
                out_reason = "Realigning focus (1/2 ticks)..."
            else:
                out_status = "focused"
                out_reason = reason
    else:
        state["consecutive_aligned"] = 0
        state["consecutive_off_intent"] += 1

        now = time.time()
        time_since_last_flag = (now - state["last_flagged_time"]) if state["last_flagged_time"] > 0 else 999999.0
        is_repeat_offender = (state["last_flagged_time"] > 0 and time_since_last_flag <= 600.0)

        # REPEAT OFFENDER: immediate trigger with NO grace
        if is_repeat_offender:
            state["status"] = "DISTRACTED"
            state["session_strikes"] += 1
            state["last_flagged_time"] = now
            state["active_distraction_target"] = current_target
            state["active_distraction_reason"] = reason
            out_status = "distracted"
            out_reason = reason
        else:
            # FIRST OFFENCE: 2 grace ticks, tick 3 PENDING, tick 4 DISTRACTED
            if state["consecutive_off_intent"] <= 2:
                out_status = "focused"
                out_reason = f"Grace notice: '{title_clean[:35]}' may be off-task"
            elif state["consecutive_off_intent"] == 3:
                state["status"] = "PENDING"
                state["session_strikes"] = 1
                state["last_flagged_time"] = now
                state["active_distraction_target"] = current_target
                state["active_distraction_reason"] = reason
                out_status = "focused"
                out_reason = f"Warning: '{title_clean[:35]}' diverges from declared goal"
            else:
                state["status"] = "DISTRACTED"
                state["session_strikes"] += 1
                state["last_flagged_time"] = now
                state["active_distraction_target"] = current_target
                state["active_distraction_reason"] = reason
                out_status = "distracted"
                out_reason = reason

    logger.info(
        f"[INTENT TICK] normalized title: '{title_clean[:50]}' | detected tool: '{clean_app}' | "
        f"verdict: {'ALIGNED' if is_focused else 'OFF_INTENT'} | reason: '{out_reason}' | "
        f"state: {state['status']} | bad: {state['consecutive_off_intent']} | "
        f"good: {state['consecutive_aligned']} | strikes: {state['session_strikes']}"
    )

    return out_status, out_reason


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
    if app_lower in OS_SYSTEM_UTILITIES and title_lower in ["", "running applications", "task view", "task switch", "snap assist"]:
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

    cached = _semantic_cache.get(app_name, window_title, intent)
    if cached is not None:
        if len(cached) == 7:
            is_focused, reason, summary, similarity_score, local_rule_match, engagement_mode, idle_allowance_seconds = cached
        else:
            is_focused, reason, summary, similarity_score, local_rule_match = cached[:5]
            engagement_mode, idle_allowance_seconds = determine_engagement_mode(app_name, window_title, intent)
        is_cache_hit = True
    else:
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
