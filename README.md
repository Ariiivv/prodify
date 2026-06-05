# 🚀 Prodify: AI-Powered Focus & Burnout Tracking

![Prodify Hero Image](./frontend/src/assets/hero.png)

Prodify is a full-stack, AI-powered productivity web application designed to help users track their focus and predict burnout in real-time. It leverages a Pomodoro finite state machine, monitors tab-switching distractions via browser telemetry, and feeds this data into a custom Machine Learning model to calculate a live fatigue risk percentage. Additionally, an integrated AI Coaching assistant provides personalized, data-driven advice.

## ✨ Features

*   **Pomodoro Timer:** A robust finite state machine (FSM) implementation for structured focus and break sessions.
*   **Distraction Tracking:** Real-time monitoring of tab-switching events with a 15-second consecutive detection timer to identify distractions.
*   **Enforcement Modal:** Blurs the screen and pauses the timer upon detecting significant distractions, encouraging users to return to focus.
*   **Live Burnout Prediction:** A custom Machine Learning model (RandomForestClassifier) predicts burnout probability based on historical telemetry data.
*   **Dynamic Burnout Gauge:** Visual representation of burnout risk with dynamic color transitions (Green/Yellow/Red).
*   **AI Coaching Assistant:** An interactive chat panel powered by the Groq API (Llama-3.3-70b-versatile) offering personalized advice based on live session data.
*   **Workspace Management:** Create and manage multiple workspaces to categorize productivity sessions.
*   **Responsive Dashboard:** A clean, dark-themed user interface built with React and Tailwind CSS.

## 💡 Core Architecture & Tech Stack

### Backend
*   **Framework:** FastAPI (Python) for building fast, asynchronous APIs.
*   **Database:** SQLite with SQLAlchemy ORM for data persistence (User, Workspace, Session, TelemetryLog models).
*   **Dependencies:** `uvicorn` for serving the FastAPI application.

### Machine Learning
*   **Model:** Scikit-learn (RandomForestClassifier) for predicting burnout.
*   **Data Handling:** Pandas for data extraction, cleaning, and feature engineering from SQLite logs.
*   **Serialization:** Joblib for saving and loading the trained ML model (`burnout_model.joblib`).
*   **Endpoints:** `GET /api/ml/burnout-prediction` for live predictions, integrated with FastAPI lifecycle.

### Frontend
*   **Framework:** React (Vite for blazing-fast development).
*   **Styling:** Tailwind CSS for utility-first styling and rapid UI development.
*   **State Management:** Zustand for a lightweight and performant global state management, particularly for the Pomodoro FSM (`timerStore.ts`).
*   **Hooks:** Custom hooks like `useTabVisibility.ts` for browser telemetry.

### AI Integration
*   **Platform:** Groq API
*   **Model:** Llama-3.3-70b-versatile for the AI Coaching assistant.
*   **Endpoint:** `POST /api/ai-coach/chat` for real-time conversational AI.

## 🛠️ Setup and Installation

### Prerequisites
*   Python 3.8+
*   Node.js 18+
*   npm or yarn

### Backend Setup
1.  Navigate to the `backend/` directory:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
    ```
3.  Install backend dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Create a `.env` file in the `backend/` directory and add your Groq API key:
    ```
    GROQ_API_KEY="YOUR_GROQ_API_KEY"
    ```
5.  Run the FastAPI application:
    ```bash
    uvicorn main:app --reload
    ```
    The backend will be accessible at `http://localhost:8000`.

### Frontend Setup
1.  Navigate to the `frontend/` directory:
    ```bash
    cd frontend
    ```
2.  Install frontend dependencies:
    ```bash
    npm install
    # or yarn install
    ```
3.  Start the Vite development server:
    ```bash
    npm run dev
    # or yarn dev
    ```
    The frontend will be accessible at `http://localhost:5173` (or another port if 5173 is in use).

## 📈 ML Architecture Overview

Prodify's ML pipeline is designed to provide real-time burnout predictions:

1.  **Data Collection:** Telemetry data (focus duration, distraction counts, session states) is logged into an SQLite database during user sessions.
2.  **Data Extraction & Feature Engineering (`data_pipeline.py`):**
    *   Extracts raw session and telemetry logs.
    *   Cleans and reshapes data into a Pandas DataFrame.
    *   Engineers features such as `focus_duration_minutes`, `distraction_events_per_session`, `time_since_last_break`, and `session_streak`.
    *   Labels data with a `burnout_risk` target (synthetic for initial training, can be user-reported over time).
3.  **Model Training (`train_model.py`):**
    *   Loads processed data.
    *   Trains a `RandomForestClassifier` to predict `burnout_risk`.
    *   Achieved approximately 85% accuracy on synthetic data.
    *   Serializes the trained model to `burnout_model.joblib`.
4.  **Backend Integration:**
    *   The `burnout_model.joblib` is loaded into the FastAPI application's lifecycle (`main.py`).
    *   The `GET /api/ml/burnout-prediction` endpoint receives live session data, uses the loaded model to predict burnout probability, and returns the percentage to the frontend.

This architecture allows for continuous model improvement with new data and provides users with actionable insights into their productivity and well-being.

## 🤝 Contributing

Contributions are welcome! Please feel free to open issues or submit pull requests.

## 📄 License

This project is licensed under the MIT License.
