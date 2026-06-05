# PRODIFY: Master Architecture & Agent Operational Blueprint

## 1. Core Vision & System Nature
Prodify is a web-based, adaptive productivity intelligence platform. It replaces standard, static timers with a dynamic system driven by client-side telemetry and a localized Python machine learning engine. The system continuously profiles user focus, identifies cognitive friction, and passes a structured behavioral payload to a generative AI coach. This coach can autonomously mutate application states (e.g., adjusting session lengths) to proactively mitigate burnout.

---

## 2. Telemetry Architecture (Web Sandboxed)
Because this application runs entirely in a web environment, tracking is constrained by browser security. No desktop-level hooks are permitted.

### Visual Telemetry Vector (Client-Side)
* **Technology:** Web-native face mesh tracking via `@mediapipe/tasks-vision`.
* **Execution:** Raw webcam frames are processed entirely in the browser memory loop. Under no circumstances are video streams or images sent to the backend server.
* **Metric Extraction:** The frontend extracts eye-closure velocity and duration to calculate the mathematical PERCLOS (Percentage of Eye Closure) index, passing only lightweight numerical telemetry packets to the backend API.

### Contextual Telemetry Vector (Browser Events)
* **Technology:** Native HTML5 Page Visibility API and Window Focus/Blur listeners.
* **Execution:** Tracks user presence within the app scope.
* **Metric Extraction:** Captures exact timestamps when `document.visibilityState === 'hidden'` or when the window loses focus. These events are logged as immediate digital distractions.

---

## 3. Data Processing & Machine Learning Engine (Backend)
The Python backend acts as an analytical data processor, taking raw telemetry logs from the database and using NumPy, Pandas, and scikit-learn/XGBoost to maintain four specialized models:

| Model Type | Algorithm | Functional Target |
| :--- | :--- | :--- |
| **Supervised Quality Classifier** | Random Forest | Analyzes past context vectors to predict if a newly initiated session will rank as High or Low quality. |
| **Supervised Forecasting Regressor** | XGBoost | Evaluates current target completion velocity against deadlines to project timeline drift in days. |
| **Unsupervised Anomaly Detector** | Isolation Forest | Monitors shifts away from a 14-day rolling baseline to flag early, unlabeled burnout indicators. |
| **Unsupervised Behavioral Clustering** | K-Means | Profiles 30-day historical matrices to assign behavioral archetypes (e.g., Night Grinder vs. Fragmented Focus). |

---

## 4. The Autonomous State-Mutation Loop
1. **Payload Generation:** The backend combines raw session history and ML inferences into a compressed, structured JSON block called the `Behavioral DNA Payload`.
2. **System Ingestion:** This payload is injected into the system prompt of the LLM Chatbot API.
3. **Intent & Function Execution:** When a user expresses fatigue or a performance drop, the LLM intercepts the state, validates it against the anomaly telemetry, and outputs an explicit tool instruction (e.g., `CONF_MUTATION`).
4. **State Application:** The React application intercepts this token stream, bypasses manual user intervention, executes a REST request to update the configuration registry, and dynamically resets the active workspace timer values in the UI.

---

## 5. Dynamic Cold-Start Lifecycle
To avoid data variance crashes on clean installations, the application shifts through a strict mathematical weighting lifecycle:
* **Phase 1 (Day 1):** Global rule-based psychological defaults (25/5 minute strict splits). Machine learning code paths are bypassed.
* **Phase 2 (Days 2-3):** Explicit onboarding configuration seeding via qualitative user questionnaires.
* **Phase 3 (Days 4-13):** Linear interpolation blending. The system combines global baselines ($M_{\text{global}}$) with early local model outputs ($M_{\text{local}}$) using an exponential decay factor ($\alpha = e^{-N/20}$) relative to the number of completed sessions ($N$).
* **Phase 4 (Days 14+):** 100% autonomous local edge model control ($\alpha = 0$).

---

## 6. Cline Agent Operational Protocols & Day Wrap-Up Handover

### Directives for the AI Agent
* **Context Consistency:** You are strictly bound to a web application layout. Never write code references to Electron, Win32 APIs, native operating system desktop paths, or external cloud databases. Use a local SQLite database setup.
* **Incremental Verification:** Test API routes and component state cycles immediately after creation before proceeding to complex styling.

### The Day Wrap-Up Protocol (Mandatory Handover Procedure)
Whenever a specific milestone day within the development sprint is completed, or if you are about to hit output token thresholds and must hand over execution to a fresh model instance, you MUST execute the following exact wrap-up routine:

1. **State Assessment:** Review the file directory to ensure code compiles without syntax errors.
2. **Update the Repositories:** Modify `docs/CURRENT_STATE.md` to move completed items out of pending tasks. Mark the corresponding checkboxes in `docs/SPRINT_PLAN.md` as completed.
3. **Print the Handover Signature:** Terminate your response with an explicit, readable log block detailing the completion. Use the following exact layout:

```text
======================================================================
STAGE COMPLETED: Day [X] Development Cycles Wrapped Up Successfully.
======================================================================
* COMPLETED: [Brief list of features written and verified]
* CURRENT STATE REGISTERED: Settings and code paths pushed to local tree.
* NEXT DEPLOYMENT INSTRUCTION: Ready to initiate Day [X+1] tasks.
======================================================================