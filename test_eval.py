import asyncio
import os
import sys
from dotenv import load_dotenv

# Load .env file
load_dotenv(os.path.abspath("backend/.env"))

# Add the backend dir to sys.path so we can import app
sys.path.insert(0, os.path.abspath("backend"))

from app.services.intent_classifier import evaluate_semantics, client

# Ensure the client is using the loaded key
client.api_key = os.environ.get("GROQ_API_KEY")

async def main():
    test_cases = [
        ("learning C", "C Programming for Beginners - YouTube", "brave.exe"),
        ("learning C", "main.c - Visual Studio Code", "Code.exe"),
        ("learning C", "Stack Overflow - segmentation fault in C", "chrome.exe"),
        ("learning C", "Instagram", "brave.exe"),
        ("learning C", "Random Comedy Sketch - YouTube", "chrome.exe"),
        ("learning C", "New Tab", "brave.exe")
    ]
    
    print("Running Tests...\n")
    for intent, title, app in test_cases:
        print(f"Testing Intent: '{intent}' / Window: '{title}'")
        is_focused, reason = await evaluate_semantics(app, title, intent)
        status = "NOT paused (Focused)" if is_focused else "PAUSED (Distracted)"
        print(f"Result: {status}")
        print(f"Reason: {reason}")
        print("-" * 50)

if __name__ == '__main__':
    asyncio.run(main())
