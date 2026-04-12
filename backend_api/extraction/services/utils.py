from django.http import JsonResponse
import os
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
import logging
from .extraction_service import ExtractZonesTexts
from .detection_service import DetectionService
from .mrz_service import *
from datetime import datetime
import re
import time
import uuid
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
                        mrz_result = mrz_sejour_processing(result.text, session_id)
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

        # Remplissage des champs obligatoires manquants pour garantir une structure complète
        all_required_labels = set()
        for doc_key in list_files:
            required_fields = ExtractZonesTexts.REQUIRED_FIELDS_BY_DOC.get(doc_key, set())
            for rf in required_fields:
                mapped_rf = map_label(rf, list_files)
                # On ne remplit que les champs textuels (pas photo, signature, etc.)
                if mapped_rf not in {"photo", "signature"}:
                    all_required_labels.add(mapped_rf)

        for req_label in all_required_labels:
            if req_label not in best_results:
                # Valeur par défaut consistante avec process_text
                default_text = "N/A" if req_label in ["date_naissance", "date_expiration", "date_emission", "date_delivrance"] else ""
                best_results[req_label] = {
                    'label': req_label,
                    'text': default_text,
                    'confidence': 0.0
                }

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

        # Vérification stricte du MRZ : si le document exige un MRZ mais qu'il est illisible ou absent
        if 'code' in all_required_labels and len(mrz_data) == 0:
            return JsonResponse({
                "status": "error",
                "message": "Le code MRZ n'est pas bien lisible. Veuillez reprendre la photo en vous assurant qu'elle soit bien nette, sans pixelisation et sans reflets."
            }, status=400)

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