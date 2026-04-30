// components/FaceVerification.jsx
import React, { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import { advancedVerifyFaces } from "../services/api";
import LivenessDetection from "./LivenessDetection";

const FaceVerification = ({
  referencePhoto,
  extractionKey,
  onVerificationComplete,
  useAdvanced = true,
  photoPath,
}) => {
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [showFinalMessage, setShowFinalMessage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // livenessStep: null | 'running' | 'done' | 'failed'
  const [livenessStep, setLivenessStep] = useState(null);

  const webcamRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Détecter le mobile et la taille du conteneur
  useEffect(() => {
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    checkMobile();

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({
          width: rect.width,
          height: rect.width * 0.75, // Ratio 4:3 pour la caméra
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const photoUrl = referencePhoto;

  const getVideoConstraints = () => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobileDevice) {
      return {
        width: { ideal: 1920, min: 720, max: 3840 },
        height: { ideal: 1440, min: 960, max: 2160 },
        facingMode: "user",
        aspectRatio: 0.75
      };
    }

    return {
      width: { ideal: 1920, min: 1280, max: 3840 },
      height: { ideal: 1080, min: 720, max: 2160 },
      facingMode: "user",
    };
  };

  const dataURLToFile = (dataURL, filename) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new File([u8arr], filename, { type: mime });
  };

  // ============ UTILITAIRES DE QUALITÉ D'IMAGE ============
  const calculateSharpness = (imageData) => {
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    let sum = 0, sumSq = 0, count = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const idxUp = ((y - 1) * w + x) * 4;
        const idxDown = ((y + 1) * w + x) * 4;
        const idxLeft = (y * w + (x - 1)) * 4;
        const idxRight = (y * w + (x + 1)) * 4;
        const center = data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;
        const up = data[idxUp] * 0.299 + data[idxUp+1] * 0.587 + data[idxUp+2] * 0.114;
        const down = data[idxDown] * 0.299 + data[idxDown+1] * 0.587 + data[idxDown+2] * 0.114;
        const left = data[idxLeft] * 0.299 + data[idxLeft+1] * 0.587 + data[idxLeft+2] * 0.114;
        const right = data[idxRight] * 0.299 + data[idxRight+1] * 0.587 + data[idxRight+2] * 0.114;
        const laplacian = up + down + left + right - 4 * center;
        sum += laplacian;
        sumSq += laplacian * laplacian;
        count++;
      }
    }
    const mean = sum / count;
    return Math.max(0, (sumSq / count) - (mean * mean));
  };

  const calculateBrightness = (imageData) => {
    const data = imageData.data;
    let totalLuminance = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalLuminance += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    return totalLuminance / (data.length / 4);
  };

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
    const rAvg = rSum / count, gAvg = gSum / count, bAvg = bSum / count;
    const grayAvg = (rAvg + gAvg + bAvg) / 3;
    const rScale = grayAvg / rAvg, gScale = grayAvg / gAvg, bScale = grayAvg / bAvg;
    if (Math.abs(rScale - 1) > 0.05 || Math.abs(gScale - 1) > 0.05 || Math.abs(bScale - 1) > 0.05) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, data[i] * rScale));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * gScale));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * bScale));
      }
      ctx.putImageData(imageData, 0, 0);
    }
  };

  const captureRawFrame = () => {
    const video = webcamRef.current?.video;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Check if the video is mirrored (like the webcam component)
    if (webcamRef.current.props.mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const burstCapture = async (frameCount = 3) => {
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      const canvas = captureRawFrame();
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const cx = Math.floor(canvas.width * 0.25);
        const cy = Math.floor(canvas.height * 0.25);
        const cw = Math.floor(canvas.width * 0.5);
        const ch = Math.floor(canvas.height * 0.5);
        const centerData = ctx.getImageData(cx, cy, cw, ch);
        frames.push({ 
          canvas, 
          sharpness: calculateSharpness(centerData), 
          brightness: calculateBrightness(centerData) 
        });
      }
      await new Promise(r => setTimeout(r, 100)); // petite pause
    }
    if (frames.length === 0) return null;
    return frames.sort((a, b) => b.sharpness - a.sharpness)[0];
  };

  const captureImage = async () => {
    if (!webcamRef.current) {
      setError("Caméra non disponible");
      return;
    }

    setIsLoading(true);

    try {
      const bestFrame = await burstCapture(4); // Prend 4 images et garde la + nette

      if (bestFrame) {
        console.log(`Capture FaceVerification - Netteté: ${bestFrame.sharpness.toFixed(1)}, Luminosité: ${bestFrame.brightness.toFixed(1)}`);
        
        const ctx = bestFrame.canvas.getContext('2d');
        autoWhiteBalance(ctx, bestFrame.canvas.width, bestFrame.canvas.height);
        
        const dataUrl = bestFrame.canvas.toDataURL('image/jpeg', 0.95);
        setCapturedImage(dataUrl);
        setIsCameraActive(false);
      } else {
        // Fallback si la capture brute échoue
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          setCapturedImage(imageSrc);
          setIsCameraActive(false);
        } else {
          setError("Erreur lors de la capture");
        }
      }
    } catch (err) {
      console.error(err);
      setError("Erreur de capture optimisée");
    } finally {
      setIsLoading(false);
    }
  };

  const startCamera = () => {
    // Lance la liveness detection au lieu d'ouvrir directement la webcam
    setLivenessStep('running');
    setIsCameraActive(false);
    setError(null);
    setCapturedImage(null);
    setResult(null);
    setShowFinalMessage(false);
  };

  const handleLivenessSuccess = (photoDataUrl) => {
    // La liveness est réussie : on reçoit la photo capturée automatiquement
    setLivenessStep('done');
    setCapturedImage(photoDataUrl);
    setError(null);
  };

  const handleLivenessFailure = (reason) => {
    setLivenessStep('failed');
    setError(
      reason === 'timeout'
        ? 'Temps écoulé durant la vérification de vivacité. Veuillez réessayer.'
        : "Échec de la détection de vivacité. Veuillez réessayer."
    );
  };

  const stopCamera = () => {
    setIsCameraActive(false);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedImage(event.target.result);
      setResult(null);
      setError(null);
      setShowFinalMessage(false);
    };
    reader.readAsDataURL(file);
  };

  const handleVerification = async () => {
    if (!capturedImage) {
      setError("Veuillez capturer ou uploader une image");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const file = dataURLToFile(capturedImage, "capture_face.jpg");

      const verificationFunction = advancedVerifyFaces;
      const verificationResult = await verificationFunction(file);

      if (verificationResult.dominant_emotion) {
        console.log("Émotion détectée:", verificationResult.dominant_emotion);
      }

      if (!verificationResult.verified) {
        const newAttemptCount = attemptCount + 1;
        setAttemptCount(newAttemptCount);

        if (newAttemptCount >= 2) {
          setShowFinalMessage(true);

          const pendingResult = {
            ...verificationResult,
            session_id: localStorage.getItem("session_id"),
            status: "en_cours",
            message: "Votre demande est en cours de validation. Nos services vous recontacteront.",
            captured_photo: capturedImage,
          };

          if (onVerificationComplete) {
            onVerificationComplete(pendingResult);
          }
        } else {
          setError("Votre visage semble ne pas correspondre au document. Veuillez réessayer.");
          setCapturedImage(null);
          setLivenessStep(null);
        }
      } else {
        setResult(verificationResult);
        setAttemptCount(0);
        if (onVerificationComplete) {
          onVerificationComplete({
            ...verificationResult,
            status: "valide",
            session_id: localStorage.getItem("session_id"),
            captured_photo: capturedImage,
          });
        }
      }
    } catch (err) {
      setError(err.message || "Erreur lors de la vérification");
    } finally {
      setIsLoading(false);
    }
  };

  const resetAll = () => {
    setCapturedImage(null);
    setResult(null);
    setError(null);
    setIsCameraActive(false);
    setLivenessStep(null);
    setShowFinalMessage(false);
  };

  // ===== DESIGN PREMIUM =====
  const styles = {
    container: {
      background: "linear-gradient(145deg,#0d1117 0%,#161b22 50%,#0d1117 100%)",
      borderRadius: isMobile ? "20px" : "24px",
      padding: isMobile ? "20px 16px" : "32px",
      margin: isMobile ? "12px 0" : "20px 0",
      boxShadow: "0 25px 50px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.05)",
      fontFamily: "'Inter','Segoe UI',sans-serif",
      color: "#e6edf3",
      position: "relative",
      overflow: "hidden",
    },
    title: {
      textAlign: "center",
      marginBottom: isMobile ? "20px" : "28px",
      fontSize: isMobile ? "1.15rem" : "1.4rem",
      fontWeight: 700,
      background: "linear-gradient(135deg,#79c0ff,#d2a8ff)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      letterSpacing: "-0.02em",
    },
    comparison: {
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      gap: isMobile ? "16px" : "20px",
      marginBottom: "24px",
    },
    box: {
      flex: 1,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      padding: isMobile ? "12px" : "16px",
      borderRadius: "14px",
      position: "relative",
    },
    boxTitle: {
      textAlign: "center",
      marginBottom: "10px",
      fontSize: isMobile ? "11px" : "12px",
      fontWeight: 600,
      color: "#8b949e",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
    },
    imageContainer: {
      background: "rgba(0,0,0,0.3)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "10px",
      height: isMobile ? "200px" : "280px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      position: "relative",
    },
    referenceImage: {
      width: "100%",
      height: "100%",
      objectFit: "contain",
    },
    capturedImage: {
      width: "100%",
      height: "100%",
      objectFit: "contain",
    },
    webcamWrapper: {
      width: "100%",
      height: "100%",
      position: "relative",
      overflow: "hidden",
    },
    webcam: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
    },
    faceGuide: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: "80%",
      height: "80%",
      border: "2px solid rgba(121,192,255,0.5)",
      borderRadius: "50%",
      pointerEvents: "none",
      zIndex: 10,
      boxShadow: "0 0 0 9999px rgba(0,0,0,0.4),0 0 20px rgba(121,192,255,0.2) inset",
    },
    faceGuideMobile: {
      width: "min(220px,70%)",
      height: "min(220px,70%)",
      border: "2px solid rgba(74,222,128,0.7)",
      borderRadius: "50%",
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      pointerEvents: "none",
      zIndex: 10,
      boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
      animation: "fvPulseGuide 1.5s ease-in-out infinite",
    },
    guideText: {
      position: "absolute",
      bottom: "14px",
      left: "50%",
      transform: "translateX(-50%)",
      color: "white",
      backgroundColor: "rgba(0,0,0,0.7)",
      padding: "6px 14px",
      borderRadius: "20px",
      fontSize: "11px",
      whiteSpace: "nowrap",
      zIndex: 11,
      pointerEvents: "none",
      backdropFilter: "blur(4px)",
      border: "1px solid rgba(255,255,255,0.1)",
    },
    placeholder: {
      textAlign: "center",
      color: "#484f58",
    },
    placeholderIcon: {
      fontSize: "40px",
      marginBottom: "8px",
      opacity: 0.5,
    },
    controlsOverlay: {
      position: "absolute",
      bottom: "0",
      left: "0",
      right: "0",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: isMobile ? "12px" : "20px",
      background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)",
      zIndex: 10,
    },
    captureMain: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
    },
    btnCaptureRound: {
      width: isMobile ? "56px" : "66px",
      height: isMobile ? "56px" : "66px",
      borderRadius: "50%",
      border: "4px solid white",
      background: "transparent",
      padding: "4px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.2s ease",
    },
    captureInner: {
      width: "100%",
      height: "100%",
      borderRadius: "50%",
      background: "white",
    },
    captureText: {
      color: "white",
      fontSize: isMobile ? "10px" : "12px",
      fontWeight: "500",
      textShadow: "0 1px 2px rgba(0,0,0,0.5)",
    },
    btnActionSmall: {
      width: isMobile ? "36px" : "40px",
      height: isMobile ? "36px" : "40px",
      borderRadius: "50%",
      background: "rgba(255, 255, 255, 0.2)",
      border: "1px solid rgba(255, 255, 255, 0.3)",
      color: "white",
      fontSize: isMobile ? "16px" : "18px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backdropFilter: "blur(4px)",
    },
    controls: {
      display: "flex",
      gap: "12px",
      justifyContent: "center",
      marginTop: "16px",
    },
    button: {
      padding: isMobile ? "11px 18px" : "12px 24px",
      border: "none",
      borderRadius: "10px",
      fontSize: isMobile ? "13px" : "14px",
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.25s ease",
      letterSpacing: "0.01em",
    },
    primaryButton: {
      background: "linear-gradient(135deg,#388bfd,#6639ba)",
      color: "white",
      boxShadow: "0 4px 15px rgba(56,139,253,0.3)",
    },
    secondaryButton: {
      background: "rgba(255,255,255,0.07)",
      color: "#c9d1d9",
      border: "1px solid rgba(255,255,255,0.12)",
    },
    captureButton: {
      background: "linear-gradient(135deg,#238636,#2ea043)",
      color: "white",
      boxShadow: "0 4px 15px rgba(46,160,67,0.3)",
    },
    cancelButton: {
      background: "rgba(248,81,73,0.15)",
      color: "#f85149",
      border: "1px solid rgba(248,81,73,0.3)",
    },
    verifyButton: {
      background: "linear-gradient(135deg,#238636,#2ea043)",
      color: "white",
      width: "100%",
      padding: isMobile ? "13px" : "15px",
      fontSize: isMobile ? "14px" : "15px",
      fontWeight: 700,
      marginTop: "18px",
      borderRadius: "12px",
      boxShadow: "0 6px 20px rgba(46,160,67,0.35)",
      letterSpacing: "0.02em",
    },
    disabledButton: {
      opacity: 0.45,
      cursor: "not-allowed",
    },
    error: {
      background: "rgba(248,81,73,0.1)",
      border: "1px solid rgba(248,81,73,0.3)",
      padding: "12px 16px",
      marginTop: "16px",
      color: "#ff7b72",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      borderRadius: "10px",
    },
    info: {
      background: "rgba(56,139,253,0.1)",
      border: "1px solid rgba(56,139,253,0.3)",
      padding: "12px 16px",
      marginTop: "16px",
      color: "#79c0ff",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      borderRadius: "10px",
    },
    warning: {
      background: "rgba(210,153,34,0.1)",
      border: "1px solid rgba(210,153,34,0.3)",
      padding: "12px 16px",
      marginTop: "16px",
      color: "#e3b341",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      borderRadius: "10px",
    },
    finalMessage: {
      background: "rgba(188,140,255,0.08)",
      border: "1px solid rgba(188,140,255,0.25)",
      padding: "20px",
      marginTop: "18px",
      color: "#d2a8ff",
      borderRadius: "14px",
      textAlign: "center",
    },
    result: {
      marginTop: "20px",
      padding: "20px",
      borderRadius: "14px",
    },
    success: {
      background: "rgba(46,160,67,0.08)",
      border: "1px solid rgba(46,160,67,0.3)",
    },
    failure: {
      background: "rgba(248,81,73,0.08)",
      border: "1px solid rgba(248,81,73,0.3)",
    },
    pending: {
      background: "rgba(188,140,255,0.08)",
      border: "1px solid rgba(188,140,255,0.3)",
    },
    resultHeader: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      marginBottom: "16px",
    },
    resultIcon: {
      width: "42px",
      height: "42px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "18px",
      fontWeight: "bold",
      flexShrink: 0,
    },
    resultDetails: {
      background: "rgba(0,0,0,0.25)",
      padding: "14px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.06)",
    },
    detailRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "9px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      fontSize: "0.875rem",
    },
    buttonGroup: {
      display: "flex",
      gap: "10px",
      justifyContent: "center",
      flexWrap: "wrap",
    },
    attemptCounter: {
      textAlign: "center",
      marginTop: "10px",
      fontSize: "0.8rem",
      color: "#8b949e",
    },
  };

  const getResultStyle = () => {
    if (!result) return {};
    if (showFinalMessage) return styles.pending;
    return result.verified ? styles.success : styles.failure;
  };

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes fvPulseGuide {
          0%,100% { transform:translate(-50%,-50%) scale(1); }
          50% { transform:translate(-50%,-50%) scale(1.04); box-shadow:0 0 0 9999px rgba(0,0,0,0.5),0 0 16px rgba(74,222,128,0.5); }
        }
        @keyframes fvFadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fvGlow { 0%,100%{opacity:0.6} 50%{opacity:1} }
        .fv-btn-primary:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 28px rgba(56,139,253,0.45) !important; }
        .fv-btn-verify:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 10px 28px rgba(46,160,67,0.45) !important; }
        .fv-btn-cancel:hover { background:rgba(248,81,73,0.25) !important; }
        .fv-btn-secondary:hover { background:rgba(255,255,255,0.12) !important; }
        .fv-anim { animation:fvFadeIn 0.4s ease; }
      `}</style>
      {/* Background glow accents */}
      <div style={{ position:"absolute",top:"-80px",right:"-80px",width:"220px",height:"220px",borderRadius:"50%",background:"radial-gradient(circle,rgba(56,139,253,0.07) 0%,transparent 70%)",pointerEvents:"none" }} />
      <div style={{ position:"absolute",bottom:"-60px",left:"-60px",width:"180px",height:"180px",borderRadius:"50%",background:"radial-gradient(circle,rgba(188,140,255,0.06) 0%,transparent 70%)",pointerEvents:"none" }} />
      
      <h2 style={styles.title}>🛡️ Vérification Biométrique</h2>

      <div style={styles.comparison}>
        {/* Document reference */}
        <div style={styles.box}>
          <p style={styles.boxTitle}>📄 Document officiel</p>
          <div style={styles.imageContainer}>
            <img
              src={
                photoUrl ||
                "https://via.placeholder.com/300x200?text=Photo+de+référence"
              }
              alt="Référence"
              style={styles.referenceImage}
              onError={(e) => {
                e.target.src =
                  "https://via.placeholder.com/300x200?text=Photo+non+disponible";
              }}
            />
          </div>
        </div>

        {/* Live capture */}
        <div style={styles.box}>
          <p style={styles.boxTitle}>🤳 Votre photo en direct</p>
          <div 
            style={{
              ...styles.imageContainer,
              height: livenessStep === 'running' ? 'auto' : (isMobile ? "200px" : "280px"),
              background: livenessStep === 'running' ? 'transparent' : styles.imageContainer.background,
              border: livenessStep === 'running' ? 'none' : styles.imageContainer.border
            }} 
            ref={containerRef}
          >
            {livenessStep === 'running' ? (
              <div className="fv-anim" style={{ width: '100%' }}>
                <div style={{ display:"flex", alignItems:"center", gap:"10px", background:"rgba(56,139,253,0.08)", border:"1px solid rgba(56,139,253,0.2)", borderRadius:"10px", padding:"10px 14px", marginBottom:"10px" }}>
                  <span style={{ fontSize:"20px" }}>🛡️</span>
                  <div>
                    <p style={{ margin:0, fontWeight:600, fontSize:"13px", color:"#79c0ff" }}>Détection de vivacité active</p>
                    <p style={{ margin:0, fontSize:"11px", color:"#8b949e" }}>Suivez les instructions affichées à l'écran</p>
                  </div>
                </div>
                <LivenessDetection onSuccess={handleLivenessSuccess} onFailure={handleLivenessFailure} />
                <button className="fv-btn-cancel" onClick={resetAll} style={{ ...styles.button, ...styles.cancelButton, marginTop:'10px', width:'100%' }}>
                  ✕ Annuler
                </button>
              </div>
            ) : capturedImage && livenessStep === 'done' ? (
              <>
                <img src={capturedImage} alt="Capture liveness" style={styles.capturedImage} />
                {!showFinalMessage && (
                  <button
                    onClick={resetAll}
                    className="fv-btn-secondary"
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: 'rgba(0,0,0,0.65)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#e6edf3',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backdropFilter: 'blur(8px)',
                      zIndex: 20,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                      transition: 'all 0.2s ease'
                    }}
                    title="Reprendre la photo"
                  >
                    <span>🔄</span> Reprendre
                  </button>
                )}
              </>
            ) : (
              <div style={styles.placeholder}>
                <div style={styles.placeholderIcon}>🤳</div>
                <p style={{ margin:0, fontSize:"12px" }}>
                  En attente de la vérification
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Boutons principaux */}
      <div style={{ textAlign:"center", marginBottom:"16px" }}>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display:"none" }} />
        {!livenessStep && !capturedImage && !showFinalMessage && (
          <div style={styles.buttonGroup}>
            <button
              className="fv-btn-primary"
              onClick={startCamera}
              disabled={isLoading}
              style={{ ...styles.button, ...styles.primaryButton, ...(isLoading ? styles.disabledButton : {}), padding:"14px 36px", fontSize:"15px", borderRadius:"12px" }}
            >
              🛡️ Démarrer la vérification
            </button>
          </div>
        )}
        {livenessStep === 'failed' && (
          <div style={styles.buttonGroup}>
            <button className="fv-btn-primary" onClick={resetAll} style={{ ...styles.button, ...styles.primaryButton }}>
              🔄 Réessayer
            </button>
          </div>
        )}
      </div>

      {/* Bouton vérification */}
      {capturedImage && !result && !showFinalMessage && (
        <button
          className="fv-btn-verify"
          onClick={handleVerification}
          disabled={isLoading}
          style={{ ...styles.button, ...styles.verifyButton, ...(isLoading ? styles.disabledButton : {}) }}
        >
          {isLoading ? "⏳ Analyse biométrique…" : "🔍 Vérifier la correspondance"}
        </button>
      )}

      {/* Erreur */}
      {error && !showFinalMessage && (
        <div className="fv-anim" style={error.includes("Votre visage") ? styles.warning : styles.error}>
          <span style={{ fontSize:"18px", flexShrink:0 }}>⚠️</span>
          <p style={{ flex:1, margin:0, fontSize:"13px", lineHeight:1.5 }}>{error}</p>
          <button onClick={() => setError(null)} style={{ background:"none", border:"none", color:"inherit", fontSize:"20px", cursor:"pointer", padding:0, opacity:0.7 }}>×</button>
        </div>
      )}

      {/* Message final */}
      {showFinalMessage && (
        <div className="fv-anim" style={styles.finalMessage}>
          <div style={{ fontSize:"36px", marginBottom:"12px" }}>📋</div>
          <h3 style={{ margin:"0 0 8px", color:"#d2a8ff", fontSize:"1.05rem", fontWeight:700 }}>Demande transmise</h3>
          <p style={{ margin:0, fontSize:isMobile ? "0.9rem" : "0.95rem", lineHeight:1.7, color:"#bc8cff" }}>
            Votre demande est en cours de validation.<br />Nos services vous recontacteront.
          </p>
          <p style={{ margin:"12px 0 0", fontSize:"0.8rem", color:"#8b949e" }}>Un email de confirmation vous sera envoyé.</p>
        </div>
      )}

      {/* Compteur de tentatives */}
      {attemptCount > 0 && !showFinalMessage && (
        <div style={styles.attemptCounter}>Tentative {attemptCount}/2</div>
      )}

      {/* Résultat */}
      {result && !showFinalMessage && (
        <div className="fv-anim" style={{ ...styles.result, ...getResultStyle() }}>
          <div style={styles.resultHeader}>
            <span style={{
              ...styles.resultIcon,
              background: result.verified
                ? "linear-gradient(135deg,#238636,#2ea043)"
                : "linear-gradient(135deg,#b91c1c,#f85149)",
              color: "white",
              boxShadow: result.verified
                ? "0 4px 14px rgba(46,160,67,0.4)"
                : "0 4px 14px rgba(248,81,73,0.4)",
            }}>
              {result.verified ? "✓" : "✗"}
            </span>
            <div>
              <h4 style={{ margin:0, fontSize:"0.95rem", fontWeight:700, color:result.verified ? "#3fb950" : "#f85149" }}>
                {result.verified ? "Correspondance confirmée" : "Pas de correspondance"}
              </h4>
              <p style={{ margin:"2px 0 0", fontSize:"11px", color:"#8b949e" }}>
                {result.verified ? "Identité vérifiée avec succès" : "L'identité n'a pas pu être confirmée"}
              </p>
            </div>
          </div>

          <div style={styles.resultDetails}>
            <div style={styles.detailRow}>
              <span style={{ color:"#8b949e" }}>Confiance</span>
              <strong style={{ color:result.verified ? "#3fb950" : "#f85149" }}>
                {(result.confidence || 0).toFixed(2)}%
              </strong>
            </div>
            {result.distance && (
              <div style={styles.detailRow}>
                <span style={{ color:"#8b949e" }}>Distance</span>
                <span style={{ color:"#c9d1d9" }}>{result.distance.toFixed(4)}</span>
              </div>
            )}
            {result.threshold && (
              <div style={{ ...styles.detailRow, borderBottom:"none" }}>
                <span style={{ color:"#8b949e" }}>Seuil</span>
                <span style={{ color:"#c9d1d9" }}>{result.threshold}</span>
              </div>
            )}
            {result.dominant_emotion && (
              <div style={{ ...styles.detailRow, borderBottom:"none" }}>
                <span style={{ color:"#8b949e" }}>Émotion</span>
                <span style={{ color:"#79c0ff", textTransform:"capitalize", fontWeight:500 }}>
                  {result.dominant_emotion}
                </span>
              </div>
            )}
          </div>

          {result.verified && onVerificationComplete && (
            <div style={{ textAlign:"center", marginTop:"14px", padding:"12px", background:"rgba(46,160,67,0.1)", borderRadius:"10px", border:"1px solid rgba(46,160,67,0.2)", color:"#3fb950", fontSize:"13px" }}>
              ✅ Vérification réussie ! Passage à l'étape suivante…
            </div>
          )}

          {!result.verified && !showFinalMessage && attemptCount < 2 && (
            <button
              className="fv-btn-secondary"
              onClick={resetAll}
              style={{ ...styles.button, ...styles.secondaryButton, marginTop:"14px", width:"100%" }}
            >
              🔄 Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FaceVerification;