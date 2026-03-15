from django.http import JsonResponse
import os
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
import logging
from .extraction_service import ExtractZonesTexts
from .detection_service import DetectionService
from datetime import datetime
import re
import time
import uuid
import shutil

logger = logging.getLogger(__name__)

################################ les fonctions ########################################


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
                        mrz_result = mrz_cni_processing(result.text)
                    elif doc_type == "sejour":
                        mrz_result = mrz_sejour_processing(result.text)
                    elif doc_type == "passeport":
                        mrz_result = mrz_passeport_processing(result.text)

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

        for f in list_files:
            if 'recto' in f:
                recto_class = f
            elif 'verso' in f:
                verso_class = f

        # Vérifier la présence des fichiers photo et code dans list_regions_name
        photo_exists = 'photo' in list_regions_name
        code_exists = 'code' in list_regions_name

        # Construire les URLs
        response_data = {
            "status": "success",
            "session_id": session_id,
            "photo": f"{base_url}extracted_regions/{session_id}/photo.png" if photo_exists else "N/A",
            "mrz_image": f"{base_url}extracted_regions/{session_id}/code.png" if code_exists else "N/A",
            "cin_recto": f"{base_url}preprocessed_imgs/{session_id}_{recto_class}.jpg" if recto_class else "N/A",
            "cin_verso": f"{base_url}preprocessed_imgs/{session_id}_{verso_class}.jpg" if verso_class else "N/A",
            "extracted_data": list(best_results.values()),
            "mrz_data": mrz_data,
            "temps": round(t2 - t1, 2),
            "document_type": doc_type
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
    if label not in {"code", "adresse", "cin", "photo"}:
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


def data_validation(data, data_mrz):
    """
    Validation des données OCR avec les informations MRZ
    """

    data_verified = {}

    fields_mapping = {
        "nom": "surname",
        "prenom": "names",
        "document_number": "document_number",
        "date_naissance": "date_naissance",
        "date_expiration": "expiration_date",
        "date_emission": "date_emission",
        "sexe": "sexe",
        "ville": "nationalite",
        "nationalite": "nationalite",
        "expiration_date": "expiration_date"
    }

    for field, mrz_field in fields_mapping.items():

        ocr_value = normalize_text(data.get(field, ""))
        mrz_value = normalize_text(data_mrz.get(mrz_field, ""))

        if not mrz_value:
            data_verified[field] = {
                "value": ocr_value,
                "source": "ocr",
                "verified": False
            }
            continue

        if ocr_value == mrz_value:

            data_verified[field] = {
                "value": mrz_value,
                "source": "mrz",
                "verified": True
            }

        else:

            # MRZ est considéré comme plus fiable
            data_verified[field] = {
                "value": mrz_value,
                "ocr_value": ocr_value,
                "mrz_value": mrz_value,
                "source": "mrz",
                "verified": False
            }

    return data_verified


########################################### traitement MRZ ####################################

def mrz_sejour_processing(mrz_code):
    """Traitement MRZ pour carte de séjour"""

    if not mrz_code:
        return {}

    mrz_data = {}

    # ---------------------------
    # Normalisation du format
    # ---------------------------

    if isinstance(mrz_code, list):
        mrz_code = mrz_code[0]

    mrz_code = mrz_code.strip()

    list_elts = mrz_code.split(" ")

    if len(list_elts) < 3:
        return mrz_data

    # ---------------------------
    # CIN
    # ---------------------------

    cin_part = list_elts[0]

    if len(cin_part) > 5:
        mrz_data["cin"] = cin_part[5:]

    # ---------------------------
    # Bloc données personnelles
    # ---------------------------

    block = list_elts[1]

    # Date naissance
    if len(block) >= 6 and block[:6].isdigit():

        year = block[0:2]
        month = block[2:4]
        day = block[4:6]

        if int(year) < 25:
            year_full = f"20{year}"
        else:
            year_full = f"19{year}"

        mrz_data["date_naiss_mrz"] = f"{day}.{month}.{year_full}"

    # Sexe
    if len(block) >= 8:
        mrz_data["sexe_mrz"] = block[7]

    # Date expiration
    if len(block) >= 14 and block[8:14].isdigit():

        exp_year = block[8:10]
        exp_month = block[10:12]
        exp_day = block[12:14]

        if int(exp_year) < 50:
            exp_year_full = f"20{exp_year}"
        else:
            exp_year_full = f"19{exp_year}"

        mrz_data["date_exp_mrz"] = f"{exp_day}.{exp_month}.{exp_year_full}"

    # Pays
    if len(block) >= 18:
        mrz_data["pays"] = block[15:18]

    # ---------------------------
    # Nom complet
    # ---------------------------

    fullname = list_elts[2].replace("<", " ").strip()

    mrz_data["fullname"] = fullname

    print("nn" * 100)
    print(mrz_data)
    print("nn" * 100)

    return mrz_data


def mrz_cni_processing(mrz_code):
    """Traitement MRZ pour CNI ivoirienne"""

    if not mrz_code:
        return {}

    mrz_data = {}

    try:

        # si c'est une liste comme dans ton exemple
        if isinstance(mrz_code, list):
            mrz_code = mrz_code[0]

        mrz_code = mrz_code.replace('\n', '').strip()

        list_elts = mrz_code.split(" ")

        if len(list_elts) < 3:
            return mrz_data

        line1 = list_elts[0]
        line2 = list_elts[1]
        line3 = list_elts[2]

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

        mrz_data["cni_mrz"] = line1[5:]

        # ---------------------------
        # Date naissance
        # ---------------------------

        birth_raw = line2[0:6]

        if birth_raw.isdigit():

            year = birth_raw[0:2]
            month = birth_raw[2:4]
            day = birth_raw[4:6]

            if int(year) < 25:
                year_full = f"20{year}"
            else:
                year_full = f"19{year}"

            mrz_data["date_naiss_mrz"] = f"{day}.{month}.{year_full}"

        # ---------------------------
        # Sexe
        # ---------------------------

        if len(line2) > 7:
            mrz_data["sexe_mrz"] = line2[7]

        # ---------------------------
        # Date expiration
        # ---------------------------

        exp_raw = line2[8:14]

        if exp_raw.isdigit():

            exp_year = exp_raw[0:2]
            exp_month = exp_raw[2:4]
            exp_day = exp_raw[4:6]

            if int(exp_year) < 50:
                exp_year_full = f"20{exp_year}"
            else:
                exp_year_full = f"19{exp_year}"

            mrz_data["date_exp_mrz"] = f"{exp_day}.{exp_month}.{exp_year_full}"

        # ---------------------------
        # Nationalité
        # ---------------------------

        mrz_data["nationalite"] = line2[14:17]

        # ---------------------------
        # NINI
        # ---------------------------

        nini = line2[18:].replace('<', '').strip()

        if nini:
            mrz_data["nini"] = nini

        # ---------------------------
        # Nom complet
        # ---------------------------

        fullname = line3.replace("<", " ").strip()

        mrz_data["fullname"] = fullname

    except Exception as e:
        logger.error(f"Erreur lors du traitement MRZ CNI: {e}")
        return {"error": "Erreur lors du traitement MRZ CNI"}

    return mrz_data


def mrz_passeport_processing(mrz_code):
    """Traitement MRZ pour passeport"""
    if not mrz_code:
        return {}

    mrz_code = mrz_code.replace('\n', '').strip()
    mrz_data = {}

    try:
        lines = mrz_code.split('\n')
        if len(lines) < 2:
            if len(mrz_code) >= 88:
                line1 = mrz_code[:44]
                line2 = mrz_code[44:88]
                lines = [line1, line2]

        if len(lines) >= 2:
            line1 = lines[0].strip()
            line2 = lines[1].strip()

            mrz_data["type_document"] = line1[0] if line1 else ""

            if len(line1) > 4:
                if line1[1] == '<':
                    mrz_data["pays"] = line1[2:5]
                else:
                    mrz_data["pays"] = line1[1:4]

            if len(line1) > 5:
                start_pos = 5 if len(line1) > 1 and line1[1] == '<' else 4
                if start_pos < len(line1):
                    name_part = line1[start_pos:]
                    name_parts = name_part.split('<<')

                    if len(name_parts) >= 1:
                        mrz_data["nom_mrz"] = name_parts[0].replace(
                            '<', '').strip()
                    if len(name_parts) >= 2:
                        mrz_data["prenom_mrz"] = name_parts[1].replace(
                            '<', '').strip()

            if len(line2) >= 9:
                passport_num = line2[0:9].replace('<', '')
                mrz_data["passeport_mrz"] = passport_num

            if len(line2) >= 13:
                mrz_data["pays_passeport"] = line2[10:13]

            if len(line2) >= 19:
                birth_date_raw = line2[13:19]
                if len(birth_date_raw) == 6 and birth_date_raw.isdigit():
                    year = birth_date_raw[0:2]
                    month = birth_date_raw[2:4]
                    day = birth_date_raw[4:6]

                    if int(year) < 25:
                        year_full = f"20{year}"
                    else:
                        year_full = f"19{year}"

                    mrz_data["date_naiss_mrz"] = f"{day}.{month}.{year_full}"

                if len(line2) >= 21:
                    mrz_data["sexe_mrz"] = line2[20]

                if len(line2) >= 27:
                    exp_date_raw = line2[21:27]
                    exp_date_clean = re.sub(r'[A-Z]', '', exp_date_raw)

                    if len(exp_date_clean) >= 6:
                        if len(exp_date_clean) == 6:
                            exp_year = exp_date_clean[0:2]
                            exp_month = exp_date_clean[2:4]
                            exp_day = exp_date_clean[4:6]

                            if int(exp_year) < 50:
                                exp_year_full = f"20{exp_year}"
                            else:
                                exp_year_full = f"19{exp_year}"

                            mrz_data["date_exp_mrz"] = f"{exp_day}.{exp_month}.{exp_year_full}"

            if len(line2) > 30:
                control = line2[30:].replace('<', '').strip()
                if control:
                    mrz_data["numero_controle"] = control

    except Exception as e:
        logger.error(f"Erreur lors du traitement MRZ Passeport: {e}")
        return {"error": "Erreur lors du traitement MRZ Passeport"}

    return mrz_data
