import sqlite3
import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta

def extract_and_clean_data():
    # 1. Define exact file paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, '../database/prodify.db')
    output_csv = os.path.join(base_dir, 'dataset.csv')

    print(f"🔍 Locating database at: {db_path}")
    
    # 2. Connect to SQLite
    try:
        conn = sqlite3.connect(db_path)
    except Exception as e:
        print(f"❌ Error connecting to database: {e}")
        return

    # 3. Extract Data from telemetry_logs (FIXED: Using session_id instead of workspace_id)
    query = "SELECT id, session_id, distraction_type, timestamp FROM telemetry_logs WHERE distraction_type IS NOT NULL"
    
    try:
        df = pd.read_sql_query(query, conn)
        print(f"✅ Successfully extracted {len(df)} real records from telemetry_logs.")
    except Exception as e:
        print(f"❌ Error reading from database. Error: {e}")
        conn.close()
        return
        
    conn.close()

    # 4. Bootstrap Data (If local DB is empty or too small for ML)
    if len(df) < 50:
        print("⚠️ Not enough real data for Machine Learning yet. Bootstrapping synthetic data...")
        synthetic_df = generate_synthetic_data(500 - len(df))
        df = pd.concat([df, synthetic_df], ignore_index=True)
        print(f"✅ Synthetic dataset expanded to {len(df)} rows.")

    # 5. Feature Engineering (The Data Science Magic)
    # Convert timestamp string to actual datetime objects
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Extract numerical features for the ML algorithm to learn from
    df['hour_of_day'] = df['timestamp'].dt.hour
    df['day_of_week'] = df['timestamp'].dt.dayofweek
    
    # Simulate a "focus_duration_minutes" feature (how long before they got distracted)
    np.random.seed(42)
    df['focus_duration_minutes'] = np.where(
        df['distraction_type'] == 'TAB_SWITCH',
        np.random.normal(12, 5, len(df)), # Tab switches happen earlier (avg 12 mins)
        np.random.normal(22, 4, len(df))  # Fatigue/Eye closures happen later (avg 22 mins)
    )
    # Clean up negative durations just in case
    df['focus_duration_minutes'] = df['focus_duration_minutes'].apply(lambda x: max(1.0, round(x, 1)))

    # 6. Save the final engineered dataset
    df.to_csv(output_csv, index=False)
    print("\n📊 DATA PIPELINE PREVIEW:")
    print(df[['distraction_type', 'hour_of_day', 'focus_duration_minutes']].head())
    print(f"\n🚀 SUCCESS: Cleaned dataset saved to {output_csv}. Ready for Day 6 ML Training.")

def generate_synthetic_data(num_rows):
    """Generates realistic dummy data so we can train a robust ML model."""
    now = datetime.now()
    distractions = ['TAB_SWITCH', 'FATIGUE_EYE_CLOSURE']
    
    data = {
        'id': range(1000, 1000 + num_rows),
        'session_id': [1] * num_rows, # FIXED: Matched to your SQLAlchemy model
        'distraction_type': np.random.choice(distractions, num_rows, p=[0.7, 0.3]), 
        'timestamp': [(now - timedelta(hours=np.random.randint(1, 100), minutes=np.random.randint(0, 60))).isoformat() for _ in range(num_rows)]
    }
    return pd.DataFrame(data)

if __name__ == "__main__":
    extract_and_clean_data()