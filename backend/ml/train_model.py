import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report
from joblib import dump
import os

# 1. Define explicit file paths
base_dir = os.path.dirname(os.path.abspath(__file__))
dataset_path = os.path.join(base_dir, 'dataset.csv')
model_path = os.path.join(base_dir, 'burnout_model.joblib')

print(f"📊 Loading dataset from: {dataset_path}")

# 2. Load the data
df = pd.read_csv(dataset_path)

# 3. Define the Feature Matrix (X) and Target Vector (y)
X = df[['hour_of_day', 'focus_duration_minutes']]
y = df['distraction_type']

# 4. Split the dataset (80% training, 20% testing)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print("🧠 Training RandomForestClassifier...")
# 5. Train the Model
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# 6. Evaluate the Model
y_pred = model.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)

print("\n✅ --- MODEL EVALUATION ---")
print(f"Accuracy Score: {accuracy * 100:.2f}%")
print("\nClassification Report:")
print(classification_report(y_test, y_pred))

# 7. Save the "Brain" so FastAPI can use it tomorrow
dump(model, model_path)
print(f"💾 Model successfully saved to {model_path}")