import requests; r = requests.options('https://prodify-production.up.railway.app/workspaces'); print(r.status_code, r.headers)
