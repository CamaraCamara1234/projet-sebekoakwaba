# Stage 1: Builder
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

RUN pip install --no-cache-dir --upgrade pip setuptools wheel cython

# CPU versions
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir paddlepaddle==2.6.2 -i https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip install --no-cache-dir paddleocr==2.10.0

COPY requirements.txt .
RUN sed -i '/torch/d' requirements.txt && \
    sed -i '/paddle/d' requirements.txt && \
    pip install --no-cache-dir -r requirements.txt

# 🔥 ajouter gunicorn ici
RUN pip install gunicorn

# Stage 2: Runtime
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

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

COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .
# Déplacement vers le dossier du backend pour Django/Gunicorn
WORKDIR /app/backend_api

RUN mkdir -p media/preprocessed_imgs media/extracted_regions

EXPOSE 8000

# 🔥 PRODUCTION SERVER
CMD ["gunicorn", "backend_api.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "1", \
     "--threads", "2", \
     "--timeout", "300"]