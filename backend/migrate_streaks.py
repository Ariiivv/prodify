import sqlite3
import os

DB_PATH = os.path.join("data", "prodify.db")

def migrate():
    print(f"Connecting to database at {DB_PATH}...")
    
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # 1. Update workspaces table
        print("Adding current_streak and longest_streak to workspaces table...")
        try:
            cursor.execute("ALTER TABLE workspaces ADD COLUMN current_streak INTEGER NOT NULL DEFAULT 0;")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("  -> current_streak already exists.")
            else:
                raise
                
        try:
            cursor.execute("ALTER TABLE workspaces ADD COLUMN longest_streak INTEGER NOT NULL DEFAULT 0;")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("  -> longest_streak already exists.")
            else:
                raise

        # 2. Create daily_workspace_logs table
        print("Creating daily_workspace_logs table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_workspace_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL,
                date DATE NOT NULL,
                category VARCHAR,
                target_minutes_required INTEGER NOT NULL DEFAULT 0,
                minutes_logged INTEGER NOT NULL DEFAULT 0,
                intent_score FLOAT NOT NULL DEFAULT 0.0,
                target_met BOOLEAN NOT NULL DEFAULT 0,
                FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
                CONSTRAINT uq_workspace_date UNIQUE (workspace_id, date)
            );
        """)

        # 3. Create user_stats table
        print("Creating user_stats table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_stats (
                id INTEGER PRIMARY KEY,
                current_global_streak INTEGER NOT NULL DEFAULT 0,
                longest_global_streak INTEGER NOT NULL DEFAULT 0,
                last_global_perfect_date DATE
            );
        """)

        # 4. Insert initial user_stats row if it doesn't exist
        print("Initializing UserStats singleton...")
        cursor.execute("INSERT OR IGNORE INTO user_stats (id, current_global_streak, longest_global_streak) VALUES (1, 0, 0);")

        conn.commit()
        print("Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
