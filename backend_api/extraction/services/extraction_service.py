import os
import cv2
import pytesseract
import numpy as np
import easyocr
import re
from paddleocr import PaddleOCR
from ultralytics import YOLO
from typing import List, Tuple, Optional, Dict, Set
from dataclasses import dataclass
import logging
from django.conf import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    label: str
    image_path: str
    text: str
    confidence: float
    ocr_engine: str


class ExtractZonesTexts:

    # Mapping document → champs obligatoires
    REQUIRED_FIELDS_BY_DOC: Dict[str, Set[str]] = {
        "ivoire_cni_recto": {"nom", "prenom", "date_naissance", "nationalite", "date_expiration", "cin", "sexe", "taille", "lieu_naissance", "photo"},
        "ivoire_cni_verso": {"nini", "profession", "date_emission", "ville_emission", "code"},
        "sejour_recto": {"nom", "prenom", "date_naissance", "ville", "date_expiration", "cin", "photo"},
        "sejour_verso": {"sexe", "motif_sejour", "adresse", "code"},
        "passeport": {"nom", "prenom", "date_naissance", "nationalite", "pays", "date_delivrance", "date_expiration", "numero", "taille", "sexe", "lieu_naissance", "profession", "photo", "code"}
    }

    def __init__(self, yolo_model_path: str, session_id: Optional[str] = None, doc_type: str = "cni_recto"):
        self.yolo_model = YOLO(yolo_model_path)
        self.session_id = session_id
        self.doc_type = doc_type

        self.easyocr_reader = easyocr.Reader(['fr', 'en'], gpu=False)
        self.paddle_ocr = PaddleOCR(use_angle_cls=True, lang='en')

        self._create_directories()

    # -----------------------------
    # DIRECTORIES
    # -----------------------------
    def _create_directories(self):
        base_extracted_dir = os.path.join(
            settings.BASE_DIR, "media", "extracted_regions")
        os.makedirs(base_extracted_dir, exist_ok=True)

        if self.session_id:
            self.extracted_dir = os.path.join(
                base_extracted_dir, self.session_id)
            os.makedirs(self.extracted_dir, exist_ok=True)
            logger.info(
                f"Session {self.session_id} - Dossier créé: {self.extracted_dir}")
        else:
            self.extracted_dir = base_extracted_dir

        self.temp_dir = os.path.join(settings.BASE_DIR, "media", "temp")
        os.makedirs(self.temp_dir, exist_ok=True)

    # -----------------------------
    # IMAGE ENHANCEMENT
    # -----------------------------
    def _enhance_image_for_redetection(self, image):
        """Amélioration image : resize + sharpen + CLAHE"""
        image = cv2.resize(image, None, fx=1.5, fy=1.5,
                           interpolation=cv2.INTER_CUBIC)
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        image = cv2.filter2D(image, -1, kernel)

        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        lab = cv2.merge((l, a, b))
        image = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        return image

    # -----------------------------
    # EXPAND ROI
    # -----------------------------
    def _expand_roi(self, roi: np.ndarray, percent: float = 0.15) -> np.ndarray:
        h, w = roi.shape[:2]
        new_h = int(h * (1 + percent))
        new_w = int(w * (1 + percent))
        return cv2.resize(roi, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    # -----------------------------
    # CLEAN TEXT
    # -----------------------------
    def _clean_text(self, text: str):
        text = text.strip()
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'[^\w\s/:-]', '', text)
        return text

    # -----------------------------
    # OCR METHODS
    # -----------------------------
    def _ocr_paddle(self, image):
        result = self.paddle_ocr.ocr(image, cls=True)
        if result is None:
            return "", 0
        texts, confs = [], []
        for line in result:
            for word in line:
                texts.append(word[1][0])
                confs.append(word[1][1])
        return self._clean_text(" ".join(texts)), float(np.mean(confs)) if confs else 0

    def _ocr_tesseract(self, image):
        text = pytesseract.image_to_string(
            image, lang='fra', config='--psm 6 --oem 3')
        return self._clean_text(text), 1.0

    def _ocr_easyocr(self, image):
        results = self.easyocr_reader.readtext(image)
        if not results:
            return "", 0
        texts, confs = zip(*[(text, conf) for (_, text, conf) in results])
        return self._clean_text(" ".join(texts)), float(np.mean(confs))

    def _hybrid_ocr(self, image):
        tess_text, _ = self._ocr_tesseract(image)
        easy_text, easy_conf = self._ocr_easyocr(image)
        if easy_conf > 0.6 and len(easy_text) >= len(tess_text):
            return easy_text, easy_conf, "easyocr"
        else:
            return tess_text, 1.0, "tesseract"

    # -----------------------------
    # CHECK REQUIRED FIELDS
    # -----------------------------
    def _all_required_fields_detected(self, regions: List[Tuple[str, str, float]]) -> bool:
        detected = {label for label, _, _ in regions}
        required_fields = self.REQUIRED_FIELDS_BY_DOC.get(self.doc_type, set())
        missing = required_fields - detected
        if missing:
            logger.warning(
                f"Session {self.session_id} - Champs manquants pour {self.doc_type}: {missing}")
            return False
        return True

    # -----------------------------
    # EXTRACT BOXES
    # -----------------------------
    def _extract_boxes(self, result, img):
        extracted_regions = []
        special_labels = {"photo", "code"}
        special_regions = []
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            label = result.names[int(box.cls)]
            confidence = float(box.conf)
            if label == "code":
                roi = img[y1:y2+10, x1:x2]
            else:
                roi = img[y1:y2, x1:x2]
            filename = f"{label}.png"
            output_path = os.path.join(self.extracted_dir, filename)

            if label in special_labels:
                cv2.imwrite(output_path, roi)
                special_regions.append((label, output_path, confidence))
                continue

            roi_gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            roi_gray = cv2.cvtColor(roi_gray, cv2.COLOR_GRAY2BGR)
            roi_expanded = self._expand_roi(roi_gray, percent=0.30)
            cv2.imwrite(output_path, roi_expanded)
            extracted_regions.append((label, output_path, confidence))

        return special_regions + extracted_regions

    # -----------------------------
    # EXTRACT REGIONS ROBUST
    # -----------------------------
    def extract_regions(self, image_path: str):
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Image non trouvée : {image_path}")

        # 1ère détection normale
        results = self.yolo_model.predict(image_path)
        result = results[0]
        regions = self._extract_boxes(result, img)

        # Vérifier champs obligatoires
        if self._all_required_fields_detected(regions):
            return regions

        # Sinon, tentative avec image améliorée
        enhanced = self._enhance_image_for_redetection(img)
        results = self.yolo_model.predict(enhanced)
        result = results[0]
        regions = self._extract_boxes(result, enhanced)
        return regions

    # -----------------------------
    # TEXT EXTRACTION
    # -----------------------------
    def extract_text(self, image_path: str) -> ExtractionResult:
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Image non trouvée : {image_path}")

        label = os.path.basename(image_path).replace(".png", "")
        if label in {"code", "nini"}:
            text, conf = self._ocr_paddle(image)
            engine = "paddleocr"
        else:
            text, conf, engine = self._hybrid_ocr(image)

        logger.info(
            f"Session {self.session_id} - OCR ({engine}) pour {label}: {text[:50]}")
        return ExtractionResult(label=label, image_path=image_path, text=text, confidence=conf, ocr_engine=engine)

    # -----------------------------
    # PIPELINE GLOBAL
    # -----------------------------
    def process_image(self, image_path: str) -> List[ExtractionResult]:
        regions = self.extract_regions(image_path)
        results = []
        for label, region_path, confidence in regions:
            if label not in {"photo", "signature"}:
                try:
                    result = self.extract_text(region_path)
                    result.label = label
                    result.confidence = confidence
                    results.append(result)
                except Exception as e:
                    logger.warning(
                        f"Session {self.session_id} - Échec OCR {label}: {str(e)}")
        return results

# -----------------------------
# HELPERS URL
# -----------------------------


def get_session_regions_url(session_id: str, label: str) -> str:
    return f"{settings.MEDIA_URL}extracted_regions/{session_id}/{label}.png"


def get_session_preprocessed_url(session_id: str, class_name: str) -> str:
    return f"{settings.MEDIA_URL}preprocessed_imgs/{session_id}_{class_name}.jpg"
