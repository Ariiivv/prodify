import jwt  
t = jwt.encode({'aud': 'authenticated'}, 'sec', algorithm='HS256')  
try:  
    jwt.decode(t, 'sec', algorithms=['HS256'], audience='authenticated', options={'verify_aud': False})  
    print('Success!')  
except Exception as e:  
    print(repr(e))  
