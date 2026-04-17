from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import os
from django.conf import settings
from PIL import Image
import shutil
import numpy as np
import logging
import hashlib
import secrets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .services.verify_faces_service import verify_faces_service
import base64
import requests
import pymongo
import datetime
import json

# ─── MongoDB Auth Helpers ────────────────────────────────────────────────────

def get_mongo_db():
    """Retourne la collection admin_users de MongoDB."""
    client = pymongo.MongoClient(getattr(settings, 'MONGO_URI', 'mongodb://localhost:27017/'))
    db = client[getattr(settings, 'MONGO_DB_NAME', 'akwabacheckid_db')]
    return db

def hash_password(password: str) -> str:
    """Hash SHA-256 du mot de passe."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def verify_mongo_token(request) -> bool:
    """Vérifie le token Bearer dans l'en-tête Authorization contre MongoDB."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Token '):
        return False
    token = auth_header.split(' ', 1)[1].strip()
    db = get_mongo_db()
    user = db['admin_users'].find_one({'token': token, 'is_active': True})
    return user is not None

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


logger = logging.getLogger(__name__)


DLIB_THRESHOLD = 0.07
ARC_THRESHOLD = 0.68

# Vue d'enregistrement
LOCK_FILE = os.path.join(settings.BASE_DIR, 'register_user.lock')


@csrf_exempt
def verify_faces(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)

    session_id = request.POST.get('session_id')

    try:
        # Chemin de l'image de référence
        img1_path = os.path.join(
            settings.MEDIA_ROOT, 'extracted_regions',session_id, 'photo.png')

        if not os.path.exists(img1_path):
            return JsonResponse({'error': 'Image de référence introuvable'}, status=404)

        img2 = request.FILES.get('image')
        if not img2:
            return JsonResponse({'error': 'Une image est requise'}, status=400)

        # Chemin de destination pour l'image uploadée
        extracted_dir = os.path.join(settings.MEDIA_ROOT, 'extracted_regions',session_id)
        os.makedirs(extracted_dir, exist_ok=True)
        img2_path = os.path.join(extracted_dir, 'photo_capture.png')

        try:
            # Ouvrir l'image avec PIL
            img = Image.open(img2)

            if img.mode != 'RGB':
                img = img.convert('RGB')

            img.save(img2_path, 'PNG')
        except Exception as img_error:
            return JsonResponse({'error': f'Erreur de traitement de l\'image: {str(img_error)}'}, status=400)

        # Vérification des visages
        # result = DeepFace.verify(
        #     img1_path=img1_path,
        #     img2_path=img2_path,
        #     model_name="Dlib",
        #     detector_backend="opencv",
        #     enforce_detection=False,
        #     align=True
        # )
        result = verify_faces_service(img1_path, img2_path)

        # Préparer la réponse
        distance = result.distance
        verified = distance <= DLIB_THRESHOLD
        similarity_percent = calculate_similarity(distance)

        return JsonResponse({
            'verified': verified,
            'distance': float(result.distance),
            'threshold': DLIB_THRESHOLD,
            'confidence': similarity_percent,
            'model': 'ArcFace',
            'uploaded_image': settings.MEDIA_URL + f"extracted_regions/{session_id}/photo_capture.png",
            'photo_capture_base64': image_to_base64(img2_path)
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)



@api_view(['POST'])
def verify_face_endpoint(request):

    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)

    session_id = request.POST.get('session_id')

    if not session_id:
        return JsonResponse({'error': 'session_id requis'}, status=400)

    try:

        # -----------------------------
        # Image 1 : photo extraite du document
        # -----------------------------
        img1_path = os.path.join(
            settings.MEDIA_ROOT,
            'extracted_regions',
            session_id,
            'photo.png'
        )

        if not os.path.exists(img1_path):
            return JsonResponse(
                {'error': 'Image de référence introuvable'},
                status=404
            )

        # -----------------------------
        # Image 2 : photo selfie envoyée
        # -----------------------------
        img2 = request.FILES.get('image')

        if not img2:
            return JsonResponse(
                {'error': 'Une image est requise'},
                status=400
            )

        extracted_dir = os.path.join(
            settings.MEDIA_ROOT,
            'extracted_regions',
            session_id
        )

        os.makedirs(extracted_dir, exist_ok=True)

        img2_path = os.path.join(extracted_dir, 'photo_capture.png')

        # sauvegarde image uploadée
        with open(img2_path, 'wb+') as destination:
            for chunk in img2.chunks():
                destination.write(chunk)

        # -----------------------------
        # Vérification faciale
        # -----------------------------
        result = verify_faces_service(img1_path, img2_path)

        return JsonResponse({
            "similarity": result.similarity,
            "verified": result.verified,
            "threshold": result.threshold,
            "distance": result.distance,
            "message": result.message,
            "photo_capture_base64": image_to_base64(img2_path)
        })

    except Exception as e:

        return JsonResponse(
            {'error': f'Erreur serveur : {str(e)}'},
            status=500
        )
    
@csrf_exempt
def finalisation_process(request):
    """
    Endpoint final recevant les données via FormData pour clôturer le processus.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)

    try:
        # Données reçues via FormData
        data = request.POST
        session_id = data.get('session_id', 'N/A')

        response_data = {
            "date_expiration": data.get('date_expiration', ""),
            "prenom": data.get('prenom', ""),
            "cin": data.get('cin', ""),
            "nationalite": data.get('nationalite', ""),
            "nom": data.get('nom', ""),
            "date_naissance": data.get('date_naissance', ""),
            "code": data.get('code', ""),
            "motif_sejour": data.get('motif_sejour', ""),
            "adresse": data.get('adresse', ""),
            "sexe": data.get('sexe', ""),
            "type_piece": data.get('type_piece', ""),
            "session_id": session_id,
            "statut_verification": data.get('statut_verification', "valide"),
        }

        # --- Appel API Externe pour mettre à jour l'état de l'utilisateur ---
        user_id = data.get('user_id')
        statut_verification = data.get('statut_verification', "en_cours")
        print(f"Session {session_id} - Appel API externe (user {user_id}): {statut_verification}")

        if user_id:
            try:
                api_key = 'a7f3d2e9b1c84f6a2d5e8b3c7f1a4d9e2b6c8f3a1d7e4b2c9f5a3d8e1b6c4f7'
                url = f'https://akwabasebeko.com/api/users/{user_id}/state'
                
                # Mapping : valide -> 1 (activé), en_cours -> 2 (en attente)
                state = 1 if statut_verification == "valide" else 2
                print(f"Session {session_id} - Appel API externe (user {user_id}): {state}")
                headers = {
                    'X-API-KEY': api_key,
                    'Accept': 'application/json',
                }
                payload = {'state': state}
                
                ext_response = requests.post(url, headers=headers, json=payload, timeout=10)
                print(f"Session {session_id} - API externe (user {user_id}): {ext_response.status_code}")
                
                response_data["api_extern_status"] = ext_response.status_code
                try:
                    response_data["api_extern_response"] = ext_response.json()
                except:
                    pass
            except Exception as e:
                logger.error(f"Session {session_id} - Erreur API externe : {str(e)}")
                response_data["api_extern_error"] = str(e)

        logger.info(f"Session {session_id} - Processus de finalisation terminé avec succès.")
        return JsonResponse(response_data)

    except Exception as e:
        logger.error(f"Erreur finalisation : {str(e)}")
        return JsonResponse({
            'error': f'Erreur lors du traitement final : {str(e)}'
        }, status=500)


def clear_media_dirs(request):
    # Récupérer session_id depuis les paramètres GET ou POST
    session_id = request.GET.get('session_id') or request.POST.get('session_id')
    
    # Si session_id est fourni, nettoyer uniquement cette session
    if session_id:
        return clear_session_files(session_id)
    return JsonResponse({
        "status": "error",
        "message": "Session ID requis"
    })
    


def clear_session_files(session_id):
    """
    Nettoie uniquement les fichiers d'une session spécifique
    """
    if not session_id:
        return JsonResponse({
            "status": "error",
            "message": "Session ID requis"
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

def calculate_similarity(distance, DLIB_THRESHOLD=0.08):
    if distance <= 0.07:  # 0-0.07
        return 100.0
    elif distance <= 0.14:  # 0.07-0.14
        return 90.0
    elif distance <= 0.21:  # 0.14-0.21
        return 80.0
    elif distance <= 0.28:  # 0.21-0.28
        return 70.0
    elif distance <= 0.35:  # 0.28-0.35
        return 60.0
    elif distance <= 0.42:  # 0.35-0.42
        return 50.0
    elif distance <= 0.49:  # 0.42-0.49
        return 40.0
    elif distance <= 0.56:  # 0.49-0.56
        return 30.0
    elif distance <= DLIB_THRESHOLD:  # 0.56-0.68
        return 20.0
    else:  # > 0.68
        return 0.0

@csrf_exempt
def save_pending_identification(request):
    """
    Endpoint for saving identification data to MongoDB when status is 'en_cours'.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)

    try:
        data = request.POST.dict() 
        statut_verification = data.get('statut_verification', "en_cours")
        
        if statut_verification != "en_cours":
            return JsonResponse({'message': 'Ignoré, le statut n\'est pas en_cours', 'saved': False})

        # Process complex fields if any
        for key in ['images_base64', 'mrz_data', 'extracted_data', 'data_verified']:
            if key in data and isinstance(data[key], str):
                try:
                    data[key] = json.loads(data[key])
                except Exception:
                    pass
                    
        # Add timestamp
        data['created_at'] = datetime.datetime.utcnow().isoformat()

        # Connect to MongoDB
        client = pymongo.MongoClient(getattr(settings, 'MONGO_URI', 'mongodb://localhost:27017/'))
        db_name = getattr(settings, 'MONGO_DB_NAME', 'akwabacheckid_db')
        db = client[db_name]
        collection = db['identifications']
        
        # Insert data
        result = collection.insert_one(data)
        
        logger.info(f"Session {data.get('session_id', 'N/A')} - Données en_cours sauvegardées dans MongoDB (ID: {result.inserted_id})")
        return JsonResponse({
            'message': 'Données sauvegardées avec succès',
            'saved': True,
            'id': str(result.inserted_id)
        })

    except Exception as e:
        logger.error(f"Erreur lors de la sauvegarde MongoDB : {str(e)}")
        return JsonResponse({'error': f'Erreur lors de la sauvegarde : {str(e)}'}, status=500)

@csrf_exempt
def get_dashboard_data(request):
    """
    Endpoint pour récupérer les identifications 'en_cours'.
    Nécessite un token MongoDB valide dans l'en-tête Authorization.
    """
    if not verify_mongo_token(request):
        return JsonResponse({'error': 'Non autorisé. Token invalide ou manquant.'}, status=401)

    try:
        db = get_mongo_db()
        collection = db['identifications']

        cursor = collection.find({"statut_verification": "en_cours"}).sort("created_at", -1)
        documents = []
        for doc in cursor:
            doc['_id'] = str(doc['_id'])
            documents.append(doc)

        return JsonResponse({'data': documents}, status=200)

    except Exception as e:
        logger.error(f"Dashboard data fetch error: {str(e)}")
        return JsonResponse({'error': f'Erreur lors du chargement des données : {str(e)}'}, status=500)


@csrf_exempt
def login_view(request):
    """
    Authentification admin via MongoDB.
    POST { "username": "...", "password": "..." }
    Retourne { "token": "..." }
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)

    try:
        body = json.loads(request.body.decode('utf-8'))
        username = body.get('username', '').strip()
        password = body.get('password', '').strip()
    except Exception:
        return JsonResponse({'error': 'Corps de requête JSON invalide'}, status=400)

    if not username or not password:
        return JsonResponse({'error': 'Username et password requis'}, status=400)

    try:
        db = get_mongo_db()
        user = db['admin_users'].find_one({
            'username': username,
            'password_hash': hash_password(password),
            'is_active': True
        })

        if not user:
            return JsonResponse({'error': 'Identifiants incorrects'}, status=400)

        # Générer un nouveau token à chaque login
        token = secrets.token_hex(32)
        db['admin_users'].update_one(
            {'_id': user['_id']},
            {'$set': {'token': token, 'last_login': datetime.datetime.utcnow().isoformat()}}
        )

        logger.info(f"Connexion admin réussie: {username}")
        return JsonResponse({'token': token}, status=200)

    except Exception as e:
        logger.error(f"Erreur login: {str(e)}")
        return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)


@csrf_exempt
def create_admin_view(request):
    """
    Crée un admin dans MongoDB.
    POST { "username": "...", "password": "...", "email": "..." }
    Protégé par un secret de création optionnel.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)

    try:
        body = json.loads(request.body.decode('utf-8'))
        username = body.get('username', '').strip()
        password = body.get('password', '').strip()
        email = body.get('email', '').strip()
    except Exception:
        return JsonResponse({'error': 'Corps de requête JSON invalide'}, status=400)

    if not username or not password:
        return JsonResponse({'error': 'Veuillez fournir un username et password.'}, status=400)

    try:
        db = get_mongo_db()
        existing = db['admin_users'].find_one({'username': username})
        if existing:
            return JsonResponse({'message': 'Cet administrateur existe déjà.'}, status=200)

        token = secrets.token_hex(32)
        admin_doc = {
            'username': username,
            'password_hash': hash_password(password),
            'email': email,
            'token': token,
            'is_active': True,
            'is_superuser': True,
            'created_at': datetime.datetime.utcnow().isoformat(),
            'last_login': None
        }
        result = db['admin_users'].insert_one(admin_doc)

        logger.info(f"Admin créé: {username} (ID: {result.inserted_id})")
        return JsonResponse({
            'message': f'Administrateur {username} créé avec succès.',
            'id': str(result.inserted_id)
        }, status=201)

    except Exception as e:
        logger.error(f"Erreur création admin: {str(e)}")
        return JsonResponse({'error': f'Erreur lors de la création : {str(e)}'}, status=500)
