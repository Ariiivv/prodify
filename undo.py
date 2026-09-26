with open('backend/app/models/schemas.py', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('    id = Column(Integer, primary_key=True, index=True)\n    user_id = Column(String, ForeignKey(\"users.id\", ondelete=\"CASCADE\"), unique=True, nullable=False)\n', '    id = Column(Integer, primary_key=True, index=True)\n')
with open('backend/app/models/schemas.py', 'w', encoding='utf-8') as f:
    f.write(content)
