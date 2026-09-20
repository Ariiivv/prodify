import jwt
import os

token = jwt.encode({"sub": "123"}, "secret", algorithm="HS256")
try:
    jwt.decode(token, "secret", algorithms=["HS256"])
    print("Plain string works")
except Exception as e:
    print("Plain string fails:", e)
