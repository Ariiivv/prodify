import os

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

patch = '''import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
'''

content = content.replace('import logging\n', 'import logging\n' + patch)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
