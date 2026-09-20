import jwt
import base64

raw_secret = b"my_super_secret_bytes_123456789012"
b64_secret = base64.b64encode(raw_secret).decode("utf-8")

# Supabase signs with the raw bytes (which it holds internally)
token = jwt.encode({"sub": "123"}, raw_secret, algorithm="HS256")

# Will verifying with the base64 string work?
try:
    jwt.decode(token, b64_secret, algorithms=["HS256"])
    print("Verifying with b64 string worked!")
except Exception as e:
    print("Failed with b64 string:", e)

# Will verifying with the decoded bytes work?
try:
    jwt.decode(token, base64.b64decode(b64_secret), algorithms=["HS256"])
    print("Verifying with decoded bytes worked!")
except Exception as e:
    print("Failed with decoded bytes:", e)
