import requests

user_id = 15786
api_key = 'a7f3d2e9b1c84f6a2d5e8b3c7f1a4d9e2b6c8f3a1d7e4b2c9f5a3d8e1b6c4f7'

url = 'https://akwabasebeko.com/api/users/' + str(user_id) + '/state'

headers = {
    'X-API-KEY': api_key,
    'Accept': 'application/json',
}

# ✅ Changer state ici : 0, 1 ou 2
data = {
    'state': 1  # 0 = désactivé, 1 = activé, 2 = En attente
}

response = requests.post(url, headers=headers, json=data)

print(response.status_code)
print(response.json())