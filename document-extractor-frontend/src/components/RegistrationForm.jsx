import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import * as ort from 'onnxruntime-web';
import { preprocessImage, postprocessOutput } from '../utils/yolo-utils';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';
ort.env.wasm.numThreads = 1; // Mono-thread : plus stable sur Android

// Détecter le type d'appareil une seule fois (hors composant)
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const IS_MOBILE  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
// Sur Android bas de gamme : 320x320 => ~4x plus rapide qu'à 640x640
const MODEL_SIZE = IS_ANDROID ? 320 : 640;
// Intervalle entre deux inférences (ms)
const INFER_INTERVAL = IS_ANDROID ? 500 : 180;

// Constantes pour l'auto-capture
const REQUIRED_CONSECUTIVE_FRAMES = 5;
const MIN_CONFIDENCE = 0.5;
const TARGET_WIDTH_RATIO = 0.45;

const RegistrationForm = ({ onSubmit, initialData, isUploading }) => {
  const [photo, setPhoto] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Veuillez cadrer votre document');
  const [progress, setProgress] = useState(0);
  const [debugInfo, setDebugInfo] = useState('');
  const [roiBox, setRoiBox] = useState(null);

  const webcamRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const sessionRef = useRef(null);
  const requestRef = useRef(null);
  const consecutiveValidFramesRef = useRef(0);
  const isCapturingRef = useRef(false);

  // Configuration de la caméra (résolution réduite sur Android)
  const getVideoConstraints = () => {
    if (IS_ANDROID) {
      return { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { exact: 'environment' } };
    }
    if (IS_MOBILE) {
      return { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: { exact: 'environment' } };
    }
    return { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: { ideal: 'environment' } };
  };

  // Chargement du modèle
  useEffect(() => {
    const loadModel = async () => {
      try {
        const session = await ort.InferenceSession.create('/models/best.onnx', {
          executionProviders: ['wasm'],
        });
        sessionRef.current = session;
        setIsModelLoaded(true);
        console.log(`Modèle YOLO chargé — input: ${MODEL_SIZE}x${MODEL_SIZE} — Android: ${IS_ANDROID}`);
      } catch (e) {
        console.error('Erreur lors du chargement du modèle:', e);
        setCameraError("Erreur lors du chargement de l'IA de détection: " + e.message);
      }
    };
    loadModel();
  }, []);

  // Détection continue
  const detectFrame = useCallback(async () => {
    if (!webcamRef.current || !webcamRef.current.video || !sessionRef.current || isCapturingRef.current) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const video = webcamRef.current.video;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    try {
      // 1. Canvas à la résolution originale de la vidéo
      //    preprocessImage gère lui-même le letterbox vers MODEL_SIZE
      //    → une seule chaîne de coordonnées, zéro bug de reprojection
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      // 2. Prétraitement + letterbox → MODEL_SIZE × MODEL_SIZE
      const { tensorData, scale, dx, dy } = preprocessImage(canvas, MODEL_SIZE, MODEL_SIZE);
      const tensor = new ort.Tensor('float32', tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]);

      // 3. Inférence ONNX
      const inputName = sessionRef.current.inputNames[0];
      const results = await sessionRef.current.run({ [inputName]: tensor });
      const outputName = sessionRef.current.outputNames[0];
      const outputTensor = results[outputName];

      // 4. Post-traitement (NMS)
      const boxes = postprocessOutput(outputTensor, MIN_CONFIDENCE);

      // 5. Mettre à jour le debug et la ROI box
      if (boxes.length > 0) {
          const topBox = boxes[0];
          if (consecutiveValidFramesRef.current % 2 === 0) {
              setDebugInfo(`Détecté: ${topBox.className} (Id: ${topBox.classId}) à ${(topBox.confidence * 100).toFixed(0)}%`);
          }
          // Mettre à jour la ROI Box pour l'affichage
          const x = (topBox.x - dx) / scale;
          const y = (topBox.y - dy) / scale;
          const w = topBox.w / scale;
          const h = topBox.h / scale;
          setRoiBox({ x, y, w, h, label: `${topBox.className} ${(topBox.confidence * 100).toFixed(0)}%` });
      } else {
          if (consecutiveValidFramesRef.current % 5 === 0) {
              setDebugInfo(`Recherche de document...`);
          }
          setRoiBox(null);
      }

      // 6. Analyser les conditions d'auto-capture
      checkAutoCaptureConditions(boxes, video.videoWidth, video.videoHeight, scale, dx, dy);

    } catch (e) {
      console.error('Erreur inférence:', e);
      if (consecutiveValidFramesRef.current % 10 === 0) {
          setDebugInfo(`Erreur inférence: ${e.message}`);
      }
    }

    if (!isCapturingRef.current) {
      setTimeout(() => {
        if (!isCapturingRef.current) requestRef.current = requestAnimationFrame(detectFrame);
      }, INFER_INTERVAL);
    }
  }, []);

  // Démarrer / arrêter la boucle d'inférence
  useEffect(() => {
    if (showCamera && isCameraReady && isModelLoaded) {
      requestRef.current = requestAnimationFrame(detectFrame);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [showCamera, isCameraReady, isModelLoaded, detectFrame]);

  // Vérifier si la carte est bien positionnée pour l'auto-capture
  const checkAutoCaptureConditions = (boxes, vidW, vidH, scale, dx, dy) => {
    if (boxes.length === 0) {
      setStatusMessage('Aucun document détecté');
      consecutiveValidFramesRef.current = Math.max(0, consecutiveValidFramesRef.current - 1);
      setProgress(Math.min(100, (consecutiveValidFramesRef.current / REQUIRED_CONSECUTIVE_FRAMES) * 100));
      return;
    }

    // Prendre la boîte avec la plus grande confiance
    const bestBox = boxes[0];
    const boxLeft   = (bestBox.x - dx) / scale;
    const boxTop    = (bestBox.y - dy) / scale;
    const boxRight  = (bestBox.x + bestBox.w - dx) / scale;
    const boxBottom = (bestBox.y + bestBox.h - dy) / scale;

    // Marge minimale requise : 8% de chaque côté du cadre vidéo
    const MARGIN_X = vidW * 0.06;
    const MARGIN_Y = vidH * 0.06;

    const hasLeftMargin   = boxLeft   > MARGIN_X;
    const hasRightMargin  = boxRight  < vidW - MARGIN_X;
    const hasTopMargin    = boxTop    > MARGIN_Y;
    const hasBottomMargin = boxBottom < vidH - MARGIN_Y;
    const isCentered = hasLeftMargin && hasRightMargin && hasTopMargin && hasBottomMargin;

    // Vérifier la taille
    if (boxRight - boxLeft < vidW * TARGET_WIDTH_RATIO) {
      setStatusMessage('Rapprochez le document');
      consecutiveValidFramesRef.current = Math.max(0, consecutiveValidFramesRef.current - 1);
    } 
    // Vérifier le cadrage (marges sur les 4 côtés)
    else if (!isCentered) {
      const hint = !hasLeftMargin ? 'vers la droite' : !hasRightMargin ? 'vers la gauche' :
                   !hasTopMargin  ? 'vers le bas'    : 'vers le haut';
      setStatusMessage(`Déplacez le document ${hint}`);
      consecutiveValidFramesRef.current = Math.max(0, consecutiveValidFramesRef.current - 1);
    } 
    else {
      setStatusMessage(`${bestBox.className} détecté. Maintenez la position.`);
      consecutiveValidFramesRef.current += 1;
    }

    const currentProgress = Math.min(100, (consecutiveValidFramesRef.current / REQUIRED_CONSECUTIVE_FRAMES) * 100);
    setProgress(currentProgress);

    if (consecutiveValidFramesRef.current >= REQUIRED_CONSECUTIVE_FRAMES && !isCapturingRef.current) {
      // SÉCURITÉ FINALE : vérifier une dernière fois les marges sur les 4 côtés
      if (!isCentered) {
        setStatusMessage('Cadrez correctement le document pour finaliser la capture');
        consecutiveValidFramesRef.current = Math.max(0, consecutiveValidFramesRef.current - 2);
        return;
      }
      isCapturingRef.current = true;
      const cropX = (bestBox.x - dx) / scale;
      const cropY = (bestBox.y - dy) / scale;
      const cropW = bestBox.w / scale;
      const cropH = bestBox.h / scale;
      performCapture({ x: cropX, y: cropY, w: cropW, h: cropH });
    }
  };

  // Logique de capture (burst + netteté + crop)
  const performCapture = async (roi) => {
    setIsProcessing(true);
    setStatusMessage('Capture en cours... Ne bougez pas.');
    
    // Retirer l'overlay
    setRoiBox(null);

    try {
      const video = webcamRef.current.video;
      const canvas = document.createElement('canvas');
      
      // Ajouter une marge de 5% autour de la ROI
      const marginX = roi.w * 0.02;
      const marginY = roi.h * 0.02;
      const x = Math.max(0, roi.x - marginX);
      const y = Math.max(0, roi.y - marginY);
      const w = Math.min(video.videoWidth - x, roi.w + marginX * 2);
      const h = Math.min(video.videoHeight - y, roi.h + marginY * 2);

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      ctx.drawImage(video, x, y, w, h, 0, 0, w, h);

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95);
      });
      
      const file = new File([blob], `id_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(file);

      setPhoto({
        file: file,
        preview: previewUrl
      });
      
      stopCamera();
    } catch (e) {
      console.error('Erreur lors de la capture:', e);
      setCameraError('Erreur de capture.');
      isCapturingRef.current = false;
      consecutiveValidFramesRef.current = 0;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCameraReady = () => {
    setIsCameraReady(true);
    isCapturingRef.current = false;
    consecutiveValidFramesRef.current = 0;
    setProgress(0);
  };

  const handleCameraError = (error) => {
    console.error('Camera err:', error);
    setCameraError('Erreur d\'accès à la caméra.');
  };

  const startCamera = () => {
    setShowCamera(true);
    setCameraError('');
    setPhoto(null);
  };

  const stopCamera = () => {
    setShowCamera(false);
    setIsCameraReady(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const handleSubmit = () => {
    if (onSubmit && photo) {
      // Compatibility with Home.jsx: onSubmit({ formData, files })
      onSubmit({ formData: {}, files: [photo.file] });
    }
  };

  return (
    <div className="capture-container">
      <div className="capture-header">
        <h2>Numérisation de Pièce d'Identité</h2>
        <p>Détection automatique par IA</p>
      </div>

      <div className="capture-body">
        {!showCamera ? (
          <div className="preview-section">
            {photo ? (
              <div className="result-view">
                <div className="photo-wrapper">
                  <img src={photo.preview} alt="Capture" />
                  <div className="success-badge">✓ Qualité validée</div>
                </div>
                <div className="actions">
                  <button onClick={startCamera} className="btn-secondary" disabled={isUploading}>Reprendre</button>
                  <button onClick={handleSubmit} className="btn-primary" disabled={isUploading}>
                    {isUploading ? 'Traitement en cours...' : 'Valider'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="intro-view">
                <div className="icon">🪪</div>
                <h3>Mode Scanner de Document</h3>
                <ul>
                  <li>Placez votre pièce d'identité dans le cadre</li>
                  <li>L'IA s'occupe de la mise au point</li>
                  <li>La capture est 100% automatique</li>
                </ul>
                <button onClick={startCamera} className="btn-primary" disabled={!isModelLoaded}>
                  {isModelLoaded ? 'Ouvrir la caméra' : 'Chargement du modèle...'}
                </button>
              </div>
            )}
            {cameraError && <div className="error-msg">{cameraError}</div>}
          </div>
        ) : (
          <div className="camera-section">
            <div className="camera-header">
              <button onClick={stopCamera} className="btn-close">✕</button>
            </div>
            
            <div className="video-wrapper">
              <Webcam
                ref={webcamRef}
                audio={false}
                mirrored={false}
                screenshotFormat="image/jpeg"
                videoConstraints={getVideoConstraints()}
                onUserMedia={handleCameraReady}
                onUserMediaError={handleCameraError}
                className="webcam-feed"
              />
              <canvas
                ref={overlayCanvasRef}
                className="overlay-canvas"
              />
              
              {/* Affichage fluide de la ROI Box de l'IA */}
              {roiBox && (
                  <div className="roi-box" style={{
                      left: `${(roiBox.x / webcamRef.current?.video?.videoWidth) * 100}%`,
                      top: `${(roiBox.y / webcamRef.current?.video?.videoHeight) * 100}%`,
                      width: `${(roiBox.w / webcamRef.current?.video?.videoWidth) * 100}%`,
                      height: `${(roiBox.h / webcamRef.current?.video?.videoHeight) * 100}%`,
                  }}>
                      <div className="roi-label">{roiBox.label}</div>
                  </div>
              )}

              {!isCameraReady && <div className="loading-overlay">Initialisation...</div>}
              {isProcessing && <div className="loading-overlay pulse">Capture Haute Définition...</div>}
            </div>

            <div className="camera-footer">
              <p className="status-text">{statusMessage}</p>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
              <div style={{color: 'lime', fontSize: '12px', marginTop: '10px', wordBreak: 'break-all'}}>{debugInfo}</div>
            </div>
          </div>
        )}
      </div>

      <style jsx="true">{`
        .capture-container {
          max-width: 700px;
          margin: 0 auto;
          font-family: 'Inter', sans-serif;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .capture-header {
          background: linear-gradient(135deg, #1e293b, #3b82f6);
          color: white;
          padding: 2rem;
          text-align: center;
        }
        .capture-header h2 { margin: 0; font-size: 1.8rem; }
        .capture-header p { margin: 0.5rem 0 0; opacity: 0.8; }
        
        .capture-body { padding: 2rem; }
        
        .intro-view, .result-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
        ul { text-align: left; background: #f8fafc; padding: 1.5rem 1.5rem 1.5rem 2.5rem; border-radius: 8px; margin-bottom: 2rem; }
        li { margin-bottom: 0.5rem; color: #475569; }
        
        .photo-wrapper {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          border: 3px solid #10b981;
          margin-bottom: 1.5rem;
        }
        .photo-wrapper img { max-width: 100%; display: block; }
        .success-badge {
          position: absolute; bottom: 0; width: 100%; background: rgba(16,185,129,0.9);
          color: white; padding: 0.5rem; font-weight: bold;
        }

        .btn-primary { background: #3b82f6; color: white; padding: 1rem 2rem; border: none; border-radius: 50px; cursor: pointer; font-size: 1.1rem; width: 100%; max-width: 300px;}
        .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
        .btn-secondary { background: white; color: #3b82f6; border: 2px solid #3b82f6; padding: 1rem 2rem; border-radius: 50px; cursor: pointer; font-size: 1.1rem; width: 100%; max-width: 300px; margin-bottom: 1rem; }
        .btn-secondary:disabled { border-color: #94a3b8; color: #94a3b8; cursor: not-allowed; }
        .actions { display: flex; flex-direction: column; gap: 1rem; width: 100%; align-items: center; }

        .camera-section {
          position: relative;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
        }
        .camera-header {
          position: absolute; top: 0; width: 100%; z-index: 10; padding: 1rem;
        }
        .btn-close {
          background: rgba(255,255,255,0.2); border: none; color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer;
        }
        .video-wrapper {
          position: relative;
          width: 100%;
          height: 60vh; /* Espace caméra réduit */
          min-height: 400px;
          display: flex; justify-content: center; align-items: center;
          overflow: hidden;
        }
        .webcam-feed { width: 100%; height: 100%; object-fit: cover; }
        .overlay-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
        
        .guides { position: absolute; inset: 10%; pointer-events: none; }
        .roi-box {
          position: absolute;
          border: 4px solid #10b981;
          border-radius: 8px;
          box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.65), 0 0 15px rgba(16, 185, 129, 0.5) inset;
          transition: all 0.25s ease-out; /* Mouvement fluide */
          pointer-events: none;
          z-index: 10;
        }

        .roi-label {
          position: absolute;
          top: -30px;
          left: -4px;
          background: #10b981;
          color: white;
          padding: 4px 8px;
          font-weight: bold;
          font-size: 14px;
          border-radius: 4px 4px 4px 0;
          white-space: nowrap;
        }

        .camera-footer {
          background: rgba(0,0,0,0.8);
          padding: 1.5rem;
          text-align: center;
        }
        .status-text { color: white; margin-bottom: 1rem; font-weight: 500; height: 1.5rem; }
        .progress-bar-container { width: 100%; height: 8px; background: #334155; border-radius: 4px; overflow: hidden; }
        .progress-bar { height: 100%; background: #10b981; transition: width 0.1s linear; }
        
        .loading-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.7); color: white; display: flex; justify-content: center; align-items: center; font-size: 1.2rem; }
        .pulse { animation: pulse 1s infinite alternate; }
        @keyframes pulse { from { opacity: 1; } to { opacity: 0.6; } }
      `}</style>
    </div>
  );
};

export default RegistrationForm;