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
from bson import ObjectId
from .services.utils import (
    image_to_base64, get_mongo_db, verify_mongo_token, clear_session_files,
    set_statut, get_users, hash_password_bcrypt, verify_password_bcrypt,
    hash_password_sha256, generate_access_token, generate_refresh_token,
    decode_jwt_token, verify_jwt_token
)
import jwt


logger = logging.getLogger(__name__)

# Vue d'enregistrement
LOCK_FILE = os.path.join(settings.BASE_DIR, 'register_user.lock')


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
                ext_response = set_statut(user_id=user_id, state=state)

                if ext_response.status_code != 200:
                    return JsonResponse({
                        'error': 'Erreur API externe',
                        'details': ext_response.text
                    }, status=500)

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
        
        if statut_verification not in ["en_cours", "valide"]:
            return JsonResponse({'message': 'Ignoré, le statut n\'est pas pris en charge', 'saved': False})

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

        cursor = collection.find({"statut_verification": {"$in": ["en_cours", "valide"]}}).sort("created_at", -1)
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
    Authentification admin via MongoDB + JWT.
    POST { "username": "...", "password": "..." }
    Retourne { "access_token": "...", "refresh_token": "...", "expires_in": ... }
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
            'is_active': True
        })

        if not user:
            return JsonResponse({'error': 'Identifiants incorrects'}, status=400)

        # Vérifier le mot de passe : bcrypt d'abord, puis fallback SHA-256
        password_valid = False
        stored_hash = user.get('password_hash', '')

        if stored_hash.startswith('$2'):
            # Hash bcrypt
            password_valid = verify_password_bcrypt(password, stored_hash)
        else:
            # Legacy SHA-256 — vérifier et migrer vers bcrypt
            legacy_hash = hash_password_sha256(password)
            if legacy_hash == stored_hash:
                password_valid = True
                # Auto-migration vers bcrypt
                new_hash = hash_password_bcrypt(password)
                db['admin_users'].update_one(
                    {'_id': user['_id']},
                    {'$set': {'password_hash': new_hash}}
                )
                logger.info(f"Mot de passe de {username} migré vers bcrypt")

        if not password_valid:
            return JsonResponse({'error': 'Identifiants incorrects'}, status=400)

        # Générer les tokens JWT
        user_id = str(user['_id'])
        access_data = generate_access_token(user_id, username)
        refresh_token = generate_refresh_token(user_id)

        # Mettre à jour last_login
        db['admin_users'].update_one(
            {'_id': user['_id']},
            {'$set': {'last_login': datetime.datetime.utcnow().isoformat()}}
        )

        logger.info(f"Connexion admin réussie (JWT): {username}")
        return JsonResponse({
            'access_token': access_data['access_token'],
            'refresh_token': refresh_token,
            'expires_in': access_data['expires_in'],
        }, status=200)

    except Exception as e:
        logger.error(f"Erreur login: {str(e)}")
        return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)


@csrf_exempt
def create_admin_view(request):
    """
    Crée un admin dans MongoDB avec bcrypt.
    POST { "username": "...", "password": "...", "email": "..." }
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

        admin_doc = {
            'username': username,
            'password_hash': hash_password_bcrypt(password),
            'email': email,
            'is_active': True,
            'is_superuser': True,
            'created_at': datetime.datetime.utcnow().isoformat(),
            'last_login': None
        }
        result = db['admin_users'].insert_one(admin_doc)

        logger.info(f"Admin créé (bcrypt): {username} (ID: {result.inserted_id})")
        return JsonResponse({
            'message': f'Administrateur {username} créé avec succès.',
            'id': str(result.inserted_id)
        }, status=201)

    except Exception as e:
        logger.error(f"Erreur création admin: {str(e)}")
        return JsonResponse({'error': f'Erreur lors de la création : {str(e)}'}, status=500)


@csrf_exempt
def refresh_token_view(request):
    """
    Renouvelle l'access token à partir d'un refresh token valide.
    POST { "refresh_token": "..." }
    Retourne { "access_token": "...", "expires_in": ... }
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)

    try:
        body = json.loads(request.body.decode('utf-8'))
        refresh_token = body.get('refresh_token', '').strip()
    except Exception:
        return JsonResponse({'error': 'Corps de requête JSON invalide'}, status=400)

    if not refresh_token:
        return JsonResponse({'error': 'refresh_token requis'}, status=400)

    try:
        payload = decode_jwt_token(refresh_token)

        # Vérifier que c'est bien un refresh token
        if payload.get('type') != 'refresh':
            return JsonResponse({'error': 'Token invalide (type incorrect)'}, status=401)

        user_id = payload.get('user_id')

        # Vérifier que l'utilisateur existe toujours et est actif
        db = get_mongo_db()
        user = db['admin_users'].find_one({
            '_id': ObjectId(user_id),
            'is_active': True
        })

        if not user:
            return JsonResponse({'error': 'Utilisateur introuvable ou désactivé'}, status=401)

        # Générer un nouveau access token
        access_data = generate_access_token(user_id, user.get('username', ''))

        return JsonResponse({
            'access_token': access_data['access_token'],
            'expires_in': access_data['expires_in'],
        }, status=200)

    except jwt.ExpiredSignatureError:
        return JsonResponse({'error': 'Refresh token expiré. Veuillez vous reconnecter.'}, status=401)
    except jwt.InvalidTokenError:
        return JsonResponse({'error': 'Refresh token invalide'}, status=401)
    except Exception as e:
        logger.error(f"Erreur refresh token: {str(e)}")
        return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)


@csrf_exempt
def get_user_details(request, user_id):
    """
    Endpoint pour récupérer les détails d'une identification par son _id MongoDB.
    Nécessite un token MongoDB valide dans l'en-tête Authorization.
    """
    if not verify_mongo_token(request):
        return JsonResponse({'error': 'Non autorisé. Token invalide ou manquant.'}, status=401)

    try:

        db = get_mongo_db()
        collection = db['identifications']

        doc = collection.find_one({'_id': ObjectId(user_id)})
        if not doc:
            return JsonResponse({'error': 'Identification introuvable.'}, status=404)

        doc['_id'] = str(doc['_id'])
        return JsonResponse({'data': doc}, status=200)

    except Exception as e:
        logger.error(f"User details fetch error: {str(e)}")
        return JsonResponse({'error': f'Erreur lors du chargement des détails : {str(e)}'}, status=500)

@csrf_exempt
def valid_statut(request, user_id):
    """
    Endpoint pour valider un utilisateur
    """

    if not verify_mongo_token(request):
        return JsonResponse({'error': 'Non autorisé. Token invalide ou manquant.'}, status=401)

    try:
        db = get_mongo_db()
        collection = db['identifications']

        doc = collection.find_one({'_id': ObjectId(user_id)})
        if not doc:
            return JsonResponse({'error': 'Identification introuvable.'}, status=404)

        ext_response = set_statut(user_id=doc['user_id'], state=1)

        if ext_response.status_code != 200:
            return JsonResponse({
                'error': 'Erreur API externe',
                'details': ext_response.text
            }, status=500)

        # 🔹 Mise à jour Mongo
        collection.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': {'statut_verification': 'valide'}}
        )

        users = get_users()
        

        return JsonResponse({'data': users}, status=200)

    except Exception as e:
        logger.error(f"User validation error: {str(e)}")
        return JsonResponse(
            {'error': f'Erreur lors de la validation du user : {str(e)}'},
            status=500
        )



