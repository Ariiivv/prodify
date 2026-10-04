import os

filepath = 'src/pages/WorkspacePage.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'const workspaceKeywords = parseKeywords(workspace?.focus_keywords);',
    'const workspaceKeywords = React.useMemo(() => parseKeywords(workspace?.focus_keywords), [workspace?.focus_keywords]);'
)

# wait, we need import React from 'react'; but WorkspacePage has import { useState, useEffect, useCallback, useRef } from 'react';
# I can just use useMemo
content = content.replace(
    'const workspaceKeywords = React.useMemo(() => parseKeywords(workspace?.focus_keywords), [workspace?.focus_keywords]);',
    'const workspaceKeywords = useMemo(() => parseKeywords(workspace?.focus_keywords), [workspace?.focus_keywords]);'
)

# And add useMemo to imports
content = content.replace(
    'import { useState, useEffect, useCallback, useRef } from \\'react\\';',
    'import { useState, useEffect, useCallback, useRef, useMemo } from \\'react\\';'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
