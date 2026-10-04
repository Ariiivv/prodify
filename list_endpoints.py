import os, re
for root, _, files in os.walk('backend/app/api'):
    for file in files:
        if file.endswith('.py'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                matches = re.finditer(r'@router\.(post|put|patch)\(\"([^\"]*)\"', content)
                for m in matches:
                    print(f"{file}: {m.group(1).upper()} {m.group(2)}")
