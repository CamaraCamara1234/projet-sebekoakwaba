// components/RegistrationForm.jsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';

const RegistrationForm = ({ onSubmit, initialData, isUploading }) => {
  const [formData, setFormData] = useState({
    nom: initialData?.nom || '',
    prenom: initialData?.prenom || '',
    date_naissance: initialData?.date_naissance || '',
    lieu_naissance: initialData?.lieu_naissance || '',
    nationalite: initialData?.nationalite || '',
    numero_piece: initialData?.numero_piece || '',
    type_piece: initialData?.type_piece || 'passeport',
  });

  const [photo, setPhoto] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [errors, setErrors] = useState({});
  const [cameraError, setCameraError] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [countdown, setCountdown] = useState(null); // null = pas de compte à rebours
  const [isProcessing, setIsProcessing] = useState(false);
  const [qualityScore, setQualityScore] = useState(null); // 0-100
  const [qualityLabel, setQualityLabel] = useState('');
  const [lastCaptureInfo, setLastCaptureInfo] = useState(null);
  
  const webcamRef = useRef(null);
  const videoRef = useRef(null);
  const qualityIntervalRef = useRef(null);
  const countdownRef = useRef(null);

  // Configuration pour la meilleure qualité possible
  const getVideoConstraints = () => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Demander la plus haute résolution possible
    if (isMobile) {
      return {
        width: { ideal: 3840, min: 1920 },
        height: { ideal: 2160, min: 1080 },
        facingMode: { exact: "environment" },
        aspectRatio: { ideal: 4/3 }
      };
    }
    
    return {
      width: { ideal: 3840, min: 1920 },
      height: { ideal: 2160, min: 1080 },
      facingMode: { ideal: "environment" }
    };
  };

  // ============ UTILITAIRES DE TRAITEMENT D'IMAGE ============

  // Calculer la netteté d'une image via le Laplacien (variance)
  const calculateSharpness = (imageData) => {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    // Convertir en niveaux de gris et appliquer un filtre Laplacien
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const idxUp = ((y - 1) * w + x) * 4;
        const idxDown = ((y + 1) * w + x) * 4;
        const idxLeft = (y * w + (x - 1)) * 4;
        const idxRight = (y * w + (x + 1)) * 4;

        // Luminance
        const center = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
        const up = data[idxUp] * 0.299 + data[idxUp + 1] * 0.587 + data[idxUp + 2] * 0.114;
        const down = data[idxDown] * 0.299 + data[idxDown + 1] * 0.587 + data[idxDown + 2] * 0.114;
        const left = data[idxLeft] * 0.299 + data[idxLeft + 1] * 0.587 + data[idxLeft + 2] * 0.114;
        const right = data[idxRight] * 0.299 + data[idxRight + 1] * 0.587 + data[idxRight + 2] * 0.114;

        const laplacian = up + down + left + right - 4 * center;
        sum += laplacian;
        sumSq += laplacian * laplacian;
        count++;
      }
    }

    const mean = sum / count;
    const variance = (sumSq / count) - (mean * mean);
    return variance;
  };

  // Calculer la luminosité moyenne
  const calculateBrightness = (imageData) => {
    const data = imageData.data;
    let totalLuminance = 0;
    const pixelCount = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      totalLuminance += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }

    return totalLuminance / pixelCount; // 0-255
  };

  // Appliquer un masque de nettete (unsharp mask) - CORRIGE
  const applyUnsharpMask = (ctx, width, height, amount = 0.4, radius = 1) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const originalData = new Uint8ClampedArray(imageData.data);

    // 1. Canvas source avec l'image originale
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = width;
    srcCanvas.height = height;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.putImageData(imageData, 0, 0);

    // 2. Canvas destination avec le blur applique via drawImage
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = width;
    blurCanvas.height = height;
    const blurCtx = blurCanvas.getContext('2d');
    blurCtx.filter = `blur(${radius}px)`;
    blurCtx.drawImage(srcCanvas, 0, 0);  // Dessine srcCanvas (pas soi-meme !)
    const blurredData = blurCtx.getImageData(0, 0, width, height).data;

    // 3. Appliquer le masque: original + amount * (original - flou)
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = Math.min(255, Math.max(0, originalData[i]     + amount * (originalData[i]     - blurredData[i])));
      data[i + 1] = Math.min(255, Math.max(0, originalData[i + 1] + amount * (originalData[i + 1] - blurredData[i + 1])));
      data[i + 2] = Math.min(255, Math.max(0, originalData[i + 2] + amount * (originalData[i + 2] - blurredData[i + 2])));
    }

    ctx.putImageData(imageData, 0, 0);
  };

  // Ajuster le contraste adaptatif (CLAHE simplifié)
  const adjustContrast = (ctx, width, height, factor = 1.15) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Calculer la moyenne
    let avg = 0;
    for (let i = 0; i < data.length; i += 4) {
      avg += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    avg /= (data.length / 4);

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, avg + factor * (data[i] - avg)));
      data[i + 1] = Math.min(255, Math.max(0, avg + factor * (data[i + 1] - avg)));
      data[i + 2] = Math.min(255, Math.max(0, avg + factor * (data[i + 2] - avg)));
    }

    ctx.putImageData(imageData, 0, 0);
  };

  // Ajuster la balance des blancs automatiquement
  const autoWhiteBalance = (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let rSum = 0, gSum = 0, bSum = 0;
    const count = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
    }

    const rAvg = rSum / count;
    const gAvg = gSum / count;
    const bAvg = bSum / count;
    const grayAvg = (rAvg + gAvg + bAvg) / 3;

    const rScale = grayAvg / rAvg;
    const gScale = grayAvg / gAvg;
    const bScale = grayAvg / bAvg;

    // N'appliquer que si le déséquilibre est notable
    if (Math.abs(rScale - 1) > 0.05 || Math.abs(gScale - 1) > 0.05 || Math.abs(bScale - 1) > 0.05) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, data[i] * rScale));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * gScale));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * bScale));
      }
      ctx.putImageData(imageData, 0, 0);
    }
  };

  // Pipeline complet de post-traitement
  const enhanceImage = (canvas) => {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 1. Balance des blancs automatique (seul traitement conservé pour éviter la pixelisation)
    autoWhiteBalance(ctx, w, h);

    // Suppression de l'ajustement de contraste et du masque de netteté
    // qui causaient l'effet pixelisé

    return canvas;
  };

  // Capturer un frame brut depuis la webcam vers un canvas
  const captureRawFrame = () => {
    const video = webcamRef.current?.video;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  // Burst capture: prendre N frames et garder le plus net
  const burstCapture = async (frameCount = 5) => {
    const frames = [];

    for (let i = 0; i < frameCount; i++) {
      const canvas = captureRawFrame();
      if (canvas) {
        const ctx = canvas.getContext('2d');
        // Analyser sur une zone réduite (centre 50%) pour accélérer
        const cx = Math.floor(canvas.width * 0.25);
        const cy = Math.floor(canvas.height * 0.25);
        const cw = Math.floor(canvas.width * 0.5);
        const ch = Math.floor(canvas.height * 0.5);
        const centerData = ctx.getImageData(cx, cy, cw, ch);

        const sharpness = calculateSharpness(centerData);
        const brightness = calculateBrightness(centerData);
        frames.push({ canvas, sharpness, brightness });
      }
      // Petit délai entre les frames
      await new Promise(r => setTimeout(r, 80));
    }

    if (frames.length === 0) return null;

    // Trier par netteté et prendre le meilleur
    frames.sort((a, b) => b.sharpness - a.sharpness);
    console.log(`Burst capture: ${frames.length} frames, netteté=[${frames.map(f => f.sharpness.toFixed(1)).join(', ')}]`);
    return frames[0];
  };

  // Analyser la qualité globale d'un frame
  const analyzeQuality = (canvas) => {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const brightness = calculateBrightness(imageData);
    const sharpness = calculateSharpness(imageData);

    const warnings = [];
    let score = 100;

    // Vérifier la luminosité
    if (brightness < 60) {
      warnings.push('⚠️ Image trop sombre - essayez avec plus de lumière');
      score -= 30;
    } else if (brightness > 210) {
      warnings.push('⚠️ Image surexposée - réduisez la lumière directe');
      score -= 25;
    } else if (brightness < 90) {
      warnings.push('💡 Luminosité un peu faible');
      score -= 10;
    }

    // Vérifier la netteté
    if (sharpness < 50) {
      warnings.push('🔍 Image floue - stabilisez l\'appareil');
      score -= 30;
    } else if (sharpness < 150) {
      warnings.push('📷 Netteté moyenne');
      score -= 10;
    }

    // Vérifier la résolution
    if (canvas.width < 1280) {
      warnings.push('📐 Résolution faible');
      score -= 15;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      brightness: Math.round(brightness),
      sharpness: Math.round(sharpness),
      warnings,
      resolution: `${canvas.width}×${canvas.height}`
    };
  };

  // ============ INDICATEUR DE QUALITÉ EN TEMPS RÉEL ============
  useEffect(() => {
    if (showCamera && isCameraReady) {
      qualityIntervalRef.current = setInterval(() => {
        const canvas = captureRawFrame();
        if (canvas) {
          const ctx = canvas.getContext('2d');
          // Analyser une zone centrale réduite pour la performance
          const cx = Math.floor(canvas.width * 0.3);
          const cy = Math.floor(canvas.height * 0.3);
          const cw = Math.floor(canvas.width * 0.4);
          const ch = Math.floor(canvas.height * 0.4);
          const centerData = ctx.getImageData(cx, cy, cw, ch);

          const brightness = calculateBrightness(centerData);
          const sharpness = calculateSharpness(centerData);

          let score = 100;
          let label = '';

          if (brightness < 60) { score -= 35; label = 'Trop sombre'; }
          else if (brightness > 210) { score -= 30; label = 'Trop clair'; }
          else if (brightness < 90) { score -= 10; label = 'Luminosité faible'; }

          if (sharpness < 50) { score -= 35; label = label ? label + ' + Flou' : 'Flou'; }
          else if (sharpness < 150) { score -= 10; }

          if (!label && score >= 80) label = 'Bonne qualité';
          else if (!label) label = 'Qualité moyenne';

          setQualityScore(Math.max(0, Math.min(100, score)));
          setQualityLabel(label);
        }
      }, 500); // Toutes les 500ms
    }

    return () => {
      if (qualityIntervalRef.current) {
        clearInterval(qualityIntervalRef.current);
        qualityIntervalRef.current = null;
      }
    };
  }, [showCamera, isCameraReady]);

  const startCamera = () => {
    setCameraError('');
    setShowCamera(true);
    setIsCameraReady(false);
    setVideoDimensions({ width: 0, height: 0 });
    setQualityScore(null);
    setQualityLabel('');
    setCountdown(null);
    setLastCaptureInfo(null);
  };

  const stopCamera = () => {
    setShowCamera(false);
    setIsCameraReady(false);
    setVideoDimensions({ width: 0, height: 0 });
    setQualityScore(null);
    setQualityLabel('');
    setCountdown(null);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  // Attendre que la vidéo ait ses dimensions réelles
  const waitForVideoDimensions = useCallback(() => {
    return new Promise((resolve) => {
      if (!webcamRef.current || !webcamRef.current.video) {
        resolve(false);
        return;
      }
      
      const video = webcamRef.current.video;
      
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        resolve(true);
        return;
      }
      
      const onLoadedMetadata = () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        resolve(true);
      };
      
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      
      // Timeout après 3 secondes
      setTimeout(() => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        resolve(false);
      }, 3000);
    });
  }, []);

  // Lancer le compte à rebours puis capturer
  const startCapture = useCallback(() => {
    if (!isCameraReady || countdown !== null || isProcessing) return;

    let count = 3;
    setCountdown(count);

    countdownRef.current = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(countdownRef.current);
        setCountdown(null);
        performCapture();
      }
    }, 1000);
  }, [isCameraReady, countdown, isProcessing]);

  // Capture immédiate (sans countdown) - utile pour reprendre rapidement
  const capturePhotoImmediate = useCallback(async () => {
    if (!isCameraReady || isProcessing) return;
    performCapture();
  }, [isCameraReady, isProcessing]);

  const performCapture = useCallback(async () => {
    if (!webcamRef.current || isProcessing) return;

    setIsProcessing(true);
    setLastCaptureInfo(null);

    try {
      const hasDimensions = await waitForVideoDimensions();
      
      if (!hasDimensions) {
        setCameraError('Erreur: Impossible d\'obtenir les dimensions de la vidéo');
        setIsProcessing(false);
        return;
      }
      
      const video = webcamRef.current.video;
      if (!video || video.videoWidth === 0) {
        setCameraError('Erreur: Dimensions de la vidéo invalides');
        setIsProcessing(false);
        return;
      }

      console.log(`Burst capture en cours (résolution: ${video.videoWidth}x${video.videoHeight})...`);

      // ===== BURST CAPTURE: 5 frames, garder le plus net =====
      const best = await burstCapture(5);
      if (!best) {
        setCameraError('Erreur lors de la capture. Veuillez réessayer.');
        setIsProcessing(false);
        return;
      }

      console.log(`Meilleur frame sélectionné - Netteté: ${best.sharpness.toFixed(1)}, Luminosité: ${best.brightness.toFixed(1)}`);

      // ===== POST-TRAITEMENT =====
      const enhancedCanvas = enhanceImage(best.canvas);

      // ===== ANALYSE DE QUALITÉ =====
      const quality = analyzeQuality(enhancedCanvas);
      console.log(`Qualité: score=${quality.score}, résolution=${quality.resolution}`, quality.warnings);
      setLastCaptureInfo(quality);

      // ===== EXPORT EN JPEG HAUTE QUALITE =====
      const blob = await new Promise((resolve) => {
        enhancedCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.97);
      });
      const fileName = `document_passeport_${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(file);
      const dataUrl = enhancedCanvas.toDataURL('image/jpeg', 0.97);

      const capturedPhoto = {
        id: Date.now(),
        file: file,
        blob: blob,
        preview: previewUrl,
        dataUrl: dataUrl,
        dimensions: { width: enhancedCanvas.width, height: enhancedCanvas.height },
        quality: quality
      };

      // Révoquer l'ancien preview si existant
      if (photo) {
        URL.revokeObjectURL(photo.preview);
      }

      setPhoto(capturedPhoto);
      setErrors(prev => ({ ...prev, document: null }));

      // Fermer la caméra après capture
      stopCamera();

    } catch (error) {
      console.error('Erreur lors de la capture:', error);
      setCameraError('Erreur lors de la capture. Veuillez réessayer.');
    } finally {
      setIsProcessing(false);
    }
  }, [webcamRef, waitForVideoDimensions, isProcessing, photo]);

  const handleCameraReady = useCallback(() => {
    // Attendre que la vidéo ait ses dimensions avant de marquer comme prête
    const checkVideoReady = () => {
      if (webcamRef.current && webcamRef.current.video) {
        const video = webcamRef.current.video;
        
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          console.log(`Caméra prête - Résolution: ${video.videoWidth}x${video.videoHeight}`);
          setVideoDimensions({
            width: video.videoWidth,
            height: video.videoHeight
          });
          setIsCameraReady(true);
        } else {
          // Réessayer dans 100ms
          setTimeout(checkVideoReady, 100);
        }
      }
    };
    
    checkVideoReady();
  }, []);

  const handleCameraError = (error) => {
    console.error('Erreur caméra:', error);
    let errorMessage = 'Impossible d\'accéder à la caméra. ';
    
    if (error.name === 'NotAllowedError') {
      errorMessage += 'Veuillez autoriser l\'accès à la caméra.';
    } else if (error.name === 'NotFoundError') {
      errorMessage += 'Aucune caméra trouvée sur votre appareil.';
    } else if (error.name === 'NotReadableError') {
      errorMessage += 'La caméra est peut-être utilisée par une autre application.';
    } else if (error.name === 'OverconstrainedError') {
      errorMessage += 'La caméra ne supporte pas la résolution demandée. Utilisation de la résolution par défaut.';
      // Fallback à une résolution plus basse
      if (webcamRef.current) {
        webcamRef.current.videoConstraints = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: { ideal: "environment" }
        };
      }
    } else {
      errorMessage += 'Veuillez vérifier les permissions.';
    }
    
    setCameraError(errorMessage);
    setShowCamera(false);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!photo) {
      newErrors.document = 'Veuillez prendre une photo de votre passeport';
    }
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    onSubmit({ 
      formData, 
      files: [photo.file]
    });
  };

  return (
    <div className="unified-form-container">
      <div className="form-header">
        <h2>Vérification d'identité</h2>
        <p className="form-subtitle">
          Afin de garantir une extraction optimale, veuillez prendre une photo de votre passeport.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="unified-form">
        {!showCamera ? (
          <div className="pre-camera-screen">
            {photo ? (
              <div className="photo-review-section">
                <div className="photo-preview-wrapper wrapper-success">
                  <img src={photo.preview} alt="Passeport capturé" className="photo-preview-img" />
                  <div className="photo-success-overlay">
                    <span className="check-icon">✓</span>
                    Image prête
                  </div>
                </div>
                
                <div className="review-actions">
                  <button 
                    type="button"
                    onClick={startCamera}
                    className="btn btn-outline"
                  >
                    🔄 Reprendre la photo
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={isUploading || !photo}
                  >
                    {isUploading ? (
                      <><span className="spinner-small"></span> Traitement en cours...</>
                    ) : (
                      'Continuer l\'inscription ➔'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="instructions-section">
                <div className="icon-main">📸</div>
                <h3 className="instructions-title">Préparer votre passeport</h3>
                
                <div className="guidelines-list">
                  <div className="guideline-item">
                    <div className="guideline-icon">💡</div>
                    <div className="guideline-text">Placez-vous dans un <strong>endroit bien éclairé</strong>.</div>
                  </div>
                  <div className="guideline-item">
                    <div className="guideline-icon">🔍</div>
                    <div className="guideline-text">Vérifiez que toutes les <strong>informations sont lisibles</strong>.</div>
                  </div>
                  <div className="guideline-item">
                    <div className="guideline-icon">✋</div>
                    <div className="guideline-text">Gardez votre téléphone <strong>parfaitement stable</strong>.</div>
                  </div>
                  <div className="guideline-item">
                    <div className="guideline-icon">🚫</div>
                    <div className="guideline-text">Évitez les <strong>reflets de flash</strong> et les ombres.</div>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={startCamera}
                  className="btn btn-camera-start"
                >
                  Ouvrir la caméra
                </button>
              </div>
            )}
            
            {errors.document && (
              <div className="error-banner">
                ⚠️ {errors.document}
              </div>
            )}
          </div>
        ) : (
          <div className="camera-fullscreen-container">
            {/* Header de la caméra avec annulation et qualité */}
            <div className="camera-top-bar">
              <button 
                type="button" 
                onClick={stopCamera} 
                className="btn-close-camera"
                disabled={isProcessing}
              >
                ✕
              </button>
              
              {isCameraReady && qualityScore !== null && !isProcessing && (
                <div className={`quality-badge-live ${qualityScore >= 70 ? 'bg-good' : qualityScore >= 40 ? 'bg-medium' : 'bg-poor'}`}>
                  {qualityLabel}
                </div>
              )}

              <div className="spacer-right"></div>
            </div>

            {/* Vue de la caméra */}
            <div className="camera-viewport">
              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                screenshotQuality={1}
                videoConstraints={getVideoConstraints()}
                onUserMedia={handleCameraReady}
                onUserMediaError={handleCameraError}
                className="camera-video"
              />
              
              {/* Guides visuels */}
              <div className="camera-guides overlay">
                <div className="document-frame">
                  <div className="frame-corner tl"></div>
                  <div className="frame-corner tr"></div>
                  <div className="frame-corner bl"></div>
                  <div className="frame-corner br"></div>
                  <div className="frame-label">Cadrez la page avec photo de votre passeport ici</div>
                </div>
              </div>

              {/* Loader initialisation */}
              {!isCameraReady && (
                <div className="camera-loading overlay bg-dark">
                  <div className="spinner"></div>
                  <p>Initialisation de la caméra...</p>
                </div>
              )}

              {/* Overlay traitement multicadre */}
              {isProcessing && (
                <div className="processing-overlay overlay bg-dark">
                  <div className="spinner pulse"></div>
                  <p className="process-text">Capture HD en cours... Ne bougez pas.</p>
                </div>
              )}

              {/* Messages d'erreur */}
              {cameraError && (
                <div className="camera-error overlay bg-dark">
                  <div className="error-box">
                    <p>⚠️ {cameraError}</p>
                    <button type="button" onClick={startCamera} className="btn btn-retry">
                      Réessayer
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Contrôles du bas */}
            <div className="camera-bottom-controls">
               <div className="capture-instruction">
                 {isCameraReady && !isProcessing ? "Appuyez pour capturer (stabilisation automatique)" : ""}
               </div>
               
               <button 
                type="button"
                onClick={capturePhotoImmediate}
                className="btn-capture-shutter"
                disabled={!isCameraReady || isProcessing}
                aria-label="Prendre la photo"
              >
                <div className="shutter-inner"></div>
              </button>
            </div>
          </div>
        )}
      </form>

      <style jsx="true">{`
        .unified-form-container {
          max-width: 700px;
          margin: 2rem auto;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.08);
          overflow: hidden;
          font-family: 'Inter', -apple-system, sans-serif;
        }

        .form-header {
          background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%);
          color: white;
          padding: 2.5rem 2rem;
          text-align: center;
        }

        .form-header h2 {
          margin: 0 0 0.75rem;
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .form-subtitle {
          margin: 0;
          opacity: 0.85;
          font-size: 1.05rem;
          line-height: 1.5;
        }

        /* --- PRE-CAMERA SCREEN --- */
        .pre-camera-screen {
          padding: 3rem 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .instructions-section {
          max-width: 480px;
          width: 100%;
          text-align: center;
        }

        .icon-main {
          font-size: 4rem;
          margin-bottom: 1rem;
          animation: bounce 2s infinite ease-in-out;
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .instructions-title {
          font-size: 1.5rem;
          color: #1e293b;
          margin-bottom: 2rem;
          font-weight: 600;
        }

        .guidelines-list {
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
          margin-bottom: 3rem;
          text-align: left;
          background: #f8fafc;
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }

        .guideline-item {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .guideline-icon {
          font-size: 1.25rem;
          background: white;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          flex-shrink: 0;
        }

        .guideline-text {
          color: #475569;
          font-size: 0.95rem;
          line-height: 1.5;
          padding-top: 5px;
        }

        .guideline-text strong {
          color: #0f172a;
        }

        .btn-camera-start {
          background: linear-gradient(to right, #3b82f6, #2563eb);
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 50px;
          font-size: 1.1rem;
          font-weight: 600;
          width: 100%;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
        }

        .btn-camera-start:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
        }

        /* --- PHOTO REVIEW --- */
        .photo-review-section {
          width: 100%;
          max-width: 500px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
        }

        .photo-preview-wrapper {
          position: relative;
          width: 100%;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        }

        .wrapper-success {
          border: 3px solid #10b981;
        }

        .photo-preview-img {
          width: 100%;
          max-height: 300px;
          object-fit: cover;
          display: block;
        }

        .photo-success-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(16, 185, 129, 0.9), rgba(16, 185, 129, 0));
          color: white;
          padding: 1.5rem 1rem 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .check-icon {
          background: white;
          color: #10b981;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
        }

        .review-actions {
          display: flex;
          gap: 1rem;
          width: 100%;
        }

        .btn {
          padding: 0.875rem 1.25rem;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .btn-outline {
          background: transparent;
          border: 2px solid #cbd5e1;
          color: #475569;
        }

        .btn-outline:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }

        .btn-primary {
          background: #10b981;
          border: none;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #059669;
        }

        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        /* --- IMMERSIVE CAMERA LAYOUT --- */
        .camera-fullscreen-container {
          position: relative;
          width: 100%;
          height: 600px;
          background: #000;
          display: flex;
          flex-direction: column;
        }

        .camera-top-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 20;
          background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
        }

        .btn-close-camera {
          background: rgba(255,255,255,0.2);
          color: white;
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          font-size: 1.2rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }

        .btn-close-camera:hover {
          background: rgba(255,255,255,0.3);
        }

        .quality-badge-live {
          padding: 0.4rem 1rem;
          border-radius: 20px;
          color: white;
          font-weight: 600;
          font-size: 0.85rem;
          backdrop-filter: blur(4px);
        }

        .bg-good { background: rgba(16, 185, 129, 0.8); }
        .bg-medium { background: rgba(245, 158, 11, 0.8); }
        .bg-poor { background: rgba(239, 68, 68, 0.8); }

        .spacer-right { width: 40px; } /* Pour centrer le badge */

        .camera-viewport {
          flex: 1;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .camera-video {
          width: 100%;
          height: 100%;
          object-fit: cover !important;
        }

        .overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          z-index: 10;
        }

        .bg-dark {
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(4px);
          color: white;
        }

        .document-frame {
          width: 80%;
          max-width: 450px;
          aspect-ratio: 3/4;
          position: relative;
        }

        .frame-corner {
          position: absolute;
          width: 40px;
          height: 40px;
          border: 4px solid #3b82f6;
          border-radius: 4px;
        }

        .tl { top: 0; left: 0; border-right: none; border-bottom: none; }
        .tr { top: 0; right: 0; border-left: none; border-bottom: none; }
        .bl { bottom: 0; left: 0; border-right: none; border-top: none; }
        .br { bottom: 0; right: 0; border-left: none; border-top: none; }

        .frame-label {
          position: absolute;
          bottom: -40px;
          width: 100%;
          text-align: center;
          color: white;
          font-size: 0.9rem;
          font-weight: 500;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        }

        .camera-bottom-controls {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
          z-index: 20;
        }

        .capture-instruction {
          color: rgba(255,255,255,0.8);
          font-size: 0.85rem;
          margin-bottom: 1rem;
          min-height: 1.2em;
        }

        .btn-capture-shutter {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          border: 4px solid rgba(255,255,255,0.8);
          background: transparent;
          padding: 4px;
          cursor: pointer;
          transition: transform 0.1s ease;
        }

        .btn-capture-shutter:hover:not(:disabled) {
          border-color: #fff;
        }

        .btn-capture-shutter:active:not(:disabled) {
          transform: scale(0.92);
        }

        .btn-capture-shutter:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .shutter-inner {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: white;
          transition: background 0.2s;
        }

        .btn-capture-shutter:disabled .shutter-inner {
          background: #ccc;
        }

        /* --- LOADERS --- */
        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid rgba(255,255,255,0.2);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .pulse {
          animation: spin 1s linear infinite, pulse 2s ease-in-out infinite;
        }

        .process-text {
          font-size: 1.1rem;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }

        .error-banner {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #fef2f2;
          color: #ef4444;
          border-radius: 8px;
          border: 1px solid #fecaca;
          width: 100%;
          max-width: 480px;
        }

        .error-box {
          background: #1e293b;
          padding: 2rem;
          border-radius: 12px;
          text-align: center;
          border: 1px solid #334155;
        }

        .btn-retry {
          margin-top: 1rem;
          background: #3b82f6;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
        }

        @media (max-width: 768px) {
          .unified-form-container {
            margin: 0;
            border-radius: 0;
            min-height: 100vh;
          }
          
          .camera-fullscreen-container {
            height: calc(100vh - 120px); /* Ajuster selon le header */
          }
          
          .form-header {
            padding: 1.5rem 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default RegistrationForm;