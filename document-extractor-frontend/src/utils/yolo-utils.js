/**
 * Utilitaires pour le pré-traitement et post-traitement YOLOv8
 */

export const CLASSES = [
  "ivoire_cni_recto",
  "ivoire_cni_verso",
  "passeport",
  "sejour_recto",
  "sejour_verso"
];

/**
 * Prépare l'image pour le modèle (640x640)
 */
export const preprocessImage = (sourceCanvas, modelWidth = 640, modelHeight = 640) => {
  const canvas = document.createElement('canvas');
  canvas.width = modelWidth;
  canvas.height = modelHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  // Remplir de gris (letterbox padding standard YOLO)
  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, modelWidth, modelHeight);
  
  // Calculer l'échelle pour conserver le ratio
  const scale = Math.min(modelWidth / sourceCanvas.width, modelHeight / sourceCanvas.height);
  const dw = sourceCanvas.width * scale;
  const dh = sourceCanvas.height * scale;
  const dx = (modelWidth - dw) / 2;
  const dy = (modelHeight - dh) / 2;
  
  ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
  
  const imgData = ctx.getImageData(0, 0, modelWidth, modelHeight);
  const data = imgData.data;
  
  const float32Data = new Float32Array(3 * modelWidth * modelHeight);
  for (let i = 0; i < modelWidth * modelHeight; i++) {
    float32Data[i] = data[i * 4] / 255.0; // R
    float32Data[modelWidth * modelHeight + i] = data[i * 4 + 1] / 255.0; // G
    float32Data[2 * modelWidth * modelHeight + i] = data[i * 4 + 2] / 255.0; // B
  }
  
  return { 
    tensorData: float32Data, 
    scale, 
    dx, 
    dy,
    dw,
    dh
  };
};

/**
 * Traite la sortie du modèle YOLOv8
 * Sortie typique: [1, 10, 8400] ou [1, 8400, 10]
 */
export const postprocessOutput = (outputTensor, confidenceThreshold = 0.5, iouThreshold = 0.45) => {
  const dims = outputTensor.dims;
  const data = outputTensor.data;
  
  let boxes = [];
  
  // Format [batch, features, anchors] -> [1, 10, 8400]
  if (dims.length === 3 && dims[1] >= 5) {
    const numFeatures = dims[1];
    const numAnchors = dims[2];
    const actualNumClasses = numFeatures - 4;
    
    for (let i = 0; i < numAnchors; i++) {
      let maxConf = 0;
      let classId = -1;
      
      for (let c = 0; c < actualNumClasses; c++) {
        const confOffset = (4 + c) * numAnchors + i;
        const conf = data[confOffset];
        if (conf > maxConf) {
          maxConf = conf;
          classId = c;
        }
      }
      
      if (maxConf >= confidenceThreshold) {
        const cx = data[0 * numAnchors + i];
        const cy = data[1 * numAnchors + i];
        const w = data[2 * numAnchors + i];
        const h = data[3 * numAnchors + i];
        
        boxes.push({
          x: cx - w / 2,
          y: cy - h / 2,
          w: w,
          h: h,
          cx, cy,
          classId,
          className: classId < CLASSES.length ? CLASSES[classId] : `Inconnu_${classId}`,
          confidence: maxConf
        });
      }
    }
  } else if (dims.length === 3 && dims[2] >= 5) {
    // Format [batch, anchors, features] -> [1, 8400, 10]
    const numAnchors = dims[1];
    const stride = dims[2];
    const actualNumClasses = stride - 4;
    
    for (let i = 0; i < numAnchors; i++) {
      let maxConf = 0;
      let classId = -1;
      for (let c = 0; c < actualNumClasses; c++) {
        const conf = data[i * stride + 4 + c];
        if (conf > maxConf) {
          maxConf = conf;
          classId = c;
        }
      }
      if (maxConf >= confidenceThreshold) {
        const cx = data[i * stride + 0];
        const cy = data[i * stride + 1];
        const w = data[i * stride + 2];
        const h = data[i * stride + 3];
        boxes.push({
          x: cx - w / 2,
          y: cy - h / 2,
          w: w,
          h: h,
          cx, cy,
          classId,
          className: classId < CLASSES.length ? CLASSES[classId] : `Inconnu_${classId}`,
          confidence: maxConf
        });
      }
    }
  }
  
  // Appliquer Non-Maximum Suppression (NMS)
  return nms(boxes, iouThreshold);
};

/**
 * Calcule l'Intersection over Union (IoU) entre deux boîtes
 */
const calculateIoU = (box1, box2) => {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.w, box2.x + box2.w);
  const y2 = Math.min(box1.y + box1.h, box2.y + box2.h);
  
  const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersectionArea === 0) return 0;
  
  const box1Area = box1.w * box1.h;
  const box2Area = box2.w * box2.h;
  const unionArea = box1Area + box2Area - intersectionArea;
  
  return intersectionArea / unionArea;
};

/**
 * Non-Maximum Suppression (NMS)
 */
const nms = (boxes, iouThreshold) => {
  if (boxes.length === 0) return [];
  
  boxes.sort((a, b) => b.confidence - a.confidence);
  
  const result = [];
  while (boxes.length > 0) {
    const currentBox = boxes[0];
    result.push(currentBox);
    
    boxes = boxes.slice(1).filter(box => {
      const iou = calculateIoU(currentBox, box);
      return iou < iouThreshold;
    });
  }
  
  return result;
};
