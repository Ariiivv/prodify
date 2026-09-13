import sqlite3

DB_FILE = "data/prodify.db"

conn = sqlite3.connect(DB_FILE)
cursor = conn.cursor()
try:
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS workspace_chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS workspace_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        workspace_name TEXT NOT NULL,
        workspace_intent TEXT,
        session_date DATE NOT NULL,
        focus_minutes INTEGER NOT NULL,
        distraction_count INTEGER NOT NULL,
        burnout_score REAL NOT NULL,
        time_of_day TEXT NOT NULL,
        mode TEXT NOT NULL,
        completed BOOLEAN NOT NULL
    );
    """)
    conn.commit()
    print("Successfully added workspace_chat_history and workspace_metrics tables.")
except sqlite3.OperationalError as e:
    print(f"Notice: {e}")
finally:
    conn.close()