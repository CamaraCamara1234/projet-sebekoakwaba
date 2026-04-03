// components/UnifiedRegistrationForm.jsx
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
    type_piece: initialData?.type_piece || 'cni',
  });

  const [photos, setPhotos] = useState([]);
  const [currentSide, setCurrentSide] = useState('recto');
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

  // Appliquer un masque de netteté (unsharp mask)
  const applyUnsharpMask = (ctx, width, height, amount = 0.5, radius = 1) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Créer une copie floue
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);
    tempCtx.filter = `blur(${radius}px)`;
    tempCtx.drawImage(tempCanvas, 0, 0);
    const blurredData = tempCtx.getImageData(0, 0, width, height).data;

    // Appliquer le masque de netteté: original + amount * (original - flou)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] + amount * (data[i] - blurredData[i])));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount * (data[i + 1] - blurredData[i + 1])));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount * (data[i + 2] - blurredData[i + 2])));
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

    // 1. Balance des blancs automatique
    autoWhiteBalance(ctx, w, h);

    // 2. Ajustement du contraste (léger)
    adjustContrast(ctx, w, h, 1.12);

    // 3. Masque de netteté
    applyUnsharpMask(ctx, w, h, 0.4, 1);

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

  // Convertir dataURL en Blob avec haute qualité
  const dataURLToBlob = (dataURL) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new Blob([u8arr], { type: mime });
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

      // ===== EXPORT EN JPEG HAUTE QUALITÉ =====
      const dataUrl = enhancedCanvas.toDataURL('image/jpeg', 0.97);
      const blob = dataURLToBlob(dataUrl);
      const fileName = `document_${currentSide}_${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(file);

      const photo = {
        id: Date.now(),
        side: currentSide,
        file: file,
        blob: blob,
        preview: previewUrl,
        dataUrl: dataUrl,
        dimensions: { width: enhancedCanvas.width, height: enhancedCanvas.height },
        quality: quality
      };

      setPhotos(prev => {
        const existingIndex = prev.findIndex(p => p.side === currentSide);
        if (existingIndex >= 0) {
          URL.revokeObjectURL(prev[existingIndex].preview);
          const newPhotos = [...prev];
          newPhotos[existingIndex] = photo;
          return newPhotos;
        }
        return [...prev, photo];
      });

      if (currentSide === 'recto') {
        setCurrentSide('verso');
        setErrors(prev => ({ ...prev, document: null }));
      } else {
        stopCamera();
      }
    } catch (error) {
      console.error('Erreur lors de la capture:', error);
      setCameraError('Erreur lors de la capture. Veuillez réessayer.');
    } finally {
      setIsProcessing(false);
    }
  }, [webcamRef, currentSide, waitForVideoDimensions, isProcessing]);

  const retakePhoto = () => {
    const photoToRemove = photos.find(p => p.side === currentSide);
    if (photoToRemove) {
      URL.revokeObjectURL(photoToRemove.preview);
      setPhotos(prev => prev.filter(p => p.side !== currentSide));
    }
  };

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
    if (!photos.find(p => p.side === 'recto')) {
      newErrors.document = 'Veuillez prendre une photo du recto de votre pièce d\'identité';
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
    
    const files = photos.map(photo => photo.file);
    
    onSubmit({ 
      formData, 
      files 
    });
  };

  return (
    <div className="unified-form-container">
      <div className="form-header">
        <h2>Vérification d'identité</h2>
        <p className="form-subtitle">
          Prenez une photo de votre pièce d'identité pour démarrer l'extraction des données.<br/>
          CNI (recto et verso), Titre séjour (recto et verso) ou passeport
        </p>
        <div className="quality-badge">
          📸 Haute qualité recommandée
        </div>
      </div>

      <form onSubmit={handleSubmit} className="unified-form">
        <div className="form-section document-section">
          <h3 className="section-title">
            <span className="section-icon">📷</span>
            Photo de la pièce d'identité
          </h3>
          
          {!showCamera ? (
            <div className="camera-start">
              <div className="photo-status">
                {photos.length > 0 && (
                  <div className="photo-previews">
                    {photos.map((photo) => (
                      <div key={photo.id} className="photo-preview">
                        <img src={photo.preview} alt={`${photo.side}`} />
                        <span className="photo-label">
                          {photo.side === 'recto' ? 'Recto ✓' : 'Verso ✓'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(photo.preview);
                            setPhotos(prev => prev.filter(p => p.id !== photo.id));
                            if (photo.side === 'recto') {
                              setCurrentSide('recto');
                            }
                          }}
                          className="remove-photo"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="camera-prompt">
                  <div className="camera-icon">📷</div>
                  <p className="camera-title">
                    {photos.length === 0 
                      ? 'Prenez une photo du recto de votre document' 
                      : photos.length === 1 
                        ? 'Prenez une photo du verso' 
                        : 'Photos complètes'}
                  </p>
                  <p className="camera-subtitle">
                    • Placez votre document dans un endroit très bien éclairé<br/>
                    • Assurez-vous que toutes les informations sont nettes et lisibles<br/>
                    • Maintenez l'appareil parfaitement stable<br/>
                    • Évitez les reflets et les ombres
                  </p>
                  {photos.length < 2 && (
                    <button 
                      type="button"
                      onClick={startCamera}
                      className="btn btn-camera"
                    >
                      📸 {photos.length === 0 ? 'Prendre le recto' : 'Prendre le verso'}
                    </button>
                  )}
                </div>
              </div>
              {errors.document && (
                <span className="error-message">{errors.document}</span>
              )}
            </div>
          ) : (
            <div className="camera-container">
              <div className="camera-view">
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  screenshotQuality={1}
                  videoConstraints={getVideoConstraints()}
                  onUserMedia={handleCameraReady}
                  onUserMediaError={handleCameraError}
                  className="camera-video"
                  style={{
                    width: '100%',
                    height: 'auto',
                    objectFit: 'contain'
                  }}
                />
                {!isCameraReady && (
                  <div className="camera-loading">
                    <div className="loading-spinner"></div>
                    <p>Initialisation de la caméra haute résolution...</p>
                    {videoDimensions.width === 0 && (
                      <p className="loading-subtext">Chargement des métadonnées vidéo...</p>
                    )}
                  </div>
                )}
                <div className="camera-overlay">
                  <div className="guide-frame-wrapper">
                    <div className="guide-frame">
                      <div className="guide-text">
                        {currentSide === 'recto' ? 'Recto du document' : 'Verso du document'}
                      </div>
                      <div className="guide-corners">
                        <div className="corner top-left"></div>
                        <div className="corner top-right"></div>
                        <div className="corner bottom-left"></div>
                        <div className="corner bottom-right"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Compte à rebours */}
                {countdown !== null && (
                  <div className="countdown-overlay">
                    <div className="countdown-number">{countdown}</div>
                    <div className="countdown-text">Stabilisez votre appareil...</div>
                  </div>
                )}

                {/* Traitement en cours */}
                {isProcessing && (
                  <div className="processing-overlay">
                    <div className="processing-spinner"></div>
                    <div className="processing-text">Analyse et optimisation...</div>
                    <div className="processing-subtext">Sélection du meilleur cadrage</div>
                  </div>
                )}

                {/* Indicateur de qualité en temps réel */}
                {isCameraReady && qualityScore !== null && countdown === null && !isProcessing && (
                  <div className="quality-indicator">
                    <div className={`quality-bar-container`}>
                      <div 
                        className={`quality-bar ${qualityScore >= 70 ? 'quality-good' : qualityScore >= 40 ? 'quality-medium' : 'quality-poor'}`}
                        style={{ width: `${qualityScore}%` }}
                      />
                    </div>
                    <span className={`quality-text-live ${qualityScore >= 70 ? 'text-good' : qualityScore >= 40 ? 'text-medium' : 'text-poor'}`}>
                      {qualityLabel}
                    </span>
                  </div>
                )}

                {/* Info dernière capture */}
                {lastCaptureInfo && lastCaptureInfo.warnings.length > 0 && (
                  <div className="capture-warnings">
                    {lastCaptureInfo.warnings.map((w, i) => (
                      <div key={i} className="capture-warning-item">{w}</div>
                    ))}
                    <div className="capture-score">
                      Score: {lastCaptureInfo.score}/100 • {lastCaptureInfo.resolution}
                    </div>
                  </div>
                )}

                <div className="focus-message">
                  {countdown !== null ? `Capture dans ${countdown}s...` : 'Maintenez l\'appareil stable • Compte à rebours 3s'}
                </div>
              </div>
              
              <div className="camera-controls">
                <button 
                  type="button"
                  onClick={stopCamera}
                  className="btn-camera-action btn-cancel-camera"
                  title="Annuler"
                  disabled={countdown !== null || isProcessing}
                >
                  ✕
                </button>
                
                <div className="capture-main">
                  <button 
                    type="button"
                    onClick={startCapture}
                    className="btn-capture-round"
                    disabled={!isCameraReady || countdown !== null || isProcessing}
                  >
                    <div className={`capture-inner ${countdown !== null ? 'capture-countdown-active' : ''}`}></div>
                  </button>
                  <span className="capture-text">
                    {!isCameraReady ? 'Initialisation...' : isProcessing ? 'Traitement...' : countdown !== null ? `${countdown}...` : 'Capturer HD+'}
                  </span>
                </div>

                <button 
                  type="button"
                  onClick={capturePhotoImmediate}
                  className="btn-camera-action btn-retake-camera"
                  title="Capture rapide (sans compte à rebours)"
                  disabled={!isCameraReady || countdown !== null || isProcessing}
                >
                  ⚡
                </button>
              </div>
              
              {cameraError && (
                <div className="camera-error">
                  <span>⚠️ {cameraError}</span>
                  <button 
                    type="button"
                    onClick={startCamera}
                    className="btn-retry"
                  >
                    Réessayer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button 
            type="submit" 
            className="btn btn-primary btn-large"
            disabled={isUploading || photos.length === 0}
          >
            {isUploading ? (
              <>
                <span className="spinner-small"></span>
                Traitement en cours...
              </>
            ) : (
              'Continuer vers la vérification'
            )}
          </button>
        </div>
      </form>

      <style jsx="true">{`
        .unified-form-container {
          max-width: 900px;
          margin: 2rem auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .form-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 2rem;
          text-align: center;
        }

        .form-header h2 {
          margin: 0 0 0.5rem;
          font-size: 2rem;
        }

        .form-subtitle {
          margin: 0;
          opacity: 0.9;
          font-size: 0.95rem;
        }

        .quality-badge {
          display: inline-block;
          margin-top: 1rem;
          padding: 0.25rem 1rem;
          background: rgba(255,255,255,0.2);
          border-radius: 20px;
          font-size: 0.85rem;
          backdrop-filter: blur(5px);
        }

        .unified-form {
          padding: 2rem;
        }

        .form-section {
          margin-bottom: 2.5rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid #e0e0e0;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 1rem;
          color: #333;
          font-size: 1.25rem;
        }

        .section-icon {
          font-size: 1.5rem;
        }

        .camera-start {
          background: #fafafa;
          border-radius: 8px;
          padding: 1.5rem;
        }

        .photo-status {
          display: flex;
          gap: 2rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .photo-previews {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .photo-preview {
          position: relative;
          width: 150px;
          height: 150px;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid #4CAF50;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .photo-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .photo-label {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(76, 175, 80, 0.9);
          color: white;
          padding: 0.25rem;
          font-size: 0.85rem;
          text-align: center;
          font-weight: bold;
        }

        .remove-photo {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(244, 67, 54, 0.9);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          transition: all 0.3s ease;
          z-index: 1;
        }

        .remove-photo:hover {
          background: #f44336;
          transform: scale(1.1);
        }

        .camera-prompt {
          flex: 1;
          text-align: center;
          padding: 2rem;
        }

        .camera-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .camera-title {
          font-size: 1.1rem;
          font-weight: 500;
          margin: 0 0 0.5rem;
          color: #333;
        }

        .camera-subtitle {
          margin: 0 0 1rem;
          color: #666;
          font-size: 0.9rem;
          line-height: 1.6;
        }

        .camera-container {
          position: relative;
          background: #000;
          border-radius: 12px;
          overflow: hidden;
        }

        .camera-view {
          position: relative;
          width: 100%;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 500px;
        }

        .camera-video {
          width: 100%;
          height: auto;
          display: block;
        }

        .camera-loading {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.8);
          color: white;
          z-index: 1;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .loading-subtext {
          font-size: 0.8rem;
          margin-top: 0.5rem;
          opacity: 0.8;
        }

        .camera-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 2;
        }

        .guide-frame-wrapper {
          width: 85%;
          max-width: 500px;
          aspect-ratio: 3/4;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .guide-frame {
          position: relative;
          width: 100%;
          height: 100%;
          border: 2px solid rgba(102, 126, 234, 0.9);
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.2);
        }

        .guide-text {
          position: absolute;
          bottom: -35px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(102, 126, 234, 0.95);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 25px;
          font-size: 0.9rem;
          font-weight: 500;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          pointer-events: none;
        }

        .focus-message {
          position: absolute;
          bottom: 80px;
          left: 0;
          right: 0;
          text-align: center;
          color: white;
          font-size: 0.8rem;
          background: rgba(0,0,0,0.6);
          padding: 0.5rem;
          z-index: 3;
          pointer-events: none;
        }

        /* === COUNTDOWN === */
        .countdown-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.55);
          z-index: 15;
          pointer-events: none;
        }

        .countdown-number {
          font-size: 6rem;
          font-weight: 800;
          color: white;
          text-shadow: 0 0 40px rgba(102, 126, 234, 0.8), 0 0 80px rgba(102, 126, 234, 0.4);
          animation: countdownPulse 1s ease-in-out infinite;
        }

        .countdown-text {
          color: rgba(255, 255, 255, 0.9);
          font-size: 1rem;
          margin-top: 0.5rem;
          font-weight: 500;
        }

        @keyframes countdownPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }

        /* === PROCESSING OVERLAY === */
        .processing-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
          z-index: 15;
          pointer-events: none;
        }

        .processing-spinner {
          width: 56px;
          height: 56px;
          border: 4px solid rgba(102, 126, 234, 0.3);
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 1rem;
        }

        .processing-text {
          color: white;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .processing-subtext {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.85rem;
          margin-top: 0.3rem;
        }

        /* === QUALITY INDICATOR === */
        .quality-indicator {
          position: absolute;
          top: 12px;
          left: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 12;
          pointer-events: none;
          padding: 8px 14px;
          background: rgba(0, 0, 0, 0.55);
          border-radius: 25px;
          backdrop-filter: blur(6px);
        }

        .quality-bar-container {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 3px;
          overflow: hidden;
        }

        .quality-bar {
          height: 100%;
          border-radius: 3px;
          transition: width 0.5s ease, background 0.5s ease;
        }

        .quality-good { background: linear-gradient(90deg, #43e97b, #38f9d7); }
        .quality-medium { background: linear-gradient(90deg, #f7971e, #ffd200); }
        .quality-poor { background: linear-gradient(90deg, #f44336, #ff7043); }

        .quality-text-live {
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .text-good { color: #43e97b; }
        .text-medium { color: #ffd200; }
        .text-poor { color: #ff7043; }

        /* === CAPTURE WARNINGS === */
        .capture-warnings {
          position: absolute;
          top: 55px;
          left: 12px;
          right: 12px;
          z-index: 12;
          background: rgba(0, 0, 0, 0.7);
          border-radius: 10px;
          padding: 10px 14px;
          backdrop-filter: blur(6px);
          pointer-events: none;
        }

        .capture-warning-item {
          color: #ffd200;
          font-size: 0.8rem;
          padding: 2px 0;
        }

        .capture-score {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.7rem;
          margin-top: 4px;
          border-top: 1px solid rgba(255,255,255,0.15);
          padding-top: 4px;
        }

        .capture-countdown-active {
          background: rgba(102, 126, 234, 0.5) !important;
          animation: countdownPulse 1s ease-in-out infinite;
        }

        .guide-corners {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        }

        .corner {
          position: absolute;
          width: 25px;
          height: 25px;
          border: 3px solid #667eea;
        }

        .corner.top-left {
          top: -2px;
          left: -2px;
          border-right: none;
          border-bottom: none;
        }

        .corner.top-right {
          top: -2px;
          right: -2px;
          border-left: none;
          border-bottom: none;
        }

        .corner.bottom-left {
          bottom: -2px;
          left: -2px;
          border-right: none;
          border-top: none;
        }

        .corner.bottom-right {
          bottom: -2px;
          right: -2px;
          border-left: none;
          border-top: none;
        }

        .camera-controls {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem 2rem;
          background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%);
          z-index: 10;
        }

        .capture-main {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-capture-round {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          border: 4px solid white;
          background: transparent;
          padding: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-capture-round:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .btn-capture-round:active:not(:disabled) {
          transform: scale(0.95);
        }

        .btn-capture-round:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          border-color: rgba(255,255,255,0.3);
        }

        .capture-inner {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: white;
          transition: all 0.2s ease;
        }

        .btn-capture-round:disabled .capture-inner {
          background: rgba(255,255,255,0.3);
        }

        .capture-text {
          color: white;
          font-size: 0.8rem;
          font-weight: 500;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }

        .btn-camera-action {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          font-size: 1.2rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          backdrop-filter: blur(4px);
        }

        .btn-camera-action:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.1);
        }

        .btn-camera-action:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-camera {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 1.1rem;
          padding: 0.75rem 2rem;
        }

        .error-message {
          display: block;
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: #f44336;
          text-align: center;
        }

        .camera-error {
          background: #ffebee;
          color: #c62828;
          padding: 1rem;
          text-align: center;
          margin: 1rem;
          border-radius: 8px;
        }

        .btn-retry {
          margin-left: 1rem;
          padding: 0.25rem 0.75rem;
          background: #c62828;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .form-actions {
          display: flex;
          justify-content: center;
          margin-top: 2rem;
        }

        .spinner-small {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 0.5rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .form-header {
            padding: 1.5rem;
          }

          .form-header h2 {
            font-size: 1.5rem;
          }

          .unified-form {
            padding: 1rem;
          }

          .photo-status {
            flex-direction: column;
            align-items: center;
          }

          .photo-previews {
            justify-content: center;
          }

          .camera-view {
            min-height: 400px;
          }

          .guide-frame-wrapper {
            width: 90%;
          }

          .guide-text {
            font-size: 0.75rem;
            bottom: -30px;
            padding: 0.35rem 0.75rem;
            white-space: nowrap;
          }

          .focus-message {
            bottom: 70px;
            font-size: 0.7rem;
          }

          .corner {
            width: 18px;
            height: 18px;
          }

          .camera-controls {
            padding: 1rem;
          }

          .btn-capture-round {
            width: 60px;
            height: 60px;
          }

          .btn-camera-action {
            width: 40px;
            height: 40px;
          }

          .camera-prompt {
            padding: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default RegistrationForm;