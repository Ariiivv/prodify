"""Local keyboard/mouse inactivity policy used by telemetry endpoints."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class InputActivityVerdict:
    status: str
    reason: str
    threshold_seconds: int
    contextual_alignment: str


_BASE_THRESHOLDS = {
    "mastery": 120,
    "sprint": 90,
    "quick_work": 180,
    "casual": 180,
    "quick_flow": 180,
}

_PASSIVE_CONTEXT_TERMS = (
    "video", "lecture", "course", "documentation", "docs", "research",
    "paper", "reader", "reading", "tutorial", "reference", "presentation",
)


def evaluate_input_activity(
    *,
    category: str | None,
    idle_seconds: float,
    keystrokes: int,
    clicks: int,
    aligned: bool,
    window_title: str = "",
    app_name: str = "",
) -> InputActivityVerdict:
    """Classify inactivity locally without external services."""
    normalized_category = (category or "mastery").lower()
    base = _BASE_THRESHOLDS.get(normalized_category, _BASE_THRESHOLDS["mastery"])
    context = f"{window_title} {app_name}".lower()
    passive = aligned and any(term in context for term in _PASSIVE_CONTEXT_TERMS)
    threshold = base * (3 if passive else 1)
    idle = max(0.0, float(idle_seconds or 0.0))

    if idle < threshold:
        return InputActivityVerdict(
            status="focused" if aligned else "pending",
            reason="Input activity is within the contextual inactivity allowance.",
            threshold_seconds=threshold,
            contextual_alignment="passive_aligned" if passive else ("aligned" if aligned else "unclassified"),
        )
    if passive:
        return InputActivityVerdict(
            status="focused",
            reason="Passive aligned activity is allowed an extended inactivity window.",
            threshold_seconds=threshold,
            contextual_alignment="passive_aligned",
        )
    if keystrokes > 0 or clicks > 0:
        return InputActivityVerdict(
            status="focused" if aligned else "pending",
            reason="Recent keyboard or mouse activity was observed.",
            threshold_seconds=threshold,
            contextual_alignment="aligned" if aligned else "unclassified",
        )
    return InputActivityVerdict(
        status="distracted",
        reason=f"No keyboard or mouse input detected for {round(idle)} seconds.",
        threshold_seconds=threshold,
        contextual_alignment="aligned_idle_timeout" if aligned else "unclassified_idle_timeout",
    )
