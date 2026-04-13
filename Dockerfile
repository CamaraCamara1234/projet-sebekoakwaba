# ==========================================
# Stage 1: Builder
# ==========================================
FROM python:3.10-slim as builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    cmake \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Création de l'environnement virtuel (Meilleure pratique Docker ML)
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir --upgrade pip setuptools wheel cython

# Installation des frameworks IA lourds (Mis en cache Docker si requirements change)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir paddlepaddle==2.6.2 -i https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip install --no-cache-dir paddleocr==2.10.0

# Copie et installation du reste des dépendances
COPY requirements.txt .
RUN sed -i '/torch/d' requirements.txt && \
    sed -i '/paddle/d' requirements.txt && \
    pip install --no-cache-dir -r requirements.txt gunicorn

# ==========================================
# Stage 2: Runtime
# ==========================================
FROM python:3.10-slim

# Optimisation des performances CPU pour l'IA
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PATH="/opt/venv/bin:$PATH" \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    VECLIB_MAXIMUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1

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

# On copie purement et simplement le venv compilé
COPY --from=builder /opt/venv /opt/venv

# Copie du code source
COPY . .

WORKDIR /app/backend_api

# Création des dossiers nécessaires
RUN mkdir -p media/preprocessed_imgs media/extracted_regions

EXPOSE 8000

# 🔥 PRODUCTION SERVER
CMD ["gunicorn", "backend_api.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--threads", "2", \
     "--timeout", "300"]