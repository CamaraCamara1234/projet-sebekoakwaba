FROM ubuntu:22.04

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV DEBIAN_FRONTEND=noninteractive

# Installation des dépendances système
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3-dev \
    build-essential \
    cmake \
    git \
    wget \
    curl \
    tesseract-ocr \
    tesseract-ocr-fra \
    tesseract-ocr-eng \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installation des packages Python
COPY requirements.txt .
RUN pip3 install --upgrade pip
RUN pip3 install numpy
RUN pip3 install paddlepaddle==2.6.2
RUN pip3 install paddleocr==2.10.0
RUN pip3 install -r requirements.txt

COPY . .

RUN mkdir -p /app/data /app/media && chmod -R 777 /app/data /app/media

EXPOSE 8000

CMD ["python3", "backend_api/manage.py", "runserver", "0.0.0.0:8000"]