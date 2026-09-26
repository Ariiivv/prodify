import os, sys; from sqlalchemy import create_engine, text; engine = create_engine(os.environ['DATABASE_URL']);
with engine.connect() as conn:
    conn.execute(text('ALTER TABLE user_stats ADD COLUMN user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE;'))
    conn.commit()
    print('Success')
