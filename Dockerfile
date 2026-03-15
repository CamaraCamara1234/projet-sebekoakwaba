# ==================================================
# 1️⃣ Image de base
# ==================================================
FROM python:3.10-slim-bullseye

# ==================================================
# 2️⃣ Variables environnement
# ==================================================
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

# ==================================================
# 3️⃣ Dépendances système
# ==================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    cmake \
    tesseract-ocr \
    tesseract-ocr-fra \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    curl \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# ==================================================
# 4️⃣ Dossier de travail
# ==================================================
WORKDIR /app

# ==================================================
# 5️⃣ Copier requirements
# ==================================================
COPY requirements.txt .

# ==================================================
# 6️⃣ Installer dépendances Python
# ==================================================
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ==================================================
# 7️⃣ Télécharger modèles OCR (important)
# ==================================================
RUN python - <<EOF
from paddleocr import PaddleOCR
from easyocr import Reader

print("Downloading PaddleOCR models...")
PaddleOCR(lang="fr", use_gpu=False)

print("Downloading EasyOCR models...")
Reader(['fr'], gpu=False)

print("Models ready")
EOF

# ==================================================
# 8️⃣ Copier le code
# ==================================================
COPY . .

# ==================================================
# 9️⃣ Créer dossiers runtime
# ==================================================
RUN mkdir -p /app/data && chmod -R 777 /app/data
RUN mkdir -p /app/media && chmod -R 777 /app/media

# ==================================================
# 🔟 Port Django
# ==================================================
EXPOSE 8000

# ==================================================
# 11️⃣ Lancer le serveur
# ==================================================
CMD ["python", "backend_api/manage.py", "runserver", "0.0.0.0:8000"]