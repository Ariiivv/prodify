import jwt  
t = jwt.encode({'a': 1}, 'sec', algorithm='HS512')  
try:  
    jwt.decode(t, 'sec', algorithms=['HS256'])  
except Exception as e:  
    print(repr(e))  
