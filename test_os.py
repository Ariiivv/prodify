import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv(os.path.abspath("backend/.env"))
sys.path.insert(0, os.path.abspath("backend"))

from app.services.intent_classifier import classify_with_intent, client
client.api_key = os.environ.get("GROQ_API_KEY")

async def main():
    test_cases = [
        ("Task View (Win+Tab) Before Fix", "Task View", "explorer.exe", "learning C", True), # Force AI evaluation to simulate before fix
        ("Task View (Win+Tab) After Fix", "Task View", "explorer.exe", "learning C", False),
        ("Task Switching (Alt-Tab)", "Task Switching", "explorer.exe", "learning C", False),
        ("Unrelated Window", "Random Comedy Sketch - YouTube", "chrome.exe", "learning C", False)
    ]
    
    print("Running Tests...\n")
    for name, title, app, intent, force_ai in test_cases:
        print(f"Testing Scenario: {name}")
        
        # Simulate before fix by temporarily removing from whitelist
        from app.services.intent_classifier import OS_WHITELIST
        original_whitelist = OS_WHITELIST.copy()
        
        if force_ai:
            if "task view" in OS_WHITELIST:
                OS_WHITELIST.remove("task view")
                
        is_focused, reason = await classify_with_intent(title, app, intent)
        status_text = "NOT paused (Focused/Ignored)" if is_focused == "focused" else "PAUSED (Distracted)"
        
        print(f"Result: {status_text}")
        print(f"Reason: {reason}")
        print("-" * 50)
        
        # Restore whitelist
        OS_WHITELIST.clear()
        OS_WHITELIST.extend(original_whitelist)

if __name__ == '__main__':
    asyncio.run(main())
