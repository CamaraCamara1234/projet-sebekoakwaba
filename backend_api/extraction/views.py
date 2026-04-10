from django.http import JsonResponse
import os
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
import logging
from .services.extraction_service import ExtractZonesTexts
from .services.detection_service import DetectionService
from datetime import datetime
import re
import time
import uuid
import shutil
import json
from .services.utils import *
from .services.mrz_service import *

def image_to_base64(image_path):
    """Convertit une image en chaîne base64 avec préfixe MIME"""
    try:
        if not image_path or not os.path.exists(image_path):
            return "N/A"
        
        ext = os.path.splitext(image_path)[1].lower().replace('.', '')
        if ext == 'jpg': ext = 'jpeg'
        
        with open(image_path, "rb") as img_file:
            b64_string = base64.b64encode(img_file.read()).decode('utf-8')
            return f"data:image/{ext};base64,{b64_string}"
    except Exception as e:
        logger.error(f"Erreur conversion base64: {e}")
        return "N/A"

logger = logging.getLogger(__name__)


def generate_session_id():
    """Génère un identifiant de session unique"""
    return str(uuid.uuid4())


@csrf_exempt
def extract_regions_view(request):
    if request.method != 'POST':
        return JsonResponse({
            "status": "error",
            "message": "Méthode non autorisée"
        }, status=405)

    image_file = request.FILES.get('image')
    if not image_file:
        return JsonResponse({
            "status": "error",
            "message": "Aucune image fournie"
        }, status=400)

    # Générer un ID de session unique
    session_id = generate_session_id()

    # Créer un dossier temporaire unique pour cette session
    session_temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp', session_id)
    os.makedirs(session_temp_dir, exist_ok=True)

    # Utiliser un nom de fichier avec l'ID de session
    original_filename = image_file.name
    base_name, ext = os.path.splitext(original_filename)
    unique_filename = f"{session_id}_{base_name}{ext}"
    temp_path = os.path.join(session_temp_dir, unique_filename)

    try:
        # Sauvegarde temporaire du fichier
        with open(temp_path, 'wb+') as f:
            for chunk in image_file.chunks():
                f.write(chunk)

        # Extraction des régions avec l'ID de session
        regions = DetectionService.extract_and_save_regions(
            temp_path,
            session_id=session_id
        )
        logger.info(
            f"Session {session_id} - Résultats de l'extraction : {regions}")

        if not regions:
            return JsonResponse({
                "status": "error",
                "message": "Aucune région détectée"
            }, status=400)

        first_region = regions[0]
        if first_region.get('status') == 'rejected':
            return JsonResponse({
                "status": "rejected",
                "message": first_region.get('message', 'Erreur de validation'),
                "details": first_region
            }, status=400)

        # Récupérer les fichiers de cette session uniquement
        list_files = get_preprocessed_files(session_id)
        logger.info(f"Session {session_id} - Fichiers trouvés: {list_files}")

        if len(list_files) == 2:
            return handle_ocr_processing(list_files, session_id)

        return JsonResponse({
            "status": "success",
            "session_id": session_id,
            "regions": regions,
            "count": len(regions)
        })

    except Exception as e:
        logger.error(
            f"Session {session_id} - Erreur lors du traitement : {str(e)}")
        return JsonResponse({
            "status": "error",
            "message": f"Erreur de traitement : {str(e)}"
        }, status=500)

    finally:
        # Nettoyage du dossier temporaire de session
        if os.path.exists(session_temp_dir):
            shutil.rmtree(session_temp_dir)


@csrf_exempt
def extract_regions_dual_view(request):
    if request.method != 'POST':
        return JsonResponse({
            "status": "error",
            "message": "Méthode non autorisée"
        }, status=405)

    image1 = request.FILES.get('image1')
    image2 = request.FILES.get('image2')

    if not image1 or not image2:
        return JsonResponse({
            "status": "error",
            "message": "Deux images sont requises"
        }, status=400)

    # Générer un ID de session unique
    session_id = generate_session_id()

    # Créer un dossier temporaire unique pour cette session
    session_temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp', session_id)
    os.makedirs(session_temp_dir, exist_ok=True)

    # Noms de fichiers uniques
    base1, ext1 = os.path.splitext(image1.name)
    base2, ext2 = os.path.splitext(image2.name)

    temp_path_1 = os.path.join(session_temp_dir, f"{session_id}_{base1}{ext1}")
    temp_path_2 = os.path.join(session_temp_dir, f"{session_id}_{base2}{ext2}")

    try:
        # Sauvegarde temporaire des fichiers
        for image_file, temp_path in [(image1, temp_path_1), (image2, temp_path_2)]:
            with open(temp_path, 'wb+') as f:
                for chunk in image_file.chunks():
                    f.write(chunk)

        # Extraction des régions pour les deux images avec session_id
        regions1 = DetectionService.extract_and_save_regions(
            temp_path_1, skip_validation=2, session_id=session_id)
        regions2 = DetectionService.extract_and_save_regions(
            temp_path_2, skip_validation=2, session_id=session_id)

        if not regions1 or not regions2:
            return JsonResponse({
                "status": "error",
                "message": "Une ou les deux images n'ont pas permis de détecter des régions"
            }, status=400)

        # Vérification des statuts
        for regions in [regions1, regions2]:
            first = regions[0]
            if first.get('status') == 'rejected':
                return JsonResponse({
                    "status": "rejected",
                    "message": first.get('message', 'Erreur de validation'),
                    "details": first
                }, status=400)

        # Récupérer les fichiers de cette session uniquement
        list_files = get_preprocessed_files(session_id)
        logger.info(f"Session {session_id} - Fichiers trouvés: {list_files}")

        if len(list_files) >= 2:
            return handle_ocr_processing(list_files, session_id)

        return JsonResponse({
            "status": "success",
            "session_id": session_id,
            "regions_image1": regions1,
            "regions_image2": regions2
        })

    except Exception as e:
        logger.error(
            f"Session {session_id} - Erreur lors du traitement double image : {str(e)}")
        return JsonResponse({
            "status": "error",
            "message": f"Erreur de traitement : {str(e)}"
        }, status=500)

    finally:
        # Nettoyage du dossier temporaire de session
        if os.path.exists(session_temp_dir):
            shutil.rmtree(session_temp_dir)


@csrf_exempt
def extract_regions_front_view(request):
    if request.method != 'POST':
        return JsonResponse({
            "status": "error",
            "message": "Méthode non autorisée"
        }, status=405)

    image1 = request.FILES.get('image1')

    if not image1:
        return JsonResponse({
            "status": "error",
            "message": "Une image est requise"
        }, status=400)

    # Générer un ID de session unique
    session_id = generate_session_id()

    # Créer un dossier temporaire unique pour cette session
    session_temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp', session_id)
    os.makedirs(session_temp_dir, exist_ok=True)

    base1, ext1 = os.path.splitext(image1.name)
    temp_path_1 = os.path.join(session_temp_dir, f"{session_id}_{base1}{ext1}")

    try:
        # Sauvegarde temporaire des fichiers
        with open(temp_path_1, 'wb+') as f:
            for chunk in image1.chunks():
                f.write(chunk)

        # Extraction des régions avec session_id
        regions1 = DetectionService.extract_and_save_regions(
            temp_path_1, skip_validation=2, session_id=session_id)

        if not regions1:
            return JsonResponse({
                "status": "error",
                "message": "L'image n'a pas permis de détecter des régions"
            }, status=400)

        # Vérification des statuts
        first = regions1[0]
        if first.get('status') == 'rejected':
            return JsonResponse({
                "status": "rejected",
                "message": first.get('message', 'Erreur de validation'),
                "details": first
            }, status=400)

        # Récupérer les fichiers de cette session uniquement
        list_files = get_preprocessed_files(session_id)
        logger.info(f"Session {session_id} - Fichiers trouvés: {list_files}")

        if len(list_files) == 1:
            return handle_ocr_processing(list_files, session_id)

        return JsonResponse({
            "status": "success",
            "session_id": session_id,
            "regions_image1": regions1
        })

    except Exception as e:
        logger.error(
            f"Session {session_id} - Erreur lors du traitement : {str(e)}")
        return JsonResponse({
            "status": "error",
            "message": f"Erreur de traitement : {str(e)}"
        }, status=500)

    finally:
        # Nettoyage du dossier temporaire
        if os.path.exists(session_temp_dir):
            shutil.rmtree(session_temp_dir)


################################## Validation des informations ################################
@csrf_exempt
def data_validation(request):
    if request.method != 'POST':
        return JsonResponse({'message': 'Méthode non autorisée'}, status=405)

    # Récupérer les champs depuis form-data
    data_str = request.POST.get('data', '{}')
    data_mrz_str = request.POST.get('data_mrz', '{}')

    try:
        data = json.loads(data_str)
        data_mrz = json.loads(data_mrz_str)
    except json.JSONDecodeError:
        return JsonResponse({'message': 'Données JSON invalides'}, status=400)

    if not data or not data_mrz:
        return JsonResponse({'message': 'Données manquantes'}, status=400)

    # Ici tu appelles ta fonction de validation
    data_verified = data_validation_function(data, data_mrz)

    return JsonResponse({'data_verified': data_verified})


################################################################################################

################################      les fonctions     ########################################

################################################################################################
