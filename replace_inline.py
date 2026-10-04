import os

REPLACEMENTS = {
    "backgroundColor: '#111111'": "backgroundColor: '#09090b'",
    "border: '1px solid #2a2a2a'": "border: '1px solid #27272a'",
    "bg-[#111111]": "bg-zinc-950",
    "border-[#2a2a2a]": "border-zinc-800",
}

for root, dirs, files in os.walk('frontend/src'):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = content
            for old, new in REPLACEMENTS.items():
                new_content = new_content.replace(old, new)
                
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f'Updated {path}')
