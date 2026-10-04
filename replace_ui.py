import os

REPLACEMENTS = {
    'bg-[#111111]': 'bg-zinc-950',
    'bg-[#161616]': 'bg-zinc-900',
    'bg-[#1a1a1a]': 'bg-zinc-900',
    'border-[#2a2a2a]': 'border-zinc-800',
    'border-[#333]': 'border-zinc-700',
    'bg-[#2a2a2a]': 'bg-zinc-800',
    'text-[#e8ff47]': 'text-blue-500',
    'bg-[#e8ff47]': 'bg-blue-500',
    'ring-[#e8ff47]': 'ring-blue-500',
    'border-[#e8ff47]': 'border-blue-500',
    'from-[#e8ff47]': 'from-blue-500',
    'shadow-[0_0_8px_rgba(232,255,71,0.4)]': 'shadow-[0_0_12px_rgba(59,130,246,0.5)]',
    '#e8ff47': '#3b82f6',
    'rounded-none': 'rounded-xl',
}

for root, dirs, files in os.walk('frontend/src'):
    for file in files:
        if file.endswith(('.tsx', '.ts', '.css')):
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
