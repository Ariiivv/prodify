import sqlite3

# Update this to match the actual SQLite DB filename
DB_FILE = "database/prodify.db"

conn = sqlite3.connect(DB_FILE)
cursor = conn.cursor()
try:
    cursor.execute("ALTER TABLE workspaces ADD COLUMN focus_keywords TEXT;")
    conn.commit()
    print("Successfully added 'focus_keywords' column to workspaces table.")
except sqlite3.OperationalError as e:
    print(f"Notice: {e}")
finally:
    conn.close()