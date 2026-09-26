import requests; r = requests.post('https://prodify-production.up.railway.app/workspaces', headers={'Authorization': 'Bearer test'}, json={}); print(r.status_code, r.text)
