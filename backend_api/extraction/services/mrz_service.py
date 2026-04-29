########################################### traitement MRZ ####################################

from django.http import JsonResponse
import os
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
import logging
from .extraction_service import ExtractZonesTexts
from .detection_service import DetectionService
from datetime import datetime
from passporteye import read_mrz

logger = logging.getLogger(__name__)

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
            image_path = os.path.join(
                settings.MEDIA_ROOT, 'extracted_regions', session_id, 'code.png') if session_id else None

            if image_path and os.path.exists(image_path):
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
                settings.MEDIA_ROOT, 'extracted_regions', session_id, 'code.png') if session_id else None

            if image_path and os.path.exists(image_path):
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
            return {"error": "MRZ vide"}

        mrz_code = mrz_code.strip()

        list_elts = mrz_code.split(" ")

        # Vérification stricte: le code doit commencer par PCIV
        if not list_elts or not list_elts[0].startswith("PCIV"):
            print("*"*50)
            print("UN PASSEPORT IVOIRIEN EST NECESSAIRE !")
            raise ValueError("UN PASSEPORT IVOIRIEN EST NECESSAIRE !")

        if len(list_elts) < 2 or len(list_elts[1]) < 30:
            raise ValueError("Structure MRZ incorrecte: longueur insuffisante")

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
                settings.MEDIA_ROOT, 'extracted_regions', session_id, 'code.png'
            ) if session_id else None

            if image_path and os.path.exists(image_path):
                mrz = read_mrz(image_path)

                if mrz and mrz.country == "CIV":

                    # ---------------------------
                    # Format nom complet
                    # ---------------------------
                    names = (mrz.names or "").replace("<", " ").strip()
                    surname = (mrz.surname or "").replace("<", " ").strip()
                    fullname = f"{surname} {names}".strip()

                    # ---------------------------
                    # Format date (YYMMDD → DD.MM.YY)
                    # ---------------------------
                    def format_date(date_str):
                        if not date_str or len(date_str) != 6 or not date_str.isdigit():
                            return ""

                        year = date_str[0:2]
                        month = date_str[2:4]
                        day = date_str[4:6]

                        return f"{day}.{month}.{year}"

                    date_naiss = format_date(mrz.date_of_birth)
                    date_exp = format_date(mrz.expiration_date)

                    # ---------------------------
                    # Format sexe
                    # ---------------------------
                    sexe = mrz.sex if mrz.sex in ["M", "F"] else "<"

                    # ---------------------------
                    # Numéro passeport clean
                    # ---------------------------
                    passport_number = (mrz.number or "").replace("<", "").strip()

                    return {
                        "type_document": mrz.type,
                        "pays": mrz.country,
                        "passport_number": passport_number,
                        "fullname": fullname,
                        "nationalite": mrz.nationality,
                        "date_naiss_mrz": date_naiss,
                        "sexe_mrz": sexe,
                        "date_exp_mrz": date_exp
                    }

        except Exception as e2:
            print(f"PassportEye error: {e2}")

        return {"error": "MRZ extraction failed"}