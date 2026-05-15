from django.http import JsonResponse
import os
from django.conf import settings
from PIL import Image
import shutil
import logging
import hashlib
from rest_framework.response import Response
from rest_framework import status
import base64
import pymongo
from bson import ObjectId
import requests
import jwt
import bcrypt
import datetime
import re

logger = logging.getLogger(__name__)

def is_valid_uuid(val):
    """Vérifie si la valeur est un UUID valide pour empêcher les failles Path Traversal."""
    return bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', str(val).lower()))

# ─── MongoDB Singleton ───────────────────────────────────────────────────────

_mongo_client = None  # Instance réutilisée pour la durée de vie du processus


def get_mongo_client():
    """
    Retourne un client MongoDB singleton (réutilise la connexion existante).
    Thread-safe pour les workers Gunicorn/Uvicorn car pymongo gère un pool interne.
    """
    global _mongo_client
    if _mongo_client is None:
        mongo_uri = getattr(settings, 'MONGO_URI', 'mongodb://localhost:27017/')
        username = getattr(settings, 'MONGO_USERNAME', None)
        password = getattr(settings, 'MONGO_PASSWORD', None)

        if username and password:
            _mongo_client = pymongo.MongoClient(
                mongo_uri,
                username=username,
                password=password,
                authSource='admin',
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
            )
        else:
            _mongo_client = pymongo.MongoClient(
                mongo_uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
            )
        logger.info("Connexion MongoDB initialisée (singleton).")
    return _mongo_client


def get_mongo_db():
    """Retourne la base de données MongoDB (via client singleton)."""
    client = get_mongo_client()
    db_name = getattr(settings, 'MONGO_DB_NAME', 'akwabacheckid_db')
    return client[db_name]



# ─── Password Helpers (bcrypt) ───────────────────────────────────────────────

def hash_password_bcrypt(password: str) -> str:
    """Hash un mot de passe avec bcrypt (sel automatique)."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password_bcrypt(password: str, hashed: str) -> bool:
    """Vérifie un mot de passe contre son hash bcrypt."""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def hash_password_sha256(password: str) -> str:
    """Legacy SHA-256 hash — utilisé uniquement pour la migration."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


# ─── JWT Token Helpers ───────────────────────────────────────────────────────

def generate_access_token(user_id: str, username: str) -> dict:
    """Génère un access token JWT (courte durée)."""
    lifetime = getattr(settings, 'JWT_ACCESS_TOKEN_LIFETIME_MINUTES', 30)
    now = datetime.datetime.utcnow()
    exp = now + datetime.timedelta(minutes=lifetime)

    payload = {
        'user_id': user_id,
        'username': username,
        'type': 'access',
        'iat': now,
        'exp': exp,
    }

    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )

    return {
        'access_token': token,
        'expires_in': lifetime * 60,  # en secondes
    }


def generate_refresh_token(user_id: str) -> str:
    """Génère un refresh token JWT (longue durée)."""
    lifetime_days = getattr(settings, 'JWT_REFRESH_TOKEN_LIFETIME_DAYS', 7)
    now = datetime.datetime.utcnow()
    exp = now + datetime.timedelta(days=lifetime_days)

    payload = {
        'user_id': user_id,
        'type': 'refresh',
        'iat': now,
        'exp': exp,
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )


def decode_jwt_token(token: str) -> dict:
    """
    Décode et vérifie un token JWT.
    Retourne le payload ou lève une exception.
    """
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM]
    )


def verify_jwt_token(request) -> bool:
    """
    Vérifie le token Bearer JWT dans l'en-tête Authorization.
    Retourne True si le token est valide et de type 'access'.
    """
    auth_header = request.headers.get('Authorization', '')

    # Support both "Bearer xxx" and legacy "Token xxx"
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
    elif auth_header.startswith('Token '):
        token = auth_header.split(' ', 1)[1].strip()
    else:
        return False

    try:
        payload = decode_jwt_token(token)
        # Vérifier que c'est un access token
        if payload.get('type') != 'access':
            return False
        return True
    except jwt.ExpiredSignatureError:
        logger.warning("JWT access token expiré")
        return False
    except jwt.InvalidTokenError as e:
        logger.warning(f"JWT invalide: {e}")
        return False


def get_user_from_token(request) -> dict:
    """
    Extrait les informations de l'utilisateur depuis le JWT.
    Retourne {'user_id': ..., 'username': ...} ou None.
    """
    auth_header = request.headers.get('Authorization', '')

    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
    elif auth_header.startswith('Token '):
        token = auth_header.split(' ', 1)[1].strip()
    else:
        return None

    try:
        payload = decode_jwt_token(token)
        return {
            'user_id': payload.get('user_id'),
            'username': payload.get('username'),
        }
    except Exception:
        return None


# ─── Legacy compat: verify_mongo_token kept as fallback ──────────────────────
# (will be removed in a future version)

def verify_mongo_token(request) -> bool:
    """Fallback — vérifie via JWT d'abord, puis legacy token MongoDB."""
    # Try JWT first
    if verify_jwt_token(request):
        return True

    # Legacy fallback: plain token in MongoDB
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Token '):
        return False
    token = auth_header.split(' ', 1)[1].strip()
    try:
        db = get_mongo_db()
        user = db['admin_users'].find_one({'token': token, 'is_active': True})
        return user is not None
    except Exception:
        return False


# ─── Utility Functions ───────────────────────────────────────────────────────

def image_to_base64(image_path):
    """Convertit une image en chaîne base64 avec préfixe MIME"""
    try:
        if not image_path or not os.path.exists(image_path):
            return None
        
        ext = os.path.splitext(image_path)[1].lower().replace('.', '')
        if ext == 'jpg': ext = 'jpeg'
        
        with open(image_path, "rb") as img_file:
            b64_string = base64.b64encode(img_file.read()).decode('utf-8')
            return f"data:image/{ext};base64,{b64_string}"
    except Exception as e:
        logger.error(f"Erreur conversion base64: {e}")
        return None


def compress_and_save_image(src_path, dest_path, quality=60):
    """Compresse une image en JPEG et la sauvegarde au chemin de destination."""
    try:
        if not src_path or not os.path.exists(src_path):
            return False
            
        # Créer les dossiers parents si nécessaire
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        
        # S'assurer que l'extension est .jpg pour la compression
        if not dest_path.lower().endswith('.jpg'):
            dest_path = os.path.splitext(dest_path)[0] + '.jpg'
            
        with Image.open(src_path) as img:
            # Convertir en RGB si l'image est en mode RGBA (PNG transparent)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
                
            img.save(dest_path, 'JPEG', optimize=True, quality=quality)
        return dest_path
    except Exception as e:
        logger.error(f"Erreur lors de la compression de {src_path}: {e}")
        return False


def compress_session_images(session_id, images_paths_dict):
    """
    Compresse toutes les images associées à une session, 
    les place dans le dossier d'archivage et retourne les nouveaux chemins relatifs.
    """
    if not session_id or not is_valid_uuid(session_id) or not images_paths_dict:
        return {}
        
    archive_dir = getattr(settings, 'IMAGES_ARCHIVE_DIR', os.path.join(settings.MEDIA_ROOT, 'archives'))
    session_archive_dir = os.path.join(archive_dir, session_id)
    quality = getattr(settings, 'IMAGE_COMPRESSION_QUALITY', 60)
    
    new_paths = {}
    
    for key, rel_path in images_paths_dict.items():
        if not rel_path or rel_path == 'N/A':
            continue
            
        # Construire le chemin source absolu
        # Le rel_path est typiquement de la forme "/media/..."
        if rel_path.startswith(settings.MEDIA_URL):
            # Enlever le préfixe MEDIA_URL pour avoir le chemin dans MEDIA_ROOT
            media_rel_path = rel_path[len(settings.MEDIA_URL):]
            src_path = os.path.join(settings.MEDIA_ROOT, media_rel_path)
        else:
            # Fallback
            src_path = os.path.join(settings.BASE_DIR, rel_path.lstrip('/'))
            
        if not os.path.exists(src_path):
            logger.warning(f"Fichier image introuvable pour archivage: {src_path}")
            continue
            
        # Construire le chemin de destination
        filename = os.path.basename(src_path)
        dest_filename = f"{key}_{filename}"
        if not dest_filename.lower().endswith('.jpg'):
            dest_filename = os.path.splitext(dest_filename)[0] + '.jpg'
            
        dest_path = os.path.join(session_archive_dir, dest_filename)
        
        # Compresser et sauvegarder
        saved_path = compress_and_save_image(src_path, dest_path, quality=quality)
        
        if saved_path:
            # Créer l'URL relative (e.g. /media/archives/{session_id}/...)
            # Trouver la position de 'media' dans le chemin pour construire l'URL correctement
            media_index = saved_path.find(os.path.normpath('/media/'))
            if media_index == -1:
                media_index = saved_path.find(os.path.normpath('\\media\\'))
                
            if media_index != -1:
                # Extraire à partir de "/media/..." et normaliser avec des slash
                url_path = saved_path[media_index:].replace('\\', '/')
                new_paths[key] = url_path
            else:
                # Fallback simple
                new_paths[key] = f"{settings.MEDIA_URL}archives/{session_id}/{os.path.basename(saved_path)}"
                
    return new_paths


def clear_session_files(session_id):
    """
    Nettoie uniquement les fichiers d'une session spécifique
    """
    if not session_id or not is_valid_uuid(session_id):
        return JsonResponse({
            "status": "error",
            "message": "Session ID invalide ou manquant"
        }, status=400)

    dirs_to_clear = ['preprocessed_imgs', 'extracted_regions', 'temp']
    cleared = []
    errors = []

    for folder in dirs_to_clear:
        folder_path = os.path.join(settings.MEDIA_ROOT, folder)
        
        if not os.path.exists(folder_path):
            logger.info(f"Dossier {folder} non trouvé, skip.")
            continue

        if folder == 'extracted_regions' or folder == 'temp':
            # Pour ces dossiers, on a un sous-dossier par session
            session_folder = os.path.join(folder_path, session_id)
            if os.path.exists(session_folder):
                try:
                    shutil.rmtree(session_folder)
                    cleared.append(f"{folder}/{session_id}")
                    logger.info(f"Session {session_id} - Dossier supprimé: {session_folder}")
                except Exception as e:
                    errors.append(f"Erreur suppression {folder}/{session_id}: {str(e)}")
            else:
                logger.debug(f"Session {session_id} - Dossier non trouvé dans {folder}")
        
        elif folder == 'preprocessed_imgs':
            try:
                # Supprimer uniquement les fichiers qui commencent par session_id_
                deleted_count = 0
                prefix = f"{session_id}_"
                for filename in os.listdir(folder_path):
                    if filename.startswith(prefix) and filename.lower().endswith('.jpg'):
                        file_path = os.path.join(folder_path, filename)
                        os.unlink(file_path)
                        deleted_count += 1
                
                if deleted_count > 0:
                    cleared.append(f"{folder} ({deleted_count} fichiers)")
                    logger.info(f"Session {session_id} - {deleted_count} fichiers supprimés dans {folder}")
            except Exception as e:
                errors.append(f"Erreur dans {folder}: {str(e)}")

    status = "success" if not errors else "partial"
    return JsonResponse({
        "status": status,
        "session_id": session_id,
        "cleared": cleared,
        "errors": errors
    })

def get_users():
    db = get_mongo_db()
    collection = db['identifications']

    users = list(collection.find().limit(20))

    for user in users:
        user['_id'] = str(user['_id'])

    return users

def set_statut(user_id, state):
    try:
        api_key = settings.API_KEY_AKWABA
        url = f'https://akwabasebeko.com/api/users/{user_id}/state'
        
        headers = {
            'X-API-KEY': api_key,
            'Accept': 'application/json',
        }
        payload = {'state': state}
        
        ext_response = requests.post(url, headers=headers, json=payload, timeout=10)
        
        return ext_response
    except Exception as e:
        logger.error(f"Session - Erreur API externe : {str(e)}")
        return str(e)
