# PRODIFY: Technology Stack & Dependency Guide

> **Version:** v1.0.0 (Stable Release)  
> **Last Updated:** June 11, 2026

---

## 1. Core Mandate

This project is strictly a **Web Application**. All libraries and code structures reference browser-based APIs and local runtime environments. No native desktop frameworks (Electron, Tauri), mobile wrappers (React Native), or OS-level hooks are used.

---

## 2. Frontend Layer (React 19 + Vite 8)

### Core Framework

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **React** | ^19.2.6 | UI component library. Powers all pages, components, and hooks. Uses the modern JSX transform. |
| **React DOM** | ^19.2.6 | DOM renderer for React 19. |
| **Vite** | ^8.0.12 | Build tool and development server. Provides HMR (Hot Module Replacement), TypeScript compilation, and optimized production builds. |
| **TypeScript** | ~6.0.2 | Type-safe JavaScript superset. Used across the entire frontend for component props, store types, and API response typing. |

### Routing & Data Fetching

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **react-router-dom** | ^7.17.0 | Client-side routing. Manages 3 routes: `/` (HomePage), `/workspace/:id` (WorkspacePage), `/analytics` (Analytics). |
| **@tanstack/react-query** | ^5.101.0 | Server state management. Handles API data fetching, caching, and revalidation for workspace and analytics requests. |

### State Management

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **Zustand** | ^5.0.14 | Lightweight global state management. Drives the Pomodoro timer FSM with per-workspace isolation (`Record<workspaceId, WorkspaceTimerState>`). Each workspace maintains its own `currentState`, `timeRemaining`, `distractionCount`, and timer interval. |

### Styling & UI Components

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **Tailwind CSS** | ^3.4.19 | Utility-first CSS framework. All components styled with Tailwind classes. Dark theme applied via CSS variables. |
| **tailwind-merge** | ^3.6.0 | Utility for merging Tailwind classes without conflicts. Used in `cn()` helper in `lib/utils.ts`. |
| **tailwindcss-animate** | ^1.0.7 | Tailwind plugin for animation utilities. Powers entrance animations and hover effects. |
| **class-variance-authority** | ^0.7.1 | Utility for creating variant-based component styles. Used in shadcn/ui primitives (button variants, etc.). |
| **clsx** | ^2.1.1 | Conditional class name construction utility. |

### Animation

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **Framer Motion** | ^12.40.0 | Declarative animation library. Powers: staggered workspace card entrance (`motion.div`), SVG ring animations, scramble number transitions, gauge meter fills, hover lift effects, and page transition animations. |

### Data Visualization

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **Recharts** | ^3.8.1 | Composable charting library. Used in `AnalyticsPanel.tsx` for: focus time bar charts (last 7 days), session completion pie charts, distraction trend line charts. |

### UI Component Primitives (Radix UI)

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **@radix-ui/react-dialog** | ^1.1.15 | Modal dialog for `CreateWorkspaceDialog.tsx`. |
| **@radix-ui/react-select** | ^2.2.6 | Dropdown select for workspace mode selection. |
| **@radix-ui/react-slider** | ^1.3.6 | Slider input for work duration / break duration configuration. |
| **@radix-ui/react-tabs** | ^1.1.13 | Tab interface for analytics panel sections. |
| **@radix-ui/react-tooltip** | ^1.2.8 | Tooltips for timer controls and stat cards. |
| **@radix-ui/react-toast** | ^1.2.15 | Toast notification system (used alongside `sonner`). |
| **@radix-ui/react-switch** | ^1.2.6 | Toggle switches for settings. |
| **@radix-ui/react-progress** | ^1.1.8 | Progress bar primitives. |
| **@radix-ui/react-popover** | ^1.1.15 | Popover for additional controls. |
| **@radix-ui/react-avatar** | ^1.1.11 | User avatar placeholder. |
| **@radix-ui/react-accordion** | ^1.2.12 | Expandable sections. |
| **@radix-ui/react-alert-dialog** | ^1.1.15 | Confirmation dialogs. |
| **@radix-ui/react-checkbox** | ^1.3.3 | Checkbox inputs. |
| **@radix-ui/react-collapsible** | ^1.1.12 | Collapsible panels. |
| **@radix-ui/react-context-menu** | ^2.2.16 | Right-click context menus. |
| **@radix-ui/react-dropdown-menu** | ^2.1.16 | Dropdown menus. |
| **@radix-ui/react-hover-card** | ^1.1.15 | Hover-triggered info cards. |
| **@radix-ui/react-label** | ^2.1.8 | Accessible form labels. |
| **@radix-ui/react-menubar** | ^1.1.16 | Menu bar component. |
| **@radix-ui/react-navigation-menu** | ^1.2.14 | Navigation menus. |
| **@radix-ui/react-radio-group** | ^1.3.8 | Radio button groups. |
| **@radix-ui/react-scroll-area** | ^1.2.10 | Custom scroll areas. |
| **@radix-ui/react-separator** | ^1.1.8 | Visual dividers. |
| **@radix-ui/react-slot** | ^1.2.4 | Polymorphic component utility (used by `Button`). |
| **@radix-ui/react-toggle** | ^1.1.10 | Toggle buttons. |
| **@radix-ui/react-toggle-group** | ^1.1.11 | Toggle button groups. |

### Icons & Notifications

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **lucide-react** | ^1.17.0 | Open-source icon library. Used throughout for: Sparkles, Layers, Timer, TrendingUp, Flame, BarChart3, ArrowLeft, CameraOff, AlertTriangle, Webcam, Heart, Shield, Activity, and more. |
| **sonner** | ^2.0.7 | Toast notification library. Used for: distraction alerts ("Focus lost!"), idle detection ("You walked away!"), welcome-back messages, camera permission warnings. |

### Forms & Validation

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **react-hook-form** | ^7.77.0 | Performant form state management for workspace creation. |
| **@hookform/resolvers** | ^5.4.0 | Resolver integration for Zod schema validation with react-hook-form. |
| **zod** | ^4.4.3 | TypeScript-first schema validation. Used in form validation and API response validation. |

### Other Utilities

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **date-fns** | ^4.4.0 | Date utility library. Used for date formatting in session logs (`format`, `parseISO`). |
| **react-markdown** | ^10.1.0 | Markdown rendering for AI Coach chat responses. |
| **react-webcam** | ^7.2.0 | Webcam capture component. Used in `WebcamStream.tsx` for camera feed display and frame capture for MediaPipe processing. |
| **react-day-picker** | ^8.10.1 | Date picker component for deadline selection in workspace creation. |
| **react-toastify** | ^11.1.0 | Alternative toast library. |

---

## 3. Backend Layer (Python 3.12 + FastAPI)

### Core Framework

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **FastAPI** | Latest | High-performance async web framework. Defines all REST endpoints and WebSocket handlers. Pydantic models for request/response validation. |
| **Uvicorn** | Latest | ASGI server. Runs the FastAPI application. Configured for hot-reload during development. |
| **python-dotenv** | Latest | Environment variable loader. Loads `GROQ_API_KEY` from `.env` file. |

### Database

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **SQLAlchemy** | Latest | ORM for database interactions. Defines 4 models (User, Workspace, Session, TelemetryLog) and manages SQLite connections via `sessionmaker`. |
| **SQLite** | Built-in | Local file-based database (`prodify.db`). Zero configuration, ideal for local MVP development. |

### Computer Vision

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **mediapipe** (tasks-vision) | Latest | Google's ML vision pipeline. Used for real-time face detection via `FaceDetector` from `mediapipe.tasks.python.vision`. Processes webcam frames to determine user presence. |
| **opencv-python** (cv2) | Latest | Image processing. Decodes base64 frames, converts color spaces (BGR to RGB), computes brightness metrics for pitch-black detection. |
| **numpy** | Latest | Numerical array operations. Handles frame buffer conversion and image data manipulation. |

### Machine Learning

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **scikit-learn** | Latest | ML framework. `RandomForestClassifier` trained on synthetic data to predict `TAB_SWITCH` and `FATIGUE_EYE_CLOSURE` probabilities based on `hour_of_day` and `focus_duration_minutes`. |
| **pandas** | Latest | Data manipulation. Extracts, cleans, and engineers features from SQLite logs in the ML data pipeline. |
| **joblib** | Latest | Model serialization. Saves and loads the trained `burnout_model.joblib` for live inference. |

### AI Integration

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **groq** | Latest | Groq API client. Powers the AI Coach via `llama-3.3-70b-versatile` model. Used for both chat completions and structured function calling with JSON output mode. |

### API Dependencies

| Library | Version | Use-Case in Prodify |
|---------|---------|---------------------|
| **Pydantic** | Included with FastAPI | Request/response schema validation. Defines `WorkspaceCreate`, `WorkspaceOut`, `ChatRequest`, `FunctionCallRequest`, `BurnoutPredictionResponse`, `SessionResponse`, `FocusDensityResponse`, and more. |

---

## 4. Browser APIs Used

| API | Use-Case in Prodify |
|----|---------------------|
| **Page Visibility API** (`document.visibilityState`) | Detects when user switches tabs (`hidden` to distraction). Used in `useTabVisibility` hook. |
| **Window Focus Events** (`blur`/`focus`) | Detects when window loses/gains focus. Used in `useTabVisibility` hook. |
| **WebRTC** (`navigator.mediaDevices.getUserMedia`) | Accesses webcam for real-time face detection. Used in `WebcamStream` component. |
| **WebSocket API** | Establishes persistent connection to backend `/vision` endpoint for streaming webcam frames. |
| **Performance API** (`performance.now()`) | Drift-resistant timer interval correction in the Zustand timer store. |
| **Keyboard Events** (`keydown`) | User activity detection for idle monitoring. |
| **Pointer Events** (`mousemove`, `click`) | User activity detection for idle monitoring. |

---

## 5. Development & Build Tooling

| Tool | Version | Use-Case in Prodify |
|------|---------|---------------------|
| **ESLint** | ^10.3.0 | JavaScript/TypeScript linting. Configured with `typescript-eslint` and React hooks plugin. |
| **PostCSS** | ^8.5.15 | CSS transformation tool. Used with `tailwindcss` and `autoprefixer` plugins. |
| **Autoprefixer** | ^10.5.0 | CSS vendor prefix auto-insertion. |
| **@vitejs/plugin-react** | ^6.0.1 | Vite plugin providing React Fast Refresh and JSX transform. |

---

## 6. Runtime & Environment Requirements

| Requirement | Version / Detail |
|-------------|------------------|
| **Python** | 3.11+ (tested on 3.12) |
| **Node.js** | 18+ |
| **npm** | 9+ |
| **Browser** | Modern Chromium/Firefox/WebKit (required for WebRTC, WebSocket, ES2022) |
| **WSL2** | Recommended for Windows development |
| **Camera** | Any USB or built-in webcam for vision features |
