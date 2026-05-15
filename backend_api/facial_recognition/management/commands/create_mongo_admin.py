import getpass
import datetime
from django.core.management.base import BaseCommand
from facial_recognition.services.utils import get_mongo_db, hash_password_bcrypt

class Command(BaseCommand):
    help = 'Crée un administrateur MongoDB (pour initialiser le système)'

    def handle(self, *args, **kwargs):
        self.stdout.write("--- Création d'un Administrateur ---")
        username = input("Nom d'utilisateur: ").strip()
        if not username:
            self.stderr.write("Le nom d'utilisateur est requis.")
            return

        email = input("Email (optionnel): ").strip()

        password = getpass.getpass("Mot de passe: ")
        if not password:
            self.stderr.write("Le mot de passe est requis.")
            return

        password_confirm = getpass.getpass("Confirmez le mot de passe: ")
        if password != password_confirm:
            self.stderr.write("Les mots de passe ne correspondent pas.")
            return

        try:
            db = get_mongo_db()
            collection = db['admin_users']

            if collection.find_one({'username': username}):
                self.stderr.write(f"L'utilisateur '{username}' existe déjà.")
                return

            admin_doc = {
                'username': username,
                'password_hash': hash_password_bcrypt(password),
                'email': email,
                'is_active': True,
                'is_superuser': True,
                'created_at': datetime.datetime.utcnow().isoformat(),
                'last_login': None
            }

            result = collection.insert_one(admin_doc)
            self.stdout.write(self.style.SUCCESS(f"L'administrateur '{username}' a été créé avec succès avec l'ID {result.inserted_id}."))

        except Exception as e:
            self.stderr.write(f"Erreur lors de la création : {e}")
