# PRODIFY: Production Architecture & System Design

> **Version:** v1.0.0 (Stable Release)  
> **Last Updated:** June 11, 2026

---

## 1. System Overview

Prodify is a full-stack, AI-powered productivity intelligence platform. It replaces static timers with a dynamic system driven by browser telemetry, real-time computer vision, and a localized machine learning engine. The system profiles user focus, identifies cognitive friction, and passes structured behavioral data to a generative AI coach that provides personalized productivity mentorship.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React 19 + Vite 8)                  │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Dashboard │  │ Workspace    │  │ Analytics │  │ AI Coach     │ │
│  │ (HomePage)│  │ Page         │  │ Page      │  │ Chat Panel   │ │
│  └────┬─────┘  └──────┬───────┘  └─────┬─────┘  └──────┬───────┘ │
│       │               │                │               │         │
│  ┌────┴───────────────┴────────────────┴───────────────┴───────┐ │
│  │                    Zustand Timer Store                        │ │
│  │    Record<workspaceId, WorkspaceTimerState> (FSM)            │ │
│  └───────────────────────────────────────────────────────────────┘ │
│       │               │                                           │
│  ┌────┴───────────────┴───────────────────────────────────────┐  │
│  │              API Layer (fetch + TanStack Query)              │  │
│  └────┬───────────────┬────────────────────────────────────────┘  │
│       │               │                                           │
│  ┌────┴───────────────┴───────────────────────────────────────┐  │
│  │   WebSocket (wss://)  ◄───  Webcam Frames (base64)         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
         │ HTTP REST (JSON)             │ WebSocket (base64 frames)
         ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI + Python 3.12)               │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Workspace│  │ Telemetry    │  │ ML         │  │ AI Coach     │ │
│  │ CRUD     │  │ Router       │  │ Predictions│  │ Router       │ │
│  └────┬─────┘  └──────┬───────┘  └─────┬─────┘  └──────┬───────┘ │
│       │               │                │               │         │
│  ┌────┴───────────────┴────────────────┴───────────────┴───────┐ │
│  │                     application.py (main)                     │ │
│  │  app = FastAPI() + CORS + exception handlers                 │ │
│  └───────────────────────────┬───────────────────────────────────┘ │
│                              │                                     │
│  ┌───────────────────────────┴───────────────────────────────────┐ │
│  │                    SQLAlchemy ORM Layer                        │ │
│  │  models: User, Workspace, Session, TelemetryLog               │ │
│  └───────────────────────────┬───────────────────────────────────┘ │
│                              │                                     │
│  ┌───────────────────────────┴───────────────────────────────────┐ │
│  │               SQLite Database (prodify.db)                     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema (SQLite + SQLAlchemy)

The database consists of four models managed via SQLAlchemy ORM, stored in a local `prodify.db` file.

### Entity Relationship Diagram

```
┌─────────────┐       ┌────────────────┐
│    User     │       │   Workspace    │
├─────────────┤       ├────────────────┤
│ id (PK)     │◄──────│ id (PK)        │
│ username    │1   N  │ user_id (FK)   │
│ email       │       │ name           │
│ hashed_pass │       │ mode           │
│ created_at  │       │ target_hours   │
│ updated_at  │       │ deadline       │
└─────────────┘       │ work_duration  │
                      │ break_duration │
                      │ created_at     │
                      │ updated_at     │
                      └───────┬────────┘
                              │
                     ┌────────┴────────┐
                     │    Session      │
                     ├─────────────────┤
                     │ id (PK)         │
                     │ workspace_id(FK)│
                     │ start_time      │
                     │ end_time        │
                     │ duration (secs) │
                     │ session_type    │
                     │ status          │
                     │ pause_reason    │
                     └────────┬────────┘
                              │
                     ┌────────┴────────────┐
                     │   TelemetryLog      │
                     ├─────────────────────┤
                     │ id (PK)             │
                     │ workspace_id (FK)   │
                     │ session_id (FK)     │
                     │ timestamp           │
                     │ metric_type         │
                     │ value (Float)       │
                     │ distraction_type    │
                     │ reason              │
                     │ metadata_json       │
                     └─────────────────────┘
```

### Model Details

| Model | Table | Key Fields | Purpose |
|-------|-------|------------|---------|
| **User** | `users` | id, username, email, hashed_password | User accounts (future auth) |
| **Workspace** | `workspaces` | id, user_id, name, mode, target_hours, deadline, work_duration, break_duration | Container for focus sessions with configurable Pomodoro settings |
| **Session** | `sessions` | id, workspace_id, start_time, end_time, duration, session_type (FOCUS/BREAK), status (COMPLETED/PAUSED/ABORTED) | Individual focus or break sessions |
| **TelemetryLog** | `telemetry_logs` | id, workspace_id, session_id, timestamp, metric_type, value, distraction_type, reason, metadata_json | All distraction events with rich metadata |

---

## 3. Frontend Architecture (React + Zustand)

### 3.1 Routing Structure

```
/                 → HomePage (Dashboard)
/workspace/:id    → WorkspacePage (Timer + Vision + Coach)
/analytics        → Analytics Page (Recharts dashboards)
```

Routes are wrapped in `AppLayout` which provides the shared shell. `TanStack Query` manages API data fetching/caching. `ScrollToTop` ensures route transitions start at the top.

### 3.2 Component Tree

```
App
└── QueryClientProvider
    └── BrowserRouter
        └── Routes
            ├── AppLayout (Shell)
            │   ├── HomePage
            │   │   ├── AnimatedBackground
            │   │   ├── DailyGoalRing
            │   │   ├── ScrambleNumber (×4 stat cards)
            │   │   ├── WorkspaceCard (grid)
            │   │   ├── CreateWorkspaceDialog
            │   │   └── RecentActivity
            │   │
            │   ├── WorkspacePage
            │   │   ├── TimerRing (SVG countdown)
            │   │   ├── TimerControls (Start/Pause/Resume/Reset/Skip)
            │   │   ├── WebcamStream (MediaPipe vision feed)
            │   │   ├── BurnoutGauge (focus vitality)
            │   │   ├── SessionStats
            │   │   ├── EnforcementModal
            │   │   ├── AiCoachPanel (floating chat)
            │   │   └── Idle status card
            │   │
            │   └── Analytics
            │       └── AnalyticsPanel (Recharts)
            └── ScrollToTop
```

### 3.3 State Management (Zustand Timer FSM)

The timer is modeled as a deterministic finite state machine (FSM) with 6 states:

```
         ┌──────────────────────────────────────────────┐
         │                                              │
         ▼                                              │
    ┌──────────┐  startFocus  ┌──────────────┐  tick=0  ┌──────────────────┐
    │   IDLE   │─────────────▶│ FOCUS_RUNNING │─────────▶│ SESSION_COMPLETED│
    └──────────┘              └───────┬───────┘          └──────────────────┘
                                      │
                           pauseFocus │ resumeFocus
                                      │
                                      ▼
                              ┌────────────────┐
                              │ FOCUS_PAUSED    │
                              └────────────────┘
                                      │
                           startBreak │
                                      ▼
                              ┌────────────────┐  tick=0  ┌──────────────────┐
                              │ BREAK_RUNNING   │─────────▶│ SESSION_COMPLETED│
                              └───────┬────────┘          └──────────────────┘
                                      │
                           pauseBreak │ resumeBreak
                                      ▼
                              ┌────────────────┐
                              │ BREAK_PAUSED    │
                              └────────────────┘
```

**Key design decisions:**
- **Per-workspace isolation** — State is stored as `Record<workspaceId, WorkspaceTimerState>` so switching between workspaces never corrupts timer state.
- **Drift-resistant intervals** — Uses `performance.now()` delta tracking in the `setInterval` callback to correct for browser throttling when tabs are backgrounded.
- **Convenience exports** — Standalone functions (`startFocus()`, `pauseFocus()`, etc.) exported from `lib/timerStore.ts` for direct store access outside React hooks.

### 3.4 Custom Hooks

| Hook | Purpose |
|------|---------|
| `useTabVisibility` | Monitors `document.visibilityState` and `window.blur` events to detect tab switches. Returns `enforcementTriggered` boolean and `setEnforcementTriggered` setter. |
| `useIdleDetection` | Tracks keyboard (`keydown`) and mouse (`mousemove`, `click`) activity. Fires `onIdle` callback after configurable timeout (default 60s). Returns `isIdle` boolean and `idleTime` in milliseconds. |
| `use-mobile` | Responsive breakpoint detection for UI adaptations. |

---

## 4. Backend Architecture (FastAPI)

### 4.1 Application Entry Point (`backend/main.py`)

- **FastAPI app** with title "Prodify API"
- **CORS middleware** configured for `http://localhost:5173` and `http://127.0.0.1:5173`
- **422 error logging** via `RequestValidationError` exception handler for debugging
- **Startup event** creates database tables (`create_db_and_tables()`)
- **Three routers** mounted at `/api` prefix

### 4.2 Router Structure

```
main.py
├── Root Routes (inline)
│   ├── POST /workspaces        → crud.create_workspace()
│   └── GET  /workspaces        → crud.get_workspaces()
│
├── WebSocket
│   └── WS /vision              → FocusTracker.process_frame()
│
├── /api/ml_predictions
│   └── GET /ml/burnout-prediction  → RandomForest inference
│
├── /api/ai_coach
│   ├── POST /ai-coach/chat         → Groq Llama-3.3-70b chat
│   └── POST /ai-coach/function-call → Autonomous workspace creation
│
└── /api/telemetry
    ├── GET  /telemetry/sessions              → Recent sessions
    ├── GET  /telemetry/total-sessions         → Total count
    ├── GET  /telemetry/total-sessions/{ws_id} → Per-workspace count
    ├── POST /telemetry/distraction            → Log distraction
    ├── GET  /telemetry/focus-density/{ws_id}  → Focus Density Score
    ├── GET  /telemetry/distraction-velocity/{ws_id} → Rolling metric
    └── GET  /telemetry/volumetric-efficiency  → Cross-workspace comparison
```

### 4.3 CRUD Layer (`backend/crud.py`)

- `create_workspace()` — Creates a new workspace with configurable work/break durations
- `get_workspaces()` — Paginated listing (skip/limit)
- `get_workspace()` — Single workspace by ID
- `update_workspace()` — Full workspace update
- `share_workspace()` — Reassigns workspace ownership

### 4.4 Data Flow: Distraction Detection Pipeline

```
User Tab Switch or Camera Absence
         │
         ▼
┌──────────────────────┐
│ Frontend Detection    │
│ (useTabVisibility /   │
│  WebcamStream/        │
│  useIdleDetection)    │
└─────────┬────────────┘
          │
          ├── Tab Switch: POST /api/telemetry/distraction
          │   { workspace_id, distraction_type: "TAB_SWITCH", timestamp }
          │
          ├── Camera Absence: POST /api/telemetry/distraction
          │   { distraction_type: "FATIGUE_EYE_CLOSURE", ... }
          │
          └── Timer Action: pauseFocus("Distraction detected")
              (via Zustand store.incrementDistraction())
```

---

## 5. Computer Vision Pipeline (MediaPipe)

### 5.1 Architecture

```
Frontend Browser                    Backend (FastAPI)
┌─────────────────┐                 ┌─────────────────────┐
│ getUserMedia()   │  WebSocket     │ FocusTracker class  │
│ → webcam stream  │───────────────▶│                     │
│                  │  base64 frame  │ MediaPipe Tasks     │
│ react-webcam     │◀───────────────│ FaceDetector        │
│ Canvas capture   │  JSON status   │                     │
└─────────────────┘                 │ - focused/distracted│
                                    │ - error             │
                                    └─────────────────────┘
```

### 5.2 FocusTracker Class

```python
class FocusTracker:
    def __init__(self, distraction_timeout: float = 5.0):
        self.distraction_timeout = 5.0  # seconds before flagging distracted
        self._last_face_seen: float = time.time()
        self._current_status: str = "focused"

    def process_frame(self, base64_string: str) -> dict:
        # 1. Decode base64 → OpenCV frame
        # 2. Check brightness (pitch-black < 15 → no face)
        # 3. Convert RGB → mediapipe.Image
        # 4. Run FaceDetector.detect()
        # 5. If face found → reset timer, set status="focused"
        # 6. If no face > timeout → set status="distracted"
        # 7. Return {"status": "focused"|"distracted"}
```

### 5.3 Key Design Decisions

- **Server-Side Processing** — Frames are sent to backend over WebSocket rather than processed client-side, keeping the React bundle lightweight and leveraging Python's MediaPipe bindings.
- **Privacy** — No frames or images are persisted; they are decoded, processed, and immediately garbage-collected.
- **Resilience** — Single bad frames log errors but don't terminate the WebSocket connection. The connection only closes on `WebSocketDisconnect` or unexpected errors.
- **Auto-Download** — The `blaze_face_short_range.tflite` model downloads automatically on first use from Google's CDN.

---

## 6. AI Coach Architecture

### 6.1 Chat Flow

```
User Message
    │
    ▼
┌────────────────────┐
│ AiCoachPanel.tsx    │  (React component)
│ - Captures message   │
│ - Attaches session   │
│   context payload    │
└─────────┬──────────┘
          │ POST /api/ai-coach/chat
          │ {
          │   message, workspace_name, workspace_mode,
          │   focus_minutes, distraction_count, idle_seconds,
          │   burnout_probability, current_state,
          │   session_count, time_remaining
          │ }
          ▼
┌─────────────────────────────────────┐
│ ai_coach.py                          │
│                                      │
│ if GROQ_API_KEY exists:              │
│   → Build dynamic system prompt      │
│     with live context injection      │
│   → Call Groq Llama-3.3-70b          │
│   → Return AI response               │
│ else:                                │
│   → Return rule-based fallback       │
│     (burnout analysis, focus tips,   │
│      motivation, timer feedback)     │
└─────────┬───────────────────────────┘
          │
          ▼
    Response displayed in chat UI
```

### 6.2 Function Calling (Autonomous Workspace Creation)

```
User: "Create a deep focus workspace for ML studying for 60 minutes"
    │
    ▼
POST /api/ai-coach/function-call
    │
    ▼
Groq extracts structured intent:
{
  "intent": "create_workspace",
  "workspace_config": {
    "name": "ML Studying Deep Focus",
    "mode": "Structured Goal Mode",
    "work_duration": 60,
    "break_duration": 5
  },
  "explanation": "Created a deep focus workspace for ML study sessions"
}
    │
    ▼
crud.create_workspace() → SQLite INSERT
    │
    ▼
Response with workspace details → Frontend refreshes workspace list
```

---

## 7. Analytics & Metrics Pipeline

### 7.1 Focus Density Score

```
FDS = max(0, (total_focus_seconds - penalty) / total_focus_seconds)
where penalty = min(distraction_count * 30s, total_focus_seconds)
```

A ratio from 0.0 to 1.0 where each distraction event penalizes 30 seconds of focus time.

### 7.2 Distraction Velocity

Rolling metric calculated from sliding windows of tab-switch timestamps:

```
velocity = window_size / time_span * 60  (distractions per minute)
window_size = min(5, len(logs))
```

### 7.3 Burnout Prediction (ML)

```
GET /api/ml/burnout-prediction?current_hour=14&current_focus_minutes=35
  → {
      tab_switch_probability: 0.42,
      fatigue_eye_closure_probability: 0.18
    }
```

- **Model:** RandomForestClassifier (scikit-learn)
- **Features:** `hour_of_day`, `focus_duration_minutes`
- **Classes:** `TAB_SWITCH`, `FATIGUE_EYE_CLOSURE`
- **Guard:** Returns healthy baseline when `focus_minutes < 5`

---

## 8. Telemetry Data Flow Summary

```
┌──────────┐    ┌──────────────┐    ┌────────────┐    ┌──────────────┐
│ Browser  │───▶│ FastAPI      │───▶│ SQLite     │───▶│ Analytics    │
│ Events   │    │ Endpoints    │    │ Database   │    │ Endpoints    │
└──────────┘    └──────────────┘    └────────────┘    └──────────────┘
     │                │                    │                 │
  Tab Switch    POST /telemetry/      TelemetryLog      Focus Density
  Visibility      distraction         table insert      Score calc
  Idle detect                                              │
  Camera loss                                        Dashboard UI
```

---

## 9. Infrastructure Requirements

| Component | Requirement |
|-----------|-------------|
| **Python** | 3.11+ |
| **Node.js** | 18+ |
| **Browser** | Chrome/Firefox/Edge (WebSocket, WebRTC, ES2022) |
| **Camera** | Any USB or built-in webcam (for vision features) |
| **Storage** | ~10MB for SQLite DB + models |
| **Network** | Localhost only (no external services required beyond Groq API) |