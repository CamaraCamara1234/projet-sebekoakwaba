# Stage 1: Builder
FROM python:3.10-slim as builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Dépendances système pour le build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    cmake \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip et outils de build
RUN pip install --no-cache-dir --upgrade pip setuptools wheel cython

# Installation spécifique des versions CPU pour économiser des Go (PyTorch & Paddle)
# PyTorch CPU index: https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir paddlepaddle==2.6.2 -i https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip install --no-cache-dir paddleocr==2.10.0

# Installer le reste des dépendances
COPY requirements.txt .
# Supprimer torch/paddle de requirements.txt s'ils y sont pour ne pas écraser les versions CPU
RUN sed -i '/torch/d' requirements.txt && \
    sed -i '/paddle/d' requirements.txt && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Final Runtime
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Dépendances système RUNTIME uniquement (plus léger)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-fra \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Récupérer les paquets Python installés depuis le builder
COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copier le code source
COPY . .

# Création des dossiers nécessaires
RUN mkdir -p /app/data /app/media /app/backend_api/media

EXPOSE 8000

CMD ["python", "backend_api/manage.py", "runserver", "0.0.0.0:8000"]