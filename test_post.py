import os, sys, urllib.request, json
req = urllib.request.Request('http://127.0.0.1:8000/workspaces', data=b'{\"name\":\"Test3\",\"mode\":\"structured\",\"category\":\"mastery\"}', headers={'Content-Type':'application/json'})
# Need auth header! I can't easily get it unless I bypass auth. I'll just look at the backend code again.
