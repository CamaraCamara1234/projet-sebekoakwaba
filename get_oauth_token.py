import os
import json
from google_auth_oauthlib.flow import InstalledAppFlow

# Instructions:
# 1. Allez sur https://console.cloud.google.com/
# 2. Créez un projet ou utilisez un projet existant
# 3. Allez dans "API et services" > "Écran de consentement OAuth", choisissez "Externe", remplissez les infos obligatoires, et ajoutez-vous comme "Utilisateur test".
# 4. Allez dans "Identifiants" > "Créer des identifiants" > "ID client OAuth". Type: "Application de bureau".
# 5. Téléchargez le fichier JSON et renommez-le `client_secret.json`, puis placez-le dans ce dossier.
# 6. Lancez ce script : `python get_oauth_token.py`

SCOPES = ['https://www.googleapis.com/auth/drive']

def main():
    if not os.path.exists('client_secret.json'):
        print("Erreur : Fichier client_secret.json introuvable.")
        print("Veuillez télécharger vos identifiants OAuth2 depuis Google Cloud Console et les placer ici.")
        return

    flow = InstalledAppFlow.from_client_secrets_file('client_secret.json', SCOPES)
    creds = flow.run_local_server(port=0)

    print("\n" + "="*50)
    print("AUTHENTIFICATION RÉUSSIE !")
    print("="*50)
    print("Ajoutez les lignes suivantes à votre fichier .env :")
    print("")
    print(f"GOOGLE_DRIVE_REFRESH_TOKEN=\"{creds.refresh_token}\"")
    print(f"GOOGLE_DRIVE_CLIENT_ID=\"{creds.client_id}\"")
    print(f"GOOGLE_DRIVE_CLIENT_SECRET=\"{creds.client_secret}\"")
    print("="*50)

if __name__ == '__main__':
    main()
