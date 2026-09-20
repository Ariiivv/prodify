import requests

BASE_URL = "http://127.0.0.1:8000/api"
headers = {"Authorization": "Bearer dev-token"}

# 1. Create a workspace
print("1. Creating workspace...")
ws_data = {
    "name": "Test Wipe Workspace",
    "mode": "Flexible Tracking Mode",
    "work_duration": 25,
    "break_duration": 5
}
r_ws = requests.post("http://127.0.0.1:8000/workspaces", json=ws_data, headers=headers)
print(r_ws.status_code, r_ws.text)
workspace_id = r_ws.json()["id"]

# 2. Add some chat history
print("2. Adding chat message...")
chat_data = {
    "role": "user",
    "content": "Hello coach"
}
r_chat = requests.post(f"http://127.0.0.1:8000/workspaces/{workspace_id}/chat-history", json=chat_data, headers=headers)
print(r_chat.status_code, r_chat.text)

# 3. Check workspaces
r_all = requests.get("http://127.0.0.1:8000/workspaces", headers=headers)
print("Workspaces before reset:", [w["name"] for w in r_all.json()])

# 4. Trigger reset
print("4. Triggering reset...")
r_reset = requests.delete(f"{BASE_URL}/users/me/reset-data", headers=headers)
print(r_reset.status_code, r_reset.json())

# 5. Check workspaces again
r_all_after = requests.get("http://127.0.0.1:8000/workspaces", headers=headers)
print("Workspaces after reset:", len(r_all_after.json()))
