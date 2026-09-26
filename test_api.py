import sys
sys.path.insert(0, './backend')
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

from app.api.auth import get_current_user
from app.models.schemas import User

async def override_get_current_user():
    return User(id='test_user_1', email='test@example.com', username='test')

app.dependency_overrides[get_current_user] = override_get_current_user

response = client.post('/workspaces', json={'name': 'Test', 'mode': 'structured', 'category': 'mastery'})
print('STATUS:', response.status_code)
print('JSON:', response.json())

