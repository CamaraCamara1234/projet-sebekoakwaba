from PIL import Image
import numpy as np
import cv2
import torch
from insightface.app import FaceAnalysis
from dataclasses import dataclass
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==========================
# Initialisation InsightFace
# ==========================

face_app = FaceAnalysis(
    name="buffalo_l",
    providers=['CUDAExecutionProvider' if torch.cuda.is_available() else 'CPUExecutionProvider']
)

face_app.prepare(
    ctx_id=0 if torch.cuda.is_available() else -1,
    det_size=(640,640)
)


# ==========================
# Result object
# ==========================

@dataclass
class FaceVerificationResult:
    similarity: float
    distance: float
    verified: bool
    threshold: float
    message: str


# ==========================
# Embedding extraction
# ==========================

def extract_embedding(image: Image.Image):

    img_np = np.array(image)
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    faces = face_app.get(img_bgr)

    if len(faces) == 0:
        return None

    # prendre le visage avec la plus grande bounding box
    face = max(faces, key=lambda x: (x.bbox[2]-x.bbox[0])*(x.bbox[3]-x.bbox[1]))

    embedding = face.normed_embedding

    return embedding


# ==========================
# Cosine similarity
# ==========================

def cosine_similarity(a, b):
    return float(np.dot(a,b) / (np.linalg.norm(a) * np.linalg.norm(b)))


# ==========================
# Vérification visage
# ==========================

def verify_faces_service(image1_path: str, image2_path: str, threshold: float = 0.5):

    try:

        img1 = Image.open(image1_path).convert("RGB")
        img2 = Image.open(image2_path).convert("RGB")

        emb1 = extract_embedding(img1)
        emb2 = extract_embedding(img2)

        if emb1 is None or emb2 is None:

            return FaceVerificationResult(
                similarity=0.0,
                distance=1.0,
                verified=False,
                threshold=threshold,
                message="Aucun visage détecté"
            )

        similarity = cosine_similarity(emb1, emb2)
        distance = 1.0 - similarity

        verified = similarity >= threshold

        message = "Visages correspondants" if verified else "Visages différents"

        return FaceVerificationResult(
            similarity=similarity,
            distance=distance,
            verified=verified,
            threshold=threshold,
            message=message
        )

    except Exception as e:

        logger.error(f"Erreur vérification visage: {str(e)}")

        return FaceVerificationResult(
            similarity=0.0,
            distance=1.0,
            verified=False,
            threshold=threshold,
            message="Erreur lors de la vérification"
        )