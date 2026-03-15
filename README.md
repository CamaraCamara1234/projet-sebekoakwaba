# OCR & Face Verification API

Projet permettant l’extraction de texte (OCR) et la vérification faciale via une API Django, avec interface React.

---

## Prérequis

### 1. Logiciels

- Python 3.10+
- Node.js 18+
- Git
- Docker (optionnel, si vous utilisez Docker)

### 2. Dépendances système (Linux / Ubuntu)

Pour que tout fonctionne (OCR, InsightFace, PaddleOCR, DeepFace…) :

```bash
sudo apt update && sudo apt install -y \
    build-essential \
    cmake \
    git \
    g++ \
    wget \
    curl \
    unzip \
    tesseract-ocr \
    tesseract-ocr-fra \
    libgomp1 \
    libsm6 \
    libxrender1 \
    libxext6 \
    libgl1-mesa-glx
```

Ces paquets permettent de compiler des extensions C++ et d’utiliser OpenCV, Tesseract et les librairies de deep learning.

1. Cloner le projet
``git clone https://github.com/CamaraCamara1234/projet-sebekoakwaba.git``
``cd projet-sebekoakwaba``
2. Lancer le Backend (Django)
Créer l’environnement virtuel
``python -m venv venv``

Activer l’environnement :

Windows : ``venv\Scripts\activate``

Linux / Mac : ``source venv/bin/activate``

Installer les dépendances Python
```bash
pip install --upgrade pip
```
```bash
pip install -r requirements.txt
```
Lancer le serveur Django
```bash
python backend_api/manage.py runserver
```


Backend accessible sur : 
```bash
http://127.0.0.1:8000
```

3. Lancer le Frontend (React)
```bash
cd document-extractor-frontend
npm install
npm start
```

Frontend accessible sur : http://localhost:3000

4. Lancer avec Docker (optionnel)

Construire l’image :

```bash
docker build -t ocr-api .
```

Lancer le container :

```bash
docker run -p 8000:8000 ocr-api
```

Avec Docker, toutes les dépendances système (Tesseract, compilateurs, OpenCV…) sont incluses dans l’image.

5. Structure du projet
```bash
project
│
├── backend_api        # API Django
├── document-extractor-frontend # Application React
├── requirements.txt   # Dépendances Python
├── Dockerfile
└── README.md
```
