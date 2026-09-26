import urllib.request, json
req = urllib.request.Request('http://localhost:8000/workspaces', data=b'{"name":"Test","mode":"structured","category":"mastery"}', headers={'Content-Type':'application/json'})
try:
    print(urllib.request.urlopen(req).read().decode('utf-8'))
except Exception as e:
    print(e.read().decode('utf-8') if hasattr(e, 'read') else str(e))
