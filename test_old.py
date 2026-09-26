import requests; r = requests.post('https://prodify-production.up.railway.app/workspaces', json={'user_id': 1, 'name': 'coding', 'mode': 'sprint'}); print(r.status_code, r.text)
