import requests; r = requests.get('https://prodify-production.up.railway.app/workspaces', headers={'Authorization': 'Bearer test'}); print(r.status_code, r.text)
