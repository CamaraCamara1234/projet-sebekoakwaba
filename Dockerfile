FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Dépendances système minimales
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
    libssl-dev \
    build-essential \
    python3-dev \
    cmake \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer les dépendances Python (optimisé)
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir setuptools wheel cython && \
    pip install --no-cache-dir numpy paddlepaddle==2.6.2 paddleocr==2.10.0 && \
    pip install --no-cache-dir -r requirements.txt

# Copier le code après (meilleur cache Docker)
COPY . .

RUN mkdir -p /app/data /app/media

EXPOSE 8000

CMD ["python", "backend_api/manage.py", "runserver", "0.0.0.0:8000"]