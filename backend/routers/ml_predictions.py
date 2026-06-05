from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
import joblib
import os

router = APIRouter()

class BurnoutPredictionResponse(BaseModel):
    tab_switch_probability: float
    fatigue_eye_closure_probability: float

@router.get("/ml/burnout-prediction", response_model=BurnoutPredictionResponse)
def get_burnout_prediction(current_hour: int, current_focus_minutes: int):
    # Guard: very low focus minutes should return a healthy baseline probability
    if current_focus_minutes < 5:
        return BurnoutPredictionResponse(
            tab_switch_probability=0.05 + (current_focus_minutes * 0.01),  # scales 0.06 → 0.09 for 1→4 mins
            fatigue_eye_closure_probability=0.02
        )

    try:
        # Safely locate the model file dynamically
        base_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(base_dir, '../ml/burnout_model.joblib')
        model = joblib.load(model_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Machine Learning model not found or failed to load.")

    # Structure the DataFrame exactly as the Random Forest was trained
    data = pd.DataFrame([{
        'hour_of_day': current_hour,
        'focus_duration_minutes': current_focus_minutes
    }])

    # Predict the probabilities
    probabilities = model.predict_proba(data)[0]
    classes = model.classes_
    
    # Map probabilities to their string names safely
    prob_dict = dict(zip(classes, probabilities))

    return BurnoutPredictionResponse(
        tab_switch_probability=prob_dict.get('TAB_SWITCH', 0.0),
        fatigue_eye_closure_probability=prob_dict.get('FATIGUE_EYE_CLOSURE', 0.0)
    )
