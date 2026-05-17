import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import * as ort from 'onnxruntime-web/wasm';
import { QRCodeSVG } from 'qrcode.react';
import { preprocessImage, postprocessOutput } from '../utils/yolo-utils';

// Fichiers WASM servis localement (plus de dépendance CDN, fiable sur mobile)
ort.env.wasm.wasmPaths = '/wasm/';
ort.env.wasm.numThreads = 1; // Mono-thread : plus stable sur mobile

// ── Détection fine des capacités matérielles ──
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const IS_MOBILE  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const RAM_GB     = navigator.deviceMemory || 4;
const CPU_CORES  = navigator.hardwareConcurrency || 4;
const IS_LOW_END = IS_MOBILE && (RAM_GB <= 2 || CPU_CORES <= 2);

// Paramètres adaptatifs selon le profil matériel
const MODEL_SIZE     = IS_LOW_END ? 256 : IS_ANDROID ? 320 : 640;
const INFER_INTERVAL = IS_LOW_END ? 800 : IS_ANDROID ? 500 : 180;
const CAM_WIDTH      = IS_LOW_END ? 640  : IS_ANDROID ? 1280 : 1920;
const CAM_HEIGHT     = IS_LOW_END ? 480  : IS_ANDROID ? 720  : 1080;

const MODEL_URL  = '/models/best.onnx';
const CACHE_NAME = 'yolo-model-cache-v1';

// Constantes pour l'auto-capture
const REQUIRED_CONSECUTIVE_FRAMES = 5;
const MIN_CONFIDENCE = IS_LOW_END ? 0.40 : 0.50;
const TARGET_WIDTH_RATIO = 0.45;

// ── Téléchargement du modèle avec cache + progression ──
async function fetchModelWithProgress(url, onProgress) {
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) {
      onProgress?.(100);
      console.log('Modèle YOLO chargé depuis le cache navigateur.');
      return await cached.arrayBuffer();
    }
  } catch (_) { /* Cache API indisponible */ }

  const response = await fetch(url);
  const contentLength = +(response.headers.get('Content-Length') || 0);

  if (!response.body || !contentLength) {
    const buffer = await response.arrayBuffer();
    try { if (cache) await cache.put(url, new Response(buffer.slice(0))); } catch (_) {}
    onProgress?.(100);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.round((received / contentLength) * 100));
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  try { if (cache) await cache.put(url, new Response(buffer.buffer.slice(0))); } catch (_) {}
  return buffer.buffer;
}

const RegistrationForm = ({ onSubmit, initialData, isUploading }) => {
  const [photo, setPhoto] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Veuillez cadrer votre document');
  const [progress, setProgress] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  const webcamRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const sessionRef = useRef(null);
  const requestRef = useRef(null);
  const consecutiveValidFramesRef = useRef(0);
  const isCapturingRef = useRef(false);
  const loadModelGuardRef = useRef(false);

  // ── Refs pour réduire les re-renders ──
  const roiBoxRef = useRef(null);
  const debugInfoRef = useRef(null);
  const frameCanvasRef = useRef(null);

  // Configuration de la caméra adaptative
  const getVideoConstraints = () => {
    const facingMode = IS_MOBILE ? { exact: 'environment' } : { ideal: 'environment' };
    return { width: { ideal: CAM_WIDTH }, height: { ideal: CAM_HEIGHT }, facingMode };
  };

  // ── Chargement différé du modèle (appelé au clic caméra) ──
  const loadModel = useCallback(async () => {
    if (sessionRef.current || loadModelGuardRef.current) return;
    loadModelGuardRef.current = true;

    setIsModelLoading(true);
    setModelLoadProgress(0);
    setCameraError('');

    try {
      const buffer = await fetchModelWithProgress(MODEL_URL, (pct) => {
        setModelLoadProgress(pct);
      });

      const session = await ort.InferenceSession.create(buffer, {
        executionProviders: ['wasm'],
      });
      sessionRef.current = session;
      setIsModelLoaded(true);
      console.log(`Modèle YOLO chargé — input: ${MODEL_SIZE}×${MODEL_SIZE} — Low-end: ${IS_LOW_END} — RAM: ${RAM_GB}GB — Cores: ${CPU_CORES}`);
    } catch (e) {
      console.error('Erreur lors du chargement du modèle:', e);
      setCameraError("Erreur lors du chargement de l'IA de détection: " + e.message);
      loadModelGuardRef.current = false;
    } finally {
      setIsModelLoading(false);
    }
  }, []);

  // Nettoyage lors du démontage
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        try {
          sessionRef.current.release();
          sessionRef.current = null;
          console.log("Mémoire du modèle YOLO libérée avec succès.");
        } catch (e) {
          console.warn("Impossible de libérer le modèle YOLO:", e);
        }
      }
    };
  }, []);

  // Détection continue — canvas réutilisé + mises à jour DOM directes
  const detectFrame = useCallback(async () => {
    if (!webcamRef.current?.video || !sessionRef.current || isCapturingRef.current) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const video = webcamRef.current.video;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    try {
      // Canvas réutilisable (évite document.createElement à chaque frame)
      if (!frameCanvasRef.current) {
        frameCanvasRef.current = document.createElement('canvas');
      }
      const canvas = frameCanvasRef.current;
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      const { tensorData, scale, dx, dy } = preprocessImage(canvas, MODEL_SIZE, MODEL_SIZE);
      const tensor = new ort.Tensor('float32', tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]);

      const inputName = sessionRef.current.inputNames[0];
      const results = await sessionRef.current.run({ [inputName]: tensor });
      const outputName = sessionRef.current.outputNames[0];
      const outputTensor = results[outputName];

      const boxes = postprocessOutput(outputTensor, MIN_CONFIDENCE);

      // ── Mises à jour DOM directes (zéro re-render React) ──
      const roiEl = roiBoxRef.current;
      const dbgEl = debugInfoRef.current;

      if (boxes.length > 0) {
        const topBox = boxes[0];

        if (dbgEl && consecutiveValidFramesRef.current % 2 === 0) {
          dbgEl.textContent = `Détecté: ${topBox.className} (Id: ${topBox.classId}) à ${(topBox.confidence * 100).toFixed(0)}%`;
        }

        if (roiEl && video.videoWidth > 0) {
          const x = (topBox.x - dx) / scale;
          const y = (topBox.y - dy) / scale;
          const w = topBox.w / scale;
          const h = topBox.h / scale;

          roiEl.style.display = 'block';
          roiEl.style.left   = `${(x / video.videoWidth) * 100}%`;
          roiEl.style.top    = `${(y / video.videoHeight) * 100}%`;
          roiEl.style.width  = `${(w / video.videoWidth) * 100}%`;
          roiEl.style.height = `${(h / video.videoHeight) * 100}%`;

          const labelEl = roiEl.querySelector('.roi-label');
          if (labelEl) labelEl.textContent = `${topBox.className} ${(topBox.confidence * 100).toFixed(0)}%`;
        }
      } else {
        if (dbgEl && consecutiveValidFramesRef.current % 5 === 0) {
          dbgEl.textContent = 'Recherche de document...';
        }
        if (roiEl) roiEl.style.display = 'none';
      }

      checkAutoCaptureConditions(boxes, video.videoWidth, video.videoHeight, scale, dx, dy);

    } catch (e) {
      console.error('Erreur inférence:', e);
      const dbgEl = debugInfoRef.current;
      if (dbgEl && consecutiveValidFramesRef.current % 10 === 0) {
        dbgEl.textContent = `Erreur inférence: ${e.message}`;
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

    const bestBox = boxes[0];
    const boxLeft   = (bestBox.x - dx) / scale;
    const boxTop    = (bestBox.y - dy) / scale;
    const boxRight  = (bestBox.x + bestBox.w - dx) / scale;
    const boxBottom = (bestBox.y + bestBox.h - dy) / scale;

    const MARGIN_X = vidW * 0.02;
    const MARGIN_Y = vidH * 0.02;

    const hasLeftMargin   = boxLeft   > MARGIN_X;
    const hasRightMargin  = boxRight  < vidW - MARGIN_X;
    const hasTopMargin    = boxTop    > MARGIN_Y;
    const hasBottomMargin = boxBottom < vidH - MARGIN_Y;
    const isCentered = hasLeftMargin && hasRightMargin && hasTopMargin && hasBottomMargin;

    const isTooClose = (!hasLeftMargin && !hasRightMargin) || (!hasTopMargin && !hasBottomMargin);

    if (boxRight - boxLeft < vidW * TARGET_WIDTH_RATIO) {
      setStatusMessage('Caméra trop éloignée');
      consecutiveValidFramesRef.current = Math.max(0, consecutiveValidFramesRef.current - 1);
    } 
    else if (isTooClose) {
      setStatusMessage('Caméra trop proche');
      consecutiveValidFramesRef.current = Math.max(0, consecutiveValidFramesRef.current - 1);
    }
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
    
    // Retirer l'overlay via DOM direct
    if (roiBoxRef.current) roiBoxRef.current.style.display = 'none';

    try {
      const video = webcamRef.current.video;
      const canvas = document.createElement('canvas');
      
      const marginX = roi.w * 0.02;
      const marginY = roi.h * 0.02;
      const x = Math.max(0, roi.x - marginX);
      const y = Math.max(0, roi.y - marginY);
      const w = Math.min(video.videoWidth - x, roi.w + marginX * 2);
      const h = Math.min(video.videoHeight - y, roi.h + marginY * 2);

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
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

  // ── Ouverture caméra avec chargement différé du modèle ──
  const startCamera = async () => {
    setCameraError('');
    setPhoto(null);

    if (!sessionRef.current) {
      await loadModel();
      if (!sessionRef.current) return; // Échec du chargement
    }

    setShowCamera(true);
  };

  const stopCamera = () => {
    setShowCamera(false);
    setIsCameraReady(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const handleSubmit = () => {
    if (onSubmit && photo) {
      onSubmit({ formData: {}, files: [photo.file] });
    }
  };

  return (
    <div className="capture-container">
      <div className="capture-header">
        <h2>Numérisation de Pièce d'Identité</h2>
        <p>Détection automatique par le système</p>
      </div>

      <div className="capture-body">
        {!IS_MOBILE ? (
          <div className="desktop-qr-view">
            <div className="icon">📱</div>
            <h3>Vérification Mobile Requise</h3>
            <p className="desktop-description">
              Pour continuer le processus de vérification, veuillez scanner ce code QR avec votre téléphone portable.
              La caméra de votre téléphone est requise pour une capture optimale et sécurisée.
            </p>
            <div className="qr-wrapper">
              {currentUrl && <QRCodeSVG value={currentUrl} size={250} level="H" includeMargin={true} />}
            </div>
            {currentUrl && (
              <p className="qr-url-hint">Ou ouvrez ce lien sur votre mobile :<br/><strong>{currentUrl}</strong></p>
            )}
          </div>
        ) : !showCamera ? (
          <div className="preview-section">
            {photo ? (
              <div className="result-view">
                <div className="photo-wrapper">
                  <img src={photo.preview} alt="Capture" />
                  <div className="success-badge">Assurez vous que le document est lisible</div>
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
                  <li>Assurez-vous que votre passeport est bien cadré.</li>
                  <li>Assurez-vous qu'il y ait un bon éclairage.</li>
                  <li>Le système s'occupe de la mise au point.</li>
                  <li>La capture est 100% automatique.</li>
                </ul>
                <button onClick={startCamera} className="btn-primary" disabled={isModelLoading}>
                  {isModelLoading ? `Chargement du modèle... ${modelLoadProgress}%` : 'Ouvrir la caméra'}
                </button>
                {isModelLoading && (
                  <div className="model-progress-container">
                    <div className="model-progress-bar" style={{ width: `${modelLoadProgress}%` }}></div>
                    <span className="model-progress-label">
                      {modelLoadProgress < 100 ? 'Téléchargement du modèle IA...' : 'Initialisation...'}
                    </span>
                  </div>
                )}
                {IS_LOW_END && (
                  <p className="device-hint">📱 Mode économie activé pour votre appareil</p>
                )}
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
              
              {/* ROI Box — manipulé via ref (zéro re-render React) */}
              <div ref={roiBoxRef} className="roi-box" style={{ display: 'none' }}>
                <div className="roi-label"></div>
              </div>

              {!isCameraReady && <div className="loading-overlay">Initialisation...</div>}
              {isProcessing && <div className="loading-overlay pulse">Capture Haute Définition...</div>}
            </div>

            <div className="camera-footer">
              <p className="status-text">{statusMessage}</p>
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
              <div ref={debugInfoRef} style={{color: 'lime', fontSize: '12px', marginTop: '10px', wordBreak: 'break-all'}}></div>
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
          position: absolute; bottom: 0; width: 100%; background: rgba(16, 179, 185, 0.9);
          color: white; padding: 0.5rem; font-weight: bold;
        }

        .btn-primary { background: #3b82f6; color: white; padding: 1rem 2rem; border: none; border-radius: 50px; cursor: pointer; font-size: 1.1rem; width: 100%; max-width: 300px;}
        .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
        .btn-secondary { background: white; color: #3b82f6; border: 2px solid #3b82f6; padding: 1rem 2rem; border-radius: 50px; cursor: pointer; font-size: 1.1rem; width: 100%; max-width: 300px; margin-bottom: 1rem; }
        .btn-secondary:disabled { border-color: #94a3b8; color: #94a3b8; cursor: not-allowed; }
        .actions { display: flex; flex-direction: column; gap: 1rem; width: 100%; align-items: center; }

        .model-progress-container {
          width: 100%;
          max-width: 300px;
          margin-top: 1rem;
          position: relative;
        }
        .model-progress-bar {
          height: 6px;
          background: linear-gradient(90deg, #3b82f6, #10b981);
          border-radius: 3px;
          transition: width 0.2s ease;
        }
        .model-progress-label {
          display: block;
          margin-top: 0.5rem;
          font-size: 0.8rem;
          color: #64748b;
        }
        .device-hint {
          margin-top: 1rem;
          font-size: 0.8rem;
          color: #94a3b8;
          background: #f8fafc;
          padding: 0.5rem 1rem;
          border-radius: 20px;
        }

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
          height: 60vh;
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
          transition: all 0.25s ease-out;
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

        .desktop-qr-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 2rem 1rem;
        }
        .desktop-description {
          color: #475569;
          margin-bottom: 2rem;
          max-width: 500px;
          line-height: 1.6;
        }
        .qr-wrapper {
          background: white;
          padding: 1rem;
          border-radius: 16px;
          border: 2px solid #e2e8f0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          margin-bottom: 1.5rem;
          display: inline-block;
        }
        .qr-url-hint {
          color: #64748b;
          font-size: 0.9rem;
          word-break: break-all;
          max-width: 400px;
        }
        .qr-url-hint strong {
          color: #3b82f6;
          display: block;
          margin-top: 0.5rem;
        }
      `}</style>
    </div>
  );
};

export default RegistrationForm;