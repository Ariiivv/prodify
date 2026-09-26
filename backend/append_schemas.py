new_code = '''
class DailyWorkspaceLog(Base):
    __tablename__ = "daily_workspace_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    date = Column(Date, nullable=False)
    category = Column(String, nullable=True) # snapshot
    target_minutes_required = Column(Integer, nullable=False, default=0)
    minutes_logged = Column(Integer, nullable=False, default=0)
    intent_score = Column(Float, nullable=False, default=0.0)
    target_met = Column(Boolean, nullable=False, default=False)

    __table_args__ = (UniqueConstraint('workspace_id', 'date', name='uq_workspace_date'),)
    workspace = relationship("Workspace")

class UserStats(Base):
    __tablename__ = "user_stats"

    id = Column(Integer, primary_key=True, index=True)
    current_global_streak = Column(Integer, nullable=False, default=0)
    longest_global_streak = Column(Integer, nullable=False, default=0)
    last_global_perfect_date = Column(Date, nullable=True)
'''
with open(r'c:\Users\ariva\Desktop\Projects\prodifyy\backend\app\models\schemas.py', 'a') as f:
    f.write('\n' + new_code)
