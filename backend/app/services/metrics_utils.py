"""Shared metric formulas used by API and analytics code."""


def focus_purity_percent(total_seconds: float, distracted_seconds: float) -> float:
    """Return focused time as a percentage of the recorded session duration."""
    total = max(0.0, float(total_seconds or 0.0))
    distracted = max(0.0, float(distracted_seconds or 0.0))
    if total <= 0.0:
        return 0.0
    focused = max(0.0, total - distracted)
    return round((focused / total) * 100.0, 1)
