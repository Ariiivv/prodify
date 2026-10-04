import sqlite3

db_path = 'backend/data/prodify.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE workspaces ADD COLUMN theme_color VARCHAR DEFAULT '#3b82f6'")
    print('Added theme_color column to workspaces')
except Exception as e:
    print(f'Error altering table: {e}')

conn.commit()
conn.close()
