# Phase 1: Focus Engine — Architecture & Design Document

## 1. Current State Analysis & Pain Points

### 1.1 Fragmented Distraction Sources
| Source | Location | Behavior | Problem |
|--------|----------|----------|---------|
| Tab Visibility | `useTabVisibility.ts` | 15s debounce → direct `timerStore.pauseFocus()` + raw `fetch()` to telemetry | Bypasses any central state; hardcodes timeout; re-renders on every visibility toggle |
| Camera Distraction | `WebcamStream.tsx` | WebSocket message → `onDistractionDetected` callback → `WorkspacePage.handleDistraction` → toast + `pauseFocus` | No debounce at all; a single blink triggers full pause; re-render cascade via prop callback |
| Manual Override | `WorkspacePage.tsx` | Local `useState` toggle + inline `isWorkSite()` | Whitelist logic duplicated (would need to be re-implemented in every consuming page); local state can't be shared across components |

### 1.2 Root Causes of Re-render Loops & False Positives
1. **No unified event bus** — Both hooks call `timerStore.pauseFocus()` independently, creating race conditions.
2. **Zero grace period on camera** — A momentary eye closure (blink) triggers `onDistractionDetected` instantly with no cooldown window.
3. **Tab visibility debounce is isolated** — The 15s window exists only for tab switches, not camera events.
4. **Prop-drilled callback** — `WebcamStream` receives `onDistractionDetected` as a prop, which changes every render, causing the WebSocket effect to re-run.
5. **Whitelist lives in a component** — `isWorkSite()` in `WorkspacePage.tsx` is untestable, unreachable from hooks, and cannot persist across navigation.

---

## 2. Proposed Architecture: FocusContext

### 2.1 Overview
A single `FocusContext` React context (backed by a Zustand store for external access) becomes the **sole source of truth** for all distraction events. Both `useTabVisibility` and `WebcamStream` push events into this context. The context applies:

1. **Grace Period / Debounce** — Configurable cooldown window (default: 3s for camera, 15s for tab switch).
2. **Whitelist Filter** — A registry of "work site" origins that suppress distraction events.
3. **Manual Override** — A user-toggle that bypasses all detection.
4. **Telemetry Dispatch** — A centralized, debounced POST to the backend with a `reason` field.

### 2.2 Data Flow Diagram

```
┌──────────────────┐     ┌──────────────────────────────────────────┐     ┌───────────────┐
│  useTabVisibility│────▶│                                          │     │  TimerStore   │
│  (visibilitychange)   │    FocusContext / useFocusGuard           │────▶│  .pauseFocus()│
└──────────────────┘     │                                          │     └───────────────┘
                         │  ┌─────────────────────────────────┐    │
┌──────────────────┐     │  │  - Grace Period Timer            │    │     ┌───────────────┐
│  WebcamStream    │────▶│  │  - Whitelist Filter              │    │────▶│  Telemetry    │
│  (face tracking) │     │  │  - Manual Override State         │    │     │  POST /api/   │
└──────────────────┘     │  │  - Reason Enrichment             │    │     │  telemetry/   │
                         │  │  - Debounced Dispatch            │    │     │  distraction  │
┌──────────────────┐     │  └─────────────────────────────────┘    │     └───────────────┘
│  Manual Override │────▶│                                          │
│  (UI toggle)     │     └──────────────────────────────────────────┘
└──────────────────┘
```

### 2.3 Core Interface

```typescript
// FocusEvent types — a discriminated union
type FocusEventReason = 
  | 'camera_absence'      // Face not detected by webcam
  | 'camera_distracted'   // Gaze away / PERCLOS threshold exceeded
  | 'tab_switch'          // document.visibilityState === 'hidden'
  | 'window_blur'         // window lost focus
  | 'manual_override'     // User explicitly paused tracking
  | 'resumed';            // User re-enabled tracking

interface FocusEvent {
  reason: FocusEventReason;
  timestamp: number;        // Date.now()
  workspaceId: number;
  metadata?: {
    perclosScore?: number;
    duration?: number;       // ms since last focus event
  };
}

// The context value
interface FocusGuardContextValue {
  // State
  isDistracted: boolean;
  isTrackingEnabled: boolean;
  isOnWhitelistedSite: boolean;
  currentReason: FocusEventReason | null;
  gracePeriodRemaining: number;  // ms remaining in current grace window

  // Actions
  reportFocusLost: (event: Omit<FocusEvent, 'timestamp' | 'workspaceId'>) => void;
  reportFocusResumed: () => void;
  toggleManualOverride: () => void;
  
  // Config
  gracePeriods: {
    camera: number;    // default 3000ms
    tabSwitch: number; // default 15000ms
    windowBlur: number; // default 15000ms
  };
  
  // Whitelist
  whitelist: string[];  // hostnames that never trigger distraction
  addToWhitelist: (hostname: string) => void;
  removeFromWhitelist: (hostname: string) => void;
}
```

### 2.4 Grace Period Logic (Pseudo-code)

```
onFocusLost(reason):
  if isOnWhitelistedSite or !isTrackingEnabled:
    return  // suppressed
  
  currentReason = reason
  start graceTimer for gracePeriods[reason.category]
  
  if graceTimer already running for a DIFFERENT reason:
    restart with longer of (remaining time, default for new reason)
  // ^ This handles overlapping detections (e.g. turned away + switched tab)

onGraceTimerExpire():
  if !isDistracted:
    isDistracted = true
    timerStore.pauseFocus(currentReason)
    dispatchTelemetry(currentReason)

onFocusResumed():
  if graceTimer is running:
    clear graceTimer  // user returned within grace window
  // Don't reset isDistracted immediately — user must prove sustained focus
```

### 2.5 Whitelist Subsystem

```typescript
// Default whitelist — stored in FocusContext, configurable per workspace
const DEFAULT_WHITELIST = [
  'github.com',
  'stackoverflow.com', 
  'docs.python.org',
  'docs.npmjs.com',
  'developer.mozilla.org',
  'localhost',
  'vercel.app',
];

// Matching logic
function isWhitelisted(whitelist: string[]): boolean {
  const hostname = window.location.hostname;
  return whitelist.some(site => hostname === site || hostname.endsWith('.' + site));
}
```

### 2.6 Zustand Power — Dual Architecture

The `FocusContext` will be built on top of a Zustand store (named `useFocusGuardStore`) for two reasons:
1. **Zustand for non-React code** — `useTabVisibility` and `WebcamStream` can call `useFocusGuardStore.getState().reportFocusLost()` without being inside a React tree or wrapped in providers.
2. **React Context for UI** — The context wraps the React tree so UI components can subscribe via `useFocusGuard()` and re-render efficiently on state changes.

```typescript
// Internal Zustand store (accessed by hooks directly)
const useFocusGuardStore = create<FocusGuardState>()(...);

// React Context wrapper (exposes same API to components)
function FocusGuardProvider({ children, workspaceId }: Props) {
  // ...
  return <FocusGuardContext.Provider value={contextValue}>{children}</FocusGuardContext.Provider>;
}

// Hook for UI components
function useFocusGuard(): FocusGuardContextValue {
  return useContext(FocusGuardContext);
}

// Standalone access for non-React code
const reportFocusLost = useFocusGuardStore.getState().reportFocusLost;
```

---

## 3. Refactored Component Responsibilities

### 3.1 `useTabVisibility.ts` — AFTER

```typescript
// No more direct timerStore or fetch calls.
// Simply: detect visibility change → push event to FocusGuardStore.
export function useTabVisibility() {
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        useFocusGuardStore.getState().reportFocusLost({ reason: 'tab_switch' });
      } else {
        useFocusGuardStore.getState().reportFocusResumed();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
}
```

### 3.2 `WebcamStream.tsx` — AFTER

```typescript
// No more onDistractionDetected prop.
// No more isEnabled prop (FocusGuardStore handles that internally).
// Simply: receive WS message → push event to FocusGuardStore.
export default function WebcamStream() {
  // ... websocket setup ...
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.distracted) {
      useFocusGuardStore.getState().reportFocusLost({ 
        reason: 'camera_absence',
        metadata: { perclosScore: data.perclos }
      });
    } else {
      useFocusGuardStore.getState().reportFocusResumed();
    }
  };
  // ...
}
```

### 3.3 `WorkspacePage.tsx` — AFTER

```typescript
// No more handleDistraction, isWorkSite, isManualOverride.
// No more enforcementTriggered from useTabVisibility.
// All those are managed by FocusGuard + FocusGuardProvider.

export default function WorkspacePage() {
  const { id } = useParams();
  const { isDistracted, isTrackingEnabled, toggleManualOverride } = useFocusGuard();
  
  // EnforcementModal reads from FocusGuard context
  // Manual override button reads from FocusGuard context
  // Everything is unified.
}
```

---

## 4. State Shape for FocusGuardStore

```typescript
interface FocusGuardState {
  // Core state
  isDistracted: boolean;
  currentReason: FocusEventReason | null;
  isTrackingEnabled: boolean;
  
  // Grace period
  graceTimerId: ReturnType<typeof setTimeout> | null;
  gracePeriodRemaining: number;
  graceStartedAt: number | null;
  
  // Configuration
  gracePeriods: {
    camera_absence: number;
    camera_distracted: number;
    tab_switch: number;
    window_blur: number;
  };
  whitelist: string[];
  
  // Workspace context (set by provider)
  workspaceId: number | null;
  
  // Actions
  reportFocusLost: (event: Omit<FocusEvent, 'timestamp' | 'workspaceId'>) => void;
  reportFocusResumed: () => void;
  toggleManualOverride: () => void;
  setWhitelist: (list: string[]) => void;
  setGracePeriods: (periods: Partial<FocusGuardState['gracePeriods']>) => void;
  setWorkspaceId: (id: number) => void;
  reset: () => void;
}
```

---

## 5. Telemetry Enrichment (Phase 2 Design Input)

The telemetry endpoint will be called with an enriched payload:

```typescript
// New DistractionLog shape for Phase 2
interface DistractionLogV2 {
  workspace_id: number;
  distraction_type: string;       // legacy — keep for backward compat
  reason: FocusEventReason;       // NEW — structured reason
  timestamp: string;
  session_id?: number;            // NEW — link to active session
  metadata?: {
    perclos_score?: number;
    was_grace_period_hit?: boolean;
    grace_duration_ms?: number;
  };
}
```

The backend `TelemetryLog` model will gain a `reason` column (String, nullable) and a `metadata` JSON column.

---

## 6. Migration Path (Phase 3 Implementation Order)

| Step | File(s) | Change |
|------|---------|--------|
| 1 | `frontend/src/store/focusGuardStore.ts` | Create the Zustand store with grace period logic, whitelist, actions |
| 2 | `frontend/src/context/FocusGuardContext.tsx` | Create React context + provider that wraps the store |
| 3 | `backend/database/models.py` | Add `reason` and `metadata` columns to `TelemetryLog` (Phase 2) |
| 4 | `backend/routers/telemetry.py` | Accept `reason` in `DistractionLog`, store it (Phase 2) |
| 5 | `frontend/src/hooks/useTabVisibility.ts` | Refactor to push events to FocusGuardStore only |
| 6 | `frontend/src/components/workspace/WebcamStream.tsx` | Refactor to push events to FocusGuardStore only; remove props |
| 7 | `frontend/src/pages/WorkspacePage.tsx` | Remove local distraction logic; consume from FocusGuard; wrap in Provider |
| 8 | `frontend/src/App.tsx` | Add `FocusGuardProvider` at root level |
| 9 | Cleanup | Remove dead code, verify no re-render loops exist |

---

## 7. Re-render Prevention Strategy

| Anti-pattern | Fix in New Architecture |
|-------------|------------------------|
| `onDistractionDetected` prop causes effect re-run | Remove the prop entirely — `WebcamStream` calls `useFocusGuardStore.getState()` directly (outside React lifecycle) |
| `useTabVisibility` effect has `[]` deps but should respond to workspace changes | Use a ref to track workspace ID from the Zustand store; effect re-registration only on mount/unmount |
| `WorkspacePage` re-renders on every timer tick (1s) | `useFocusGuard()` subscribes to `focusGuardStore` with selectors that only change on distraction events, not timer ticks |
| Toast + timer pause + fetch happen in same microtask | Grace period timer defers the pause; dispatch is debounced at 1s intervals via a `setTimeout` chain, not per-event |

---

## 8. Key Design Decisions

1. **Zustand over raw React Context for state** — Prevents re-renders of the entire tree when only one slice of state changes. Context only used for dependency injection (workspace ID, whitelist config).
2. **Grace period per reason category** — Camera distractions (3s) are naturally faster to recover from than tab switches (15s). Different cooldowns prevent false positives without making the system sluggish.
3. **Grace timer merging** — If two reasons fire within the same window (e.g., user leaves AND camera detects absence), the timer extends to cover both. This prevents double-penalty.
4. **No immediate pause** — The system never pauses on first event. It always waits for the grace period to expire. This is the single most important change to eliminate false positives.
5. **Whitelist in store, not component** — Allows `useTabVisibility` (which runs outside any component tree) to check the whitelist before dispatching events. Also enables persistence across sessions.
6. **Reason field on telemetry** — Enables analytics to distinguish "user switched tabs" from "user left their desk" from "user paused manually". Critical for accurate ML training data.