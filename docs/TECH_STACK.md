# PRODIFY: Strict Technical Stack & Boundary Definitions

## 1. Core Mandate
This project is strictly a **Web Application**. Any instructions, libraries, or code structures referencing native desktop environments (Electron, Tauri), mobile wrappers (React Native), or direct OS-level hooks (Win32 APIs, bash scripts for system tracking) are strictly forbidden and constitute a critical failure of the sprint.

## 2. Frontend Layer (The Client Shell)
The frontend must be lightweight, fast, and capable of running local machine learning inferences in the browser.
* **Core Framework:** React 18+ initialized via Vite. (Language: JavaScript/TypeScript).
* **State Management:** Zustand (Used for Pomodoro timer FSM and user settings).
* **Styling Engine:** Tailwind CSS.
* **Component Animation:** Framer Motion (Spring physics for UI transitions).
* **Data Visualization:** Recharts (For analytical dashboards, radar charts, and heatmaps).
* **Client-Side ML:** `@mediapipe/tasks-vision` (Specifically the Face Mesh model).
* **Browser APIs:** Page Visibility API (`document.visibilityState`) and Window Focus events.

## 3. Backend Layer (The Analytical Brain)
The backend acts as the data processor, ML trainer, and LLM orchestrator. It must run locally on the development machine.
* **Core Framework:** Python 3.11+ using FastAPI (Chosen for high-performance async REST endpoints).
* **Local Database:** SQLite (Managed via SQLAlchemy or raw SQL depending on complexity).
* **Data Manipulation:** `pandas`, `numpy`.
* **Supervised Machine Learning:** `scikit-learn` (Random Forest), `xgboost` (XGBRegressor).
* **Unsupervised Machine Learning:** `scikit-learn` (Isolation Forest, KMeans).
* **Generative AI Integration:** REST API calls to LLM providers (Claude/OpenRouter/Gemini) utilizing structured JSON output and Function Calling/Tool Use.

## 4. Strict Engineering Guardrails (DO NOT VIOLATE)
1. **Privacy Boundary (Webcam):** The webcam stream (`navigator.mediaDevices.getUserMedia`) MUST remain exclusively in the React frontend. You are explicitly forbidden from writing any backend endpoint that accepts raw video streams or images. Only process landmarks client-side and send numerical arrays/booleans to the backend.
2. **Database Boundary (Local MVP):** The database must remain a local SQLite file (`prodify.db`) located within the backend directory. Do not attempt to initialize PostgreSQL, MongoDB, Firebase, or Supabase. 
3. **Environment Boundary:** Assume development is occurring within a WSL2 (Windows Subsystem for Linux) or standard Linux/macOS environment. 

## 5. Agent Dependency Management
Before attempting to write code for a new feature, verify that the required dependencies exist in `package.json` (frontend) or `requirements.txt` (backend). If a dependency is missing, explicitly execute the installation command (e.g., `npm install` or `pip install`) before scaffolding the implementation.