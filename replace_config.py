import os

path = 'frontend/tailwind.config.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("'prodify-bg': '#0a0a0a'", "'prodify-bg': '#09090b'")
content = content.replace("'prodify-surface': '#111111'", "'prodify-surface': '#18181b'")
content = content.replace("'prodify-surface-alt': '#1a1a1a'", "'prodify-surface-alt': '#27272a'")
content = content.replace("'prodify-accent': '#e8ff47'", "'prodify-accent': '#3b82f6'")
content = content.replace("'prodify-border': '#2a2a2a'", "'prodify-border': '#27272a'")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Updated {path}')

path = 'frontend/src/index.css'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('--background: 0 0% 4%', '--background: 224 71% 4%')
content = content.replace('--card: 0 0% 7%', '--card: 224 71% 8%')
content = content.replace('--popover: 0 0% 7%', '--popover: 224 71% 8%')
content = content.replace('--primary: 72 100% 63%', '--primary: 217 91% 60%')
content = content.replace('--accent: 72 100% 63%', '--accent: 217 91% 60%')
content = content.replace('--ring: 72 100% 63%', '--ring: 217 91% 60%')
content = content.replace('--chart-1: 72 100% 63%', '--chart-1: 217 91% 60%')
content = content.replace('--sidebar-background: 0 0% 7%', '--sidebar-background: 224 71% 8%')
content = content.replace('--sidebar-primary: 72 100% 63%', '--sidebar-primary: 217 91% 60%')
content = content.replace('--sidebar-ring: 72 100% 63%', '--sidebar-ring: 217 91% 60%')
content = content.replace('--border: 0 0% 16%', '--border: 216 34% 17%')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Updated {path}')
