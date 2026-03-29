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
# from .services.utils import *
from passporteye import read_mrz
import base64


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

def handle_ocr_processing(list_files, session_id):
    """
    Traite les résultats OCR avec isolation par session
    """
    try:
        t1 = time.time()
        resultats = process_ocr_for_files(list_files, session_id)
        list_regions_name = get_regions_files(session_id)

        best_results = {}
        mrz_data = []

        # Déterminer le type de document
        doc_type = None
        files_str = ' '.join(list_files)
        if "ivoire_cni_verso" in files_str or "ivoire_cni_recto" in files_str:
            doc_type = "cni"
        elif "sejour_verso" in files_str or "sejour_recto" in files_str:
            doc_type = "sejour"
        elif "passeport" in files_str:
            doc_type = "passeport"

        logger.info(
            f"Session {session_id} - Type de document détecté: {doc_type}")
        logger.info(
            f"Session {session_id} - Fichiers list_files: {list_files}")
        logger.info(
            f"Session {session_id} - Régions list_regions_name: {list_regions_name}")

        for result in resultats:
            if not result.text:
                continue

            try:
                # Extraire le label sans le préfixe session_id
                result_label = result.label
                if session_id and result_label.startswith(session_id):
                    result_label = result_label.replace(f"{session_id}_", "")

                label = map_label(result_label, list_files)

                # Traitement spécifique pour les dates
                if label in ["date_naissance", "date_expiration", "date_emission", "date_delivrance"]:
                    if doc_type == "passeport":
                        text = result.text.replace("  ", ".").replace(" ", ".")
                    else:
                        text = process_text(result, label, list_files)
                else:
                    text = process_text(result, label, list_files)

                if label not in best_results or result.confidence > best_results[label]['confidence']:
                    best_results[label] = {
                        'label': label,
                        'text': text,
                        'confidence': result.confidence
                    }

                # Traitement MRZ
                if result_label == "code" and len(result.text) >= 10:
                    mrz_result = None
                    if doc_type == "cni":
                        mrz_result = mrz_cni_processing(
                            result.text, session_id)
                    elif doc_type == "sejour":
                        mrz_result = mrz_sejour_processing(result.text)
                    elif doc_type == "passeport":
                        mrz_result = mrz_passeport_processing(
                            result.text, session_id)

                    if mrz_result:
                        mrz_result['document_type'] = doc_type
                        mrz_data.append(mrz_result)

            except Exception as e:
                logger.warning(
                    f"Session {session_id} - Erreur traitement {result.label}: {e}")

        t2 = time.time()

        # Construire les URLs avec l'ID de session
        base_url = settings.MEDIA_URL

        # Chercher les fichiers spécifiques à la session
        recto_class = None
        verso_class = None
        passeport_class = None

        for f in list_files:
            if 'recto' in f:
                recto_class = f
            elif 'verso' in f:
                verso_class = f
            elif 'passeport' in f:
                passeport_class = f

        # Vérifier la présence des fichiers photo et code dans list_regions_name
        photo_exists = 'photo' in list_regions_name
        code_exists = 'code' in list_regions_name

        # Construire les URLs
        response_data = {
            "status": "success",
            "session_id": session_id,
            "photo": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'extracted_regions', session_id, 'photo.png')) if photo_exists else "N/A",
            "mrz_image": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'extracted_regions', session_id, 'code.png')) if code_exists else "N/A",
            "cin_recto": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'preprocessed_imgs', f"{session_id}_{recto_class}.jpg")) if recto_class else "N/A",
            "cin_verso": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'preprocessed_imgs', f"{session_id}_{verso_class}.jpg")) if verso_class else "N/A",
            "passeport": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'preprocessed_imgs', f"{session_id}_{passeport_class}.jpg")) if passeport_class else "N/A",
            "extracted_data": list(best_results.values()),
            "mrz_data": mrz_data,
            "temps": round(t2 - t1, 2),
            "document_type": doc_type,
            "images_base64": {
                "photo": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'extracted_regions', session_id, 'photo.png')) if photo_exists else "N/A",
                "mrz": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'extracted_regions', session_id, 'code.png')) if code_exists else "N/A",
                "cin_recto": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'preprocessed_imgs', f"{session_id}_{recto_class}.jpg")) if recto_class else "N/A",
                "cin_verso": image_to_base64(os.path.join(settings.MEDIA_ROOT, 'preprocessed_imgs', f"{session_id}_{verso_class}.jpg")) if verso_class else "N/A"
            }
        }

        logger.info(
            f"Session {session_id} - Traitement terminé en {response_data['temps']}s")
        logger.info(
            f"Session {session_id} - {len(best_results)} champs extraits, {len(mrz_data)} MRZ")

        return JsonResponse(response_data, content_type='application/json')

    except Exception as e:
        logger.error(f"Session {session_id} - OCR failed: {e}", exc_info=True)
        return JsonResponse({
            "status": "error",
            "message": f"OCR échoué: {e}"
        }, status=500)


def get_session_regions_url(session_id: str, label: str) -> str:
    """
    Construit l'URL d'une région extraite pour une session
    """
    return f"{settings.MEDIA_URL}extracted_regions/{session_id}/{label}.png"


def get_session_preprocessed_url(session_id: str, class_name: str) -> str:
    """
    Construit l'URL d'une image prétraitée pour une session
    """
    return f"{settings.MEDIA_URL}preprocessed_imgs/{session_id}_{class_name}.jpg"


def map_label(label, list_files):
    # Gestion des labels inversés ou remplacés
    files_str = ' '.join(list_files)
    if label == "nom" and ("sejour_recto" in files_str or "sejour_verso" in files_str):
        return "prenom"
    elif label == "prenom" and ("sejour_recto" in files_str or "sejour_verso" in files_str):
        return "nom"
    elif label == "ville" and ("sejour_recto" in files_str or "sejour_verso" in files_str):
        return "nationalite"
    return label


def process_text(result, label, list_files):
    """Nettoie et formate le texte selon son label."""
    text = (result.text or "").strip()

    if not text:
        return "N/A" if label in ["date_naissance", "date_expiration", "date_emission", "date_delivrance"] else ""

    # Traitements spécifiques par type de label
    processors = {
        "date_naissance": lambda t: clean_and_format_date(t) if len(t) >= 6 else "N/A",
        "date_expiration": lambda t: clean_and_format_date(t) if len(t) >= 6 else "N/A",
        "date_emission": lambda t: clean_and_format_date(t) if len(t) >= 6 else "N/A",
        "date_delivrance": lambda t: clean_and_format_date(t) if len(t) >= 6 else "N/A",
        "ville": lambda t: nettoyage_texte(t.replace("Nationalité ", "")),
        "nationalite": lambda t: nettoyage_texte(t.replace("Nationalité ", "")),
        "adresse": nettoyage_texte
    }

    if label in processors:
        return processors[label](text)

    # Traitement par défaut pour les autres labels
    if label not in {"code", "adresse", "cin", "photo", "numero", "nini", "taille"}:
        cleaned_text = text.replace("1", "I").replace("<", "").replace(">", "")
        return advanced_clean(cleaned_text)

    return text


def nettoyage_texte(text):
    if not text:
        return ""
    words = text.strip().split()

    if words:
        first_word = words[0]
        if (not first_word.isupper() or not first_word.isalnum()) and len(words) > 1:
            words = words[1:]

    return " ".join(words)


def clean_and_format_date(date_text):
    """
    Nettoie et formate une date pour obtenir le format jj.mm.aaaa
    """
    try:
        if not date_text:
            return None

        # Normaliser les séparateurs
        date_clean = re.sub(r'[, \-/]', '.', date_text)
        date_clean = date_clean.replace('1 ', '')

        # Supprimer tous les caractères non numériques sauf les points
        cleaned = re.sub(r'[^\d.]', '', date_clean)

        # Extraire les segments de date
        parts = [p for p in cleaned.split('.') if p]

        # Cas classique avec des points
        if len(parts) == 3:
            day, month, year = parts

            # Compléter les segments
            day = day.zfill(2)[:2]
            month = month.zfill(2)[:2]

            # Gestion année à 2 chiffres
            if len(year) == 2:
                if int(year) < 25:
                    year = f"20{year}"
                else:
                    year = f"19{year}"
            else:
                year = year[-4:].zfill(4)

            # Valider la date
            datetime.strptime(f"{day}.{month}.{year}", "%d.%m.%Y")
            return f"{day}.{month}.{year}"

        # Cas sans séparateurs
        elif len(cleaned) >= 6 and '.' not in cleaned:
            cleaned = cleaned.zfill(8)[:8]

            if len(cleaned) == 6:
                day = cleaned[:2]
                month = cleaned[2:4]
                year_short = cleaned[4:6]

                if int(year_short) < 25:
                    year = f"20{year_short}"
                else:
                    year = f"19{year_short}"

                return f"{day}.{month}.{year}"
            else:
                return f"{cleaned[:2]}.{cleaned[2:4]}.{cleaned[4:8]}"

    except (ValueError, AttributeError) as e:
        logger.debug(f"Erreur formatage date: {e}")
        pass

    return None


def clean_text(text):
    """Nettoie le texte"""
    if not text:
        return ""
    text = re.sub(r'[\u200e\u200f]', '', text)
    text = re.sub(r'[\x00-\x1F\x7F-\x9F]', '', text)
    text = ' '.join(text.split())
    return text.strip()


def advanced_clean(text):
    if not text:
        return ""
    text = clean_text(text)
    text = re.sub(r'(?<!\w)[^a-zA-Zéèêëàâäôöûüç\s-]+\s?', '', text)
    text = text.replace('"', "'").replace('“', "'").replace('”', "'")
    return text.strip()


def get_preprocessed_files(session_id=None):
    """Liste les fichiers prétraités, filtrés par session si spécifié"""
    preprocessed_dir = os.path.join(
        settings.BASE_DIR, 'media', 'preprocessed_imgs')
    os.makedirs(preprocessed_dir, exist_ok=True)

    files = []
    try:
        for f in os.listdir(preprocessed_dir):
            if f.lower().endswith('.jpg'):
                if session_id:
                    # Ne garder que les fichiers de cette session
                    if f.startswith(session_id):
                        # Retirer le préfixe session_id_ pour obtenir le nom de classe
                        class_name = f.replace(
                            f"{session_id}_", "").replace(".jpg", "")
                        files.append(class_name)
                else:
                    files.append(os.path.splitext(f)[0])
    except Exception as e:
        logger.error(f"Erreur lecture dossier preprocessed: {e}")

    return files


def get_regions_files(session_id=None):
    """Liste les fichiers des régions, filtrés par session si spécifié"""
    regions_dir = os.path.join(
        settings.BASE_DIR, 'media', 'extracted_regions', session_id)
    os.makedirs(regions_dir, exist_ok=True)

    files = []
    try:
        for f in os.listdir(regions_dir):
            if f.lower().endswith('.png'):
                if session_id:
                    # Ne garder que les fichiers de cette session
                    class_name = f.replace(".png", "")
                    files.append(class_name)
                else:
                    files.append(os.path.splitext(f)[0])
    except Exception as e:
        logger.error(f"Erreur lecture dossier regions: {e}")

    return files


def process_ocr_for_files(file_list, session_id=None):
    """
    Traite les fichiers avec OCR, en tenant compte de la session
    """
    all_results = []

    for face in file_list:
        try:
            # face est le nom de classe (sans préfixe session_id)
            # Exemple: "ivoire_cni_recto" ou "passeport"

            logger.info(
                f"Session {session_id} - Traitement de la classe: {face}")

            # Construire le chemin du modèle avec le nom de classe
            model_path = os.path.join(
                settings.BASE_DIR, f"extraction/extraction_models/{face}/best.onnx")
            logger.info(
                f"Session {session_id} - Modèle utilisé : {model_path}")

            if not os.path.exists(model_path):
                logger.warning(
                    f"Session {session_id} - Aucun modèle trouvé pour : {face}")
                continue

            # Initialiser l'extracteur
            extractor = ExtractZonesTexts(
                yolo_model_path=model_path,
                session_id=session_id
            )

            # Construire le chemin de l'image avec le préfixe session_id si présent
            if session_id:
                image_filename = f"{session_id}_{face}.jpg"
            else:
                image_filename = f"{face}.jpg"

            image_path = os.path.join(
                settings.BASE_DIR,
                f"media/preprocessed_imgs/{image_filename}"
            )
            logger.info(
                f"Session {session_id} - Traitement de l'image : {image_path}")

            if not os.path.exists(image_path):
                logger.warning(
                    f"Session {session_id} - Fichier introuvable : {image_path}")
                continue

            results = extractor.process_image(image_path)
            if results:
                all_results.extend(results)

        except Exception as e:
            logger.error(
                f"Session {session_id} - Erreur OCR pour {face}: {str(e)}")
            continue

    return all_results


###################################### Validation des informations ###########################
def normalize_text(text):
    if not text:
        return ""
    text = text.upper().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def data_validation_function(data, data_mrz):
    """
    Validation des données OCR avec les informations MRZ
    Les champs supplémentaires non présents dans MRZ sont ajoutés et marqués comme verified=True
    """

    data_verified = {}

    # Champs standards MRZ -> OCR
    fields_mapping = {
        "cni_mrz": "cin",
        "cin": "cin",
        "passport_number": "numero",
        "date_naiss_mrz": "date_naissance",
        "date_exp_mrz": "date_expiration",
        "sexe_mrz": "sexe",
        "pays": "pays",
        "nini": "nini"
    }

    # -------------------------
    # Gestion spéciale fullname
    # -------------------------

    fullname_mrz = normalize_text(
        data_mrz.get("fullname", "")).replace(" ", "")

    nom_ocr = normalize_text(data.get("nom", "")).replace(" ", "")
    prenom_ocr = normalize_text(data.get("prenom", "")).replace(" ", "")

    if not fullname_mrz:
        data_verified["nom"] = {
            "value": nom_ocr,
            "source": "ocr",
            "verified": False,
            "message": "fullname MRZ manquant"
        }

        data_verified["prenom"] = {
            "value": prenom_ocr,
            "source": "ocr",
            "verified": False,
            "message": "fullname MRZ manquant"
        }

    else:
        # Vérification du nom
        if nom_ocr and nom_ocr in fullname_mrz:

            remaining = fullname_mrz.replace(nom_ocr, "")

            data_verified["nom"] = {
                "value": nom_ocr,
                "source": "ocr",
                "mrz_value": fullname_mrz,
                "verified": True
            }

            # Vérification du prénom dans le reste
            if prenom_ocr and prenom_ocr in remaining:

                data_verified["prenom"] = {
                    "value": prenom_ocr,
                    "source": "ocr",
                    "mrz_value": remaining,
                    "verified": True
                }

            else:
                data_verified["prenom"] = {
                    "value": prenom_ocr,
                    "ocr_value": prenom_ocr,
                    "mrz_value": remaining,
                    "source": "ocr",
                    "verified": False,
                    "message": "Le prénom ne correspond pas au fullname MRZ après suppression du nom"
                }

        else:
            data_verified["nom"] = {
                "value": nom_ocr,
                "ocr_value": nom_ocr,
                "mrz_value": fullname_mrz,
                "source": "ocr",
                "verified": False,
                "message": "Le nom OCR ne correspond pas au fullname MRZ"
            }

            data_verified["prenom"] = {
                "value": prenom_ocr,
                "ocr_value": prenom_ocr,
                "mrz_value": fullname_mrz,
                "source": "ocr",
                "verified": False,
                "message": "Impossible de vérifier le prénom car le nom est incorrect"
            }

    # -------------------------
    # Validation des autres champs MRZ
    # -------------------------

    date_fields = ["date_naissance", "date_expiration"]

    for mrz_field, field in fields_mapping.items():

        ocr_value = normalize_text(data.get(field, ""))
        mrz_value = normalize_text(data_mrz.get(mrz_field, ""))

        if not mrz_value:
            continue

        if ocr_value:

            # Cas particulier des dates
            if field in date_fields:

                if ocr_value in mrz_value and len(ocr_value) == len(mrz_value):

                    data_verified[field] = {
                        "value": mrz_value,
                        "source": "mrz",
                        "verified": True
                    }

                else:

                    data_verified[field] = {
                        "value": mrz_value,
                        "ocr_value": ocr_value,
                        "mrz_value": mrz_value,
                        "source": "mrz",
                        "verified": False,
                        "message": f"Les {field} ne correspondent pas"
                    }

            # Autres champs
            else:

                if ocr_value in mrz_value:

                    data_verified[field] = {
                        "value": mrz_value,
                        "source": "mrz",
                        "verified": True
                    }

                else:

                    data_verified[field] = {
                        "value": mrz_value,
                        "ocr_value": ocr_value,
                        "mrz_value": mrz_value,
                        "source": "mrz",
                        "verified": False,
                        "message": f"Les {field} ne correspondent pas"
                    }

    # -------------------------
    # Ajout des champs supplémentaires qui ne sont pas dans MRZ
    # -------------------------
    for key, value in data.items():
        if key not in data_verified:
            data_verified[key] = {
                "value": value,
                "source": "ocr",
                "verified": True
            }

    return data_verified
########################################### traitement MRZ ####################################


def mrz_sejour_processing(mrz_code, session_id=None):
    """Traitement MRZ pour carte de séjour avec validation + fallback PassportEye"""

    mrz_data = {}

    try:

        # ---------------------------
        # Normalisation
        # ---------------------------

        if isinstance(mrz_code, list):
            mrz_code = mrz_code[0]

        if not mrz_code:
            raise ValueError("MRZ vide")

        mrz_code = mrz_code.strip()

        list_elts = mrz_code.split(" ")

        if len(list_elts) < 3:
            raise ValueError("Structure MRZ incorrecte")

        line1 = list_elts[0]
        block = list_elts[1]
        line3 = list_elts[2]

        if len(line1) < 10 or len(block) < 18:
            raise ValueError("MRZ trop courte")

        # ---------------------------
        # CIN
        # ---------------------------

        cin_part = line1

        if len(cin_part) < 8:
            raise ValueError("CIN invalide")

        mrz_data["cin"] = cin_part[-8:]

        # ---------------------------
        # Date naissance
        # ---------------------------

        birth_raw = block[0:6]

        if not birth_raw.isdigit():
            raise ValueError("Date naissance invalide")

        year = birth_raw[0:2]
        month = birth_raw[2:4]
        day = birth_raw[4:6]

        year_full = f"20{year}" if int(year) < 25 else f"19{year}"

        mrz_data["date_naiss_mrz"] = f"{day}.{month}.{year_full}"

        # ---------------------------
        # Sexe
        # ---------------------------

        sexe = block[7]

        if sexe not in ["M", "F", "<"]:
            raise ValueError("Sexe invalide")

        mrz_data["sexe_mrz"] = sexe

        # ---------------------------
        # Date expiration
        # ---------------------------

        exp_raw = block[8:14]

        if not exp_raw.isdigit():
            raise ValueError("Date expiration invalide")

        exp_year = exp_raw[0:2]
        exp_month = exp_raw[2:4]
        exp_day = exp_raw[4:6]

        exp_year_full = f"20{exp_year}" if int(
            exp_year) < 50 else f"19{exp_year}"

        mrz_data["date_exp_mrz"] = f"{exp_day}.{exp_month}.{exp_year_full}"

        # ---------------------------
        # Pays
        # ---------------------------

        mrz_data["pays"] = block[15:18]

        # ---------------------------
        # Nom complet
        # ---------------------------

        fullname = line3.replace("<", " ").strip()

        if not fullname:
            raise ValueError("Nom invalide")

        mrz_data["fullname"] = fullname

        return mrz_data

    except Exception as e:

        logger.warning(f"MRZ séjour parsing échoué: {e}")

        # ---------------------------
        # Fallback PassportEye
        # ---------------------------

        try:

            if image_path:

                image_path = os.path.join(
                    settings.MEDIA_ROOT, 'extracted_regions', session_id, 'code.png')

                mrz = read_mrz(image_path)

                if mrz:

                    return {
                        "type_document": mrz.type,
                        "pays": mrz.country,
                        "cin": mrz.number,
                        "fullname": f"{mrz.names} {mrz.surname}",
                        "nationalite": mrz.nationality,
                        "date_naiss_mrz": mrz.date_of_birth,
                        "sexe_mrz": mrz.sex,
                        "date_exp_mrz": mrz.expiration_date
                    }

        except Exception as e2:
            logger.error(f"PassportEye error: {e2}")

        return {"error": "MRZ extraction failed"}


def mrz_cni_processing(mrz_code, session_id=None):
    """Traitement MRZ pour CNI ivoirienne avec validation + fallback PassportEye"""

    mrz_data = {}

    try:

        # ---------------------------
        # Normalisation
        # ---------------------------

        if isinstance(mrz_code, list):
            mrz_code = mrz_code[0]

        if not mrz_code:
            raise ValueError("MRZ vide")

        mrz_code = mrz_code.replace('\n', '').strip()

        list_elts = mrz_code.split(" ")

        if len(list_elts) < 3:
            raise ValueError("Structure MRZ incorrecte")

        line1 = list_elts[0]
        line2 = list_elts[1]
        line3 = list_elts[2]

        if len(line1) < 10 or len(line2) < 20:
            raise ValueError("MRZ trop courte")

        # ---------------------------
        # Type document
        # ---------------------------

        mrz_data["type_document"] = line1[0:2]

        # ---------------------------
        # Pays
        # ---------------------------

        mrz_data["pays"] = line1[2:5]

        # ---------------------------
        # Numéro CNI
        # ---------------------------

        cni_number = line1[5:]

        if len(cni_number) < 5:
            raise ValueError("Numéro CNI invalide")

        mrz_data["cni_mrz"] = f"{cni_number[0:2].replace('1', 'I')}{cni_number[2:11].replace('I', '1')}"

        # ---------------------------
        # Date naissance
        # ---------------------------

        birth_raw = line2[0:6]

        if not birth_raw.isdigit():
            raise ValueError("Date naissance invalide")

        year = birth_raw[0:2]
        month = birth_raw[2:4]
        day = birth_raw[4:6]

        year_full = f"20{year}" if int(year) < 25 else f"19{year}"

        mrz_data["date_naiss_mrz"] = f"{day}.{month}.{year_full}"

        # ---------------------------
        # Sexe
        # ---------------------------

        sexe = line2[7]

        if sexe not in ["M", "F", "<"]:
            raise ValueError("Sexe invalide")

        mrz_data["sexe_mrz"] = sexe

        # ---------------------------
        # Date expiration
        # ---------------------------

        exp_raw = line2[8:14]

        if not exp_raw.isdigit():
            raise ValueError("Date expiration invalide")

        exp_year = exp_raw[0:2]
        exp_month = exp_raw[2:4]
        exp_day = exp_raw[4:6]

        exp_year_full = f"20{exp_year}" if int(
            exp_year) < 50 else f"19{exp_year}"

        mrz_data["date_exp_mrz"] = f"{exp_day}.{exp_month}.{exp_year_full}"

        # ---------------------------
        # Nationalité
        # ---------------------------

        mrz_data["nationalite"] = line2[14:17]

        # ---------------------------
        # NINI
        # ---------------------------

        nini = line2[18:].replace('<', '').strip()

        if nini and not nini.isdigit():
            raise ValueError("NINI invalide")

        mrz_data["nini"] = nini.replace('I', '1')

        # ---------------------------
        # Nom complet
        # ---------------------------

        fullname = line3.replace("<", " ").strip()

        if not fullname:
            raise ValueError("Nom invalide")

        mrz_data["fullname"] = fullname

        return mrz_data

    except Exception as e:

        logger.warning(f"MRZ CNI parsing échoué: {e}")

        # ---------------------------
        # Fallback PassportEye
        # ---------------------------

        try:
            image_path = os.path.join(
                settings.MEDIA_ROOT, 'extracted_regions', session_id, 'code.png')

            if image_path:

                mrz = read_mrz(image_path)

                if mrz:

                    return {
                        "type_document": mrz.type,
                        "pays": mrz.country,
                        "cni_mrz": mrz.number,
                        "fullname": f"{mrz.names} {mrz.surname}",
                        "nationalite": mrz.nationality,
                        "date_naiss_mrz": mrz.date_of_birth,
                        "sexe_mrz": mrz.sex,
                        "date_exp_mrz": mrz.expiration_date
                    }

        except Exception as e2:
            logger.error(f"PassportEye error: {e2}")

        return {"error": "MRZ extraction failed"}


def mrz_passeport_processing(mrz_code, session_id=None):
    """Traitement MRZ pour passeport avec fallback PassportEye"""

    mrz_data = {}

    try:

        # ---------------------------
        # Normalisation
        # ---------------------------

        if isinstance(mrz_code, list):
            mrz_code = mrz_code[0]

        if not mrz_code:
            raise ValueError("MRZ vide")

        mrz_code = mrz_code.strip()

        list_elts = mrz_code.split(" ")

        if len(list_elts) < 2:
            raise ValueError("Structure MRZ incorrecte")

        line1 = list_elts[0]
        line2 = list_elts[1]

        # Vérification longueur minimale
        if len(line1) < 5 or len(line2) < 27:
            raise ValueError("MRZ trop courte")

        # ---------------------------
        # Type document
        # ---------------------------

        mrz_data["type_document"] = line1[0]

        # ---------------------------
        # Pays
        # ---------------------------

        mrz_data["pays"] = line1[1:4]

        # ---------------------------
        # Nom complet
        # ---------------------------

        fullname = line1[4:].replace("<", " ").strip()

        if not fullname:
            raise ValueError("Nom invalide")

        mrz_data["fullname"] = fullname

        # ---------------------------
        # Numéro passeport
        # ---------------------------

        passport_number = line2[0:9].replace("<", "")

        if len(passport_number) < 6:
            raise ValueError("Numéro passeport invalide")

        mrz_data["passport_number"] = passport_number

        # ---------------------------
        # Nationalité
        # ---------------------------

        mrz_data["nationalite"] = line2[10:13]

        # ---------------------------
        # Date naissance
        # ---------------------------

        birth_raw = line2[13:19]

        if not birth_raw.isdigit():
            raise ValueError("Date naissance invalide")

        year = birth_raw[0:2]
        month = birth_raw[2:4]
        day = birth_raw[4:6]

        year_full = f"20{year}" if int(year) < 25 else f"19{year}"

        mrz_data["date_naiss_mrz"] = f"{day}.{month}.{year}"

        # ---------------------------
        # Sexe
        # ---------------------------

        sexe = line2[20]

        if sexe not in ["M", "F", "<"]:
            raise ValueError("Sexe invalide")

        mrz_data["sexe_mrz"] = sexe

        # ---------------------------
        # Date expiration
        # ---------------------------

        exp_raw = line2[21:27]

        if not exp_raw.isdigit():
            raise ValueError("Date expiration invalide")

        exp_year = exp_raw[0:2]
        exp_month = exp_raw[2:4]
        exp_day = exp_raw[4:6]

        exp_year_full = f"20{exp_year}" if int(
            exp_year) < 50 else f"19{exp_year}"

        mrz_data["date_exp_mrz"] = f"{exp_day}.{exp_month}.{exp_year}"

        return mrz_data

    except Exception as e:

        print(f"MRZ parsing échoué: {e}")

        # ---------------------------
        # Fallback PassportEye
        # ---------------------------

        try:
            image_path = os.path.join(
                settings.MEDIA_ROOT, 'extracted_regions', session_id, 'code.png')
            if image_path:

                mrz = read_mrz(image_path)

                if mrz:

                    return {
                        "type_document": mrz.type,
                        "pays": mrz.country,
                        "passport_number": mrz.number,
                        "fullname": f"{mrz.names} {mrz.surname}",
                        "nationalite": mrz.nationality,
                        "date_naiss_mrz": mrz.date_of_birth,
                        "sexe_mrz": mrz.sex,
                        "date_exp_mrz": mrz.expiration_date
                    }

        except Exception as e2:
            print(f"PassportEye error: {e2}")

        return {"error": "MRZ extraction failed"}
