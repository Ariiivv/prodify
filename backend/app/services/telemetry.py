"""
Telemetry Service and Semantic Intent Classification Engine.
Exposes the complete dynamic intent evaluation API, parsing, and caching.
"""

from app.services.intent_classifier import (
    ClassificationResult,
    IntentProfile,
    SemanticCache,
    parse_intent_profile,
    evaluate_semantics_offline,
    determine_engagement_mode,
    classify_with_intent,
    update_focus_state,
    reset_workspace_focus_state,
    clear_intent_cache,
    clear_semantic_cache,
    allow_window_for_session,
    begin_classification,
    is_current_classification,
)

__all__ = [
    "ClassificationResult",
    "IntentProfile",
    "SemanticCache",
    "parse_intent_profile",
    "evaluate_semantics_offline",
    "determine_engagement_mode",
    "classify_with_intent",
    "update_focus_state",
    "reset_workspace_focus_state",
    "clear_intent_cache",
    "clear_semantic_cache",
    "allow_window_for_session",
    "begin_classification",
    "is_current_classification",
]
