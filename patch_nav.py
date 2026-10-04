import os

path = 'frontend/src/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("const Analytics = lazy(() => import('./pages/Analytics'));", "const Report = lazy(() => import('./pages/Report'));")
content = content.replace('path="/analytics"', 'path="/report"')
content = content.replace('<Analytics />', '<Report />')
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

path = 'frontend/src/components/layout/AppLayout.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("path: '/analytics'", "path: '/report'")
content = content.replace("label: 'Analytics'", "label: 'Report'")
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

path = 'frontend/src/pages/Report.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("export default function Analytics()", "export default function Report()")
content = content.replace(">Analytics</span>", ">Report</span>")
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
