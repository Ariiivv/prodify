import re
from typing import Tuple

APP_MAP = {
    "brave.exe": "Brave Browser",
    "chrome.exe": "Google Chrome",
    "msedge.exe": "Edge",
    "code.exe": "VS Code",
    "cursor.exe": "Cursor",
    "windowsterminal.exe": "Terminal",
    "powershell.exe": "Terminal",
    "cmd.exe": "Command Prompt",
    "slack.exe": "Slack",
    "discord.exe": "Discord",
    "spotify.exe": "Spotify",
    "notion.exe": "Notion",
    "figma.exe": "Figma",
    "postman.exe": "Postman",
    "dbeaver.exe": "DBeaver",
    "explorer.exe": "Windows Explorer",
    "snippingtool.exe": "Snipping Tool",
    "taskmgr.exe": "Task Manager",
}

PLATFORM_PATTERNS = [
    (r"(?i)\byoutube\b", "YouTube"),
    (r"(?i)\bgoogle docs\b|\bgoogle sheets\b|\bgoogle slides\b", "Google Docs"),
    (r"(?i)\bgemini\b|\bchatgpt\b|\bclaude\b|\bperplexity\b", "AI Assistant"),
    (r"(?i)\bgithub\b", "GitHub"),
    (r"(?i)\bstack overflow\b|\bstackoverflow\b", "Stack Overflow"),
    (r"(?i)\bnetflix\b", "Netflix"),
    (r"(?i)\breddit\b", "Reddit"),
    (r"(?i)\blocalhost\b|127\.0\.0\.1|:\d{4,5}", "Localhost Dev"),
    (r"(?i)\btwitter\b|\bx\.com\b", "Twitter / X"),
    (r"(?i)\btwitch\b", "Twitch"),
    (r"(?i)\bfigma\b", "Figma"),
    (r"(?i)\bnotion\b", "Notion"),
    (r"(?i)\bspotify\b", "Spotify"),
    (r"(?i)\bwikipedia\b", "Wikipedia"),
    (r"(?i)\bmedium\b", "Medium"),
    (r"(?i)\bdev\.to\b", "Dev.to"),
]

def clean_app_name(raw_app: str) -> str:
    if not raw_app:
        return "Unknown App"
    app_lower = raw_app.lower().strip()
    if app_lower in APP_MAP:
        return APP_MAP[app_lower]
    # Remove .exe if present
    base = raw_app[:-4] if raw_app.lower().endswith(".exe") else raw_app
    # Capitalize / title case
    if base.islower() or base.isupper():
        return base.title()
    return base

def parse_activity(window_title: str, raw_app: str) -> Tuple[str, str, str]:
    """
    Returns (clean_app_name, platform_name, content_title).
    Transforms raw executables and bloated window titles into human-readable app names,
    active platforms, and clean content titles.
    """
    clean_app = clean_app_name(raw_app)
    title = (window_title or "").strip()

    # Determine platform
    platform = clean_app
    for pattern, name in PLATFORM_PATTERNS:
        if re.search(pattern, title) or re.search(pattern, raw_app):
            platform = name
            break

    # Extract content title
    content = title

    # Strip unread notification counts like "(2479) ", "(1) ", "[3] "
    content = re.sub(r"^\(\d+\)\s*", "", content)
    content = re.sub(r"^\[\d+\]\s*", "", content)

    # Strip known trailing app / site suffixes
    suffixes = [
        r"\s*-\s*YouTube\s*-\s*Brave.*$",
        r"\s*-\s*YouTube\s*-\s*Google Chrome.*$",
        r"\s*-\s*YouTube\s*-\s*Edge.*$",
        r"\s*-\s*YouTube.*$",
        r"\s*-\s*Brave.*$",
        r"\s*-\s*Google Chrome.*$",
        r"\s*-\s*Microsoft\u200b Edge.*$",
        r"\s*-\s*Edge.*$",
        r"\s*-\s*Visual Studio Code.*$",
        r"\s*-\s*Cursor.*$",
        r"\s*-\s*Sublime Text.*$",
        r"\s*-\s*Google Docs.*$",
        r"\s*-\s*Google Sheets.*$",
        r"\s*-\s*Google Drive.*$",
        r"\s*-\s*Mozilla Firefox.*$",
    ]
    for s_pat in suffixes:
        content = re.sub(s_pat, "", content, flags=re.IGNORECASE)

    content = content.strip()
    if not content:
        content = title or clean_app

    return clean_app, platform, content
