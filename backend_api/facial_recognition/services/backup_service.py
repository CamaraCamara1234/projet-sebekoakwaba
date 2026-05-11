"""
backup_service.py
-----------------
Service de sauvegarde automatique :
  1. Dump de la base MongoDB via mongodump
  2. Copie de la base SQLite (db.sqlite3)
  3. Archive compressée du dossier media/
  4. Compression en .tar.gz horodaté
  5. Upload sur Google Drive (Service Account)
"""

import os
import shutil
import tarfile
import subprocess
import datetime
import logging
import tempfile

from django.conf import settings

from google.oauth2 import service_account
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internes
# ─────────────────────────────────────────────────────────────────────────────

def _get_backup_filename():
    """Génère un nom de fichier horodaté pour l'archive."""
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"akwaba_backup_{timestamp}.tar.gz"


def _dump_mongodb(content_dir):
    """
    Lance mongodump vers content_dir/mongo_dump/.
    Retourne le chemin du dossier dump.
    """
    mongo_dump_dir = os.path.join(content_dir, "mongo_dump")
    os.makedirs(mongo_dump_dir, exist_ok=True)

    mongo_uri = getattr(settings, 'MONGO_URI', 'mongodb://localhost:27017/')
    db_name = getattr(settings, 'MONGO_DB_NAME', 'akwabacheckid_db')

    cmd = [
        "mongodump",
        "--uri={}".format(mongo_uri),
        "--db={}".format(db_name),
        "--out={}".format(mongo_dump_dir),
        "--quiet"
    ]

    logger.info("[Backup] Lancement mongodump -> {}".format(mongo_dump_dir))
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )
        if result.returncode != 0:
            raise RuntimeError(
                "mongodump a echoue (code {}): {}".format(result.returncode, result.stderr)
            )
        logger.info("[Backup] mongodump termine avec succes.")
    except FileNotFoundError:
        raise RuntimeError(
            "mongodump introuvable. Assurez-vous que MongoDB Database Tools est installe."
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("mongodump a depasse le delai d'attente (300s).")

    return mongo_dump_dir


# SQLite non utilisé dans ce projet — pas de copie nécessaire


def _archive_media(content_dir):
    """Copie le dossier media/archives/ dans content_dir/archives/."""
    media_root = getattr(settings, 'MEDIA_ROOT', '')
    archives_src = os.path.join(media_root, 'archives')

    if not os.path.isdir(archives_src):
        logger.warning("[Backup] media/archives/ introuvable, ignore.")
        return None

    archives_dst = os.path.join(content_dir, "archives")
    shutil.copytree(archives_src, archives_dst, dirs_exist_ok=True)
    logger.info("[Backup] media/archives/ copie -> {}".format(archives_dst))
    return archives_dst


def _compress_to_tar_gz(source_dir, output_path):
    """
    Compresse le contenu de source_dir dans output_path (.tar.gz).
    Retourne la taille du fichier en octets.
    """
    logger.info("[Backup] Compression -> {}".format(output_path))
    with tarfile.open(output_path, "w:gz", compresslevel=6) as tar:
        tar.add(source_dir, arcname="backup")

    size = os.path.getsize(output_path)
    logger.info("[Backup] Archive creee : {:.2f} MB".format(size / (1024 * 1024)))
    return size


# ─────────────────────────────────────────────────────────────────────────────
# Google Drive Upload
# ─────────────────────────────────────────────────────────────────────────────

def _get_drive_service():
    """Authentifie via Service Account et retourne le service Drive API v3."""
    try:
    except ImportError:
        raise RuntimeError(
            "Bibliotheques Google Drive manquantes. "
            "Installez-les avec : pip install google-api-python-client google-auth"
        )

    credentials_path = getattr(settings, 'GOOGLE_DRIVE_CREDENTIALS_PATH', '')
    if not credentials_path or not os.path.exists(credentials_path):
        raise RuntimeError(
            "Fichier credentials.json introuvable : '{}'. "
            "Verifiez GOOGLE_DRIVE_CREDENTIALS_PATH dans vos settings.".format(credentials_path)
        )

    SCOPES = ['https://www.googleapis.com/auth/drive']
    credentials = service_account.Credentials.from_service_account_file(
        credentials_path,
        scopes=SCOPES
    )
    service = build('drive', 'v3', credentials=credentials)
    logger.info("[Backup] Service Google Drive authentifie (Service Account).")
    return service


def _get_or_create_drive_folder(service, folder_name):
    """Recherche ou crée un dossier sur Google Drive. Retourne l'ID du dossier."""
    query = (
        "name='{}' "
        "and mimeType='application/vnd.google-apps.folder' "
        "and trashed=false"
    ).format(folder_name)

    results = service.files().list(
        q=query,
        spaces='drive',
        fields='files(id, name)'
    ).execute()

    files = results.get('files', [])
    if files:
        folder_id = files[0]['id']
        logger.info("[Backup] Dossier Drive trouve : '{}' (id={})".format(folder_name, folder_id))
        return folder_id

    folder_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    folder = service.files().create(body=folder_metadata, fields='id').execute()
    folder_id = folder.get('id')
    logger.info("[Backup] Dossier Drive cree : '{}' (id={})".format(folder_name, folder_id))
    return folder_id


def _upload_file_to_drive(service, file_path, folder_id):
    """Upload un fichier vers le dossier Google Drive. Retourne les métadonnées."""
    try:
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        raise RuntimeError("googleapiclient.http manquant.")

    file_name = os.path.basename(file_path)
    file_metadata = {
        'name': file_name,
        'parents': [folder_id]
    }

    media = MediaFileUpload(
        file_path,
        mimetype='application/gzip',
        resumable=True,
        chunksize=5 * 1024 * 1024  # chunks de 5 MB
    )

    logger.info("[Backup] Upload Drive : '{}' -> dossier {}".format(file_name, folder_id))
    uploaded_file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, name, webViewLink, size'
    ).execute()

    logger.info("[Backup] Upload termine : {}".format(uploaded_file.get('webViewLink')))
    return uploaded_file


# ─────────────────────────────────────────────────────────────────────────────
# Fonction principale publique
# ─────────────────────────────────────────────────────────────────────────────

def create_backup_and_upload():
    """
    Orchestre la creation du backup complet et son upload sur Google Drive.

    Retourne un dict :
    {
        "backup_filename": "akwaba_backup_20260511_173000.tar.gz",
        "drive_file_id": "...",
        "drive_url": "https://drive.google.com/file/d/.../view",
        "size_bytes": 12345678,
        "size_mb": 11.78,
        "mongo_db": "akwabacheckid_db",
        "timestamp": "2026-05-11T17:30:00Z"
    }
    """
    timestamp = datetime.datetime.utcnow()
    backup_filename = _get_backup_filename()

    # Dossier temporaire racine
    tmp_root = tempfile.mkdtemp(prefix="akwaba_backup_")
    # Sous-dossier pour le contenu (evite la recursion lors de la compression)
    content_dir = os.path.join(tmp_root, "content")
    os.makedirs(content_dir, exist_ok=True)
    # Chemin de l'archive finale
    archive_path = os.path.join(tmp_root, backup_filename)

    try:
        logger.info("[Backup] === Demarrage backup : {} ===".format(backup_filename))

        # 1. Dump MongoDB
        _dump_mongodb(content_dir)

        # 2. Archive media/archives/
        _archive_media(content_dir)

        # 4. Compression tar.gz
        size_bytes = _compress_to_tar_gz(content_dir, archive_path)

        # 5. Upload Google Drive
        service = _get_drive_service()
        folder_name = getattr(settings, 'GOOGLE_DRIVE_BACKUP_FOLDER', 'AkwabaCheckID_Backups')
        folder_id = _get_or_create_drive_folder(service, folder_name)
        uploaded = _upload_file_to_drive(service, archive_path, folder_id)

        result = {
            "backup_filename": backup_filename,
            "drive_file_id": uploaded.get('id', ''),
            "drive_url": uploaded.get('webViewLink', ''),
            "size_bytes": size_bytes,
            "size_mb": round(size_bytes / (1024 * 1024), 2),
            "mongo_db": getattr(settings, 'MONGO_DB_NAME', 'akwabacheckid_db'),
            "timestamp": timestamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        logger.info("[Backup] === Backup termine avec succes : {} ===".format(backup_filename))
        return result

    except Exception as e:
        logger.error("[Backup] ERREUR : {}".format(str(e)))
        raise

    finally:
        # Nettoyage du dossier temporaire dans tous les cas
        if os.path.isdir(tmp_root):
            shutil.rmtree(tmp_root, ignore_errors=True)
            logger.info("[Backup] Dossier temporaire supprime : {}".format(tmp_root))
