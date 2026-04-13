// components/FaceVerification.jsx
import React, { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import { verifyFaces, advancedVerifyFaces } from "../services/api";

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
    setIsCameraActive(true);
    setError(null);
    setCapturedImage(null);
    setResult(null);
    setShowFinalMessage(false);
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

      setResult(verificationResult);

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
          setError("Votre visage semble ne pas correspondre. Veuillez bien positionner votre visage.");
        }
      } else {
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
    setAttemptCount(0);
    setShowFinalMessage(false);
  };

  // Styles optimisés pour mobile
  const styles = {
    container: {
      background: "white",
      borderRadius: isMobile ? "16px" : "12px",
      padding: isMobile ? "16px" : "24px",
      margin: isMobile ? "12px 0" : "20px 0",
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      fontFamily: "Arial, sans-serif",
    },
    title: {
      textAlign: "center",
      marginBottom: isMobile ? "20px" : "30px",
      color: "#333",
      fontSize: isMobile ? "1.2rem" : "1.5rem",
    },
    comparison: {
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      gap: isMobile ? "16px" : "20px",
      marginBottom: "24px",
    },
    box: {
      flex: 1,
      background: "#f8f9fa",
      padding: isMobile ? "12px" : "16px",
      borderRadius: "8px",
      position: "relative",
    },
    boxTitle: {
      textAlign: "center",
      marginBottom: "12px",
      fontSize: isMobile ? "14px" : "16px",
      fontWeight: "bold",
      color: "#555",
    },
    imageContainer: {
      background: "white",
      border: "2px dashed #e0e0e0",
      borderRadius: "8px",
      height: isMobile ? "200px" : "300px",
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
      transform: "translate(-50%, -50%)",
      width: "80%",
      height: "80%",
      border: "2px solid rgba(255, 255, 255, 0.5)",
      borderRadius: "50%",
      pointerEvents: "none",
      zIndex: 10,
      boxShadow: "0 0 0 9999px rgba(0,0,0,0.3)",
    },
    faceGuideMobile: {
      width: "min(250px, 70%)",
      height: "min(250px, 70%)",
      border: "3px solid rgba(76, 175, 80, 0.8)",
      borderRadius: "50%",
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
      zIndex: 10,
      boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
      animation: "pulseGuide 1.5s ease-in-out infinite",
    },
    guideText: {
      position: "absolute",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      color: "white",
      backgroundColor: "rgba(0,0,0,0.6)",
      padding: "8px 16px",
      borderRadius: "20px",
      fontSize: "12px",
      whiteSpace: "nowrap",
      zIndex: 11,
      pointerEvents: "none",
    },
    placeholder: {
      textAlign: "center",
      color: "#999",
    },
    placeholderIcon: {
      fontSize: "48px",
      marginBottom: "10px",
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
      padding: isMobile ? "10px 16px" : "10px 20px",
      border: "none",
      borderRadius: "6px",
      fontSize: isMobile ? "13px" : "14px",
      fontWeight: "500",
      cursor: "pointer",
      transition: "all 0.3s ease",
    },
    primaryButton: {
      background: "#667eea",
      color: "white",
    },
    secondaryButton: {
      background: "#f0f0f0",
      color: "#333",
      border: "1px solid #ddd",
    },
    captureButton: {
      background: "#4CAF50",
      color: "white",
    },
    cancelButton: {
      background: "#f44336",
      color: "white",
    },
    verifyButton: {
      background: "#4CAF50",
      color: "white",
      width: "100%",
      padding: isMobile ? "10px" : "12px",
      fontSize: isMobile ? "14px" : "16px",
      fontWeight: "600",
      marginTop: "16px",
    },
    disabledButton: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
    error: {
      background: "#ffebee",
      borderLeft: "4px solid #f44336",
      padding: "12px 16px",
      marginTop: "20px",
      color: "#c62828",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      borderRadius: "4px",
    },
    info: {
      background: "#e3f2fd",
      borderLeft: "4px solid #2196f3",
      padding: "12px 16px",
      marginTop: "20px",
      color: "#1976d2",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      borderRadius: "4px",
    },
    warning: {
      background: "#fff3e0",
      borderLeft: "4px solid #ff9800",
      padding: "12px 16px",
      marginTop: "20px",
      color: "#e65100",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      borderRadius: "4px",
    },
    finalMessage: {
      background: "#f3e5f5",
      borderLeft: "4px solid #9c27b0",
      padding: "16px",
      marginTop: "20px",
      color: "#6a1b9a",
      borderRadius: "8px",
      textAlign: "center",
    },
    result: {
      marginTop: "24px",
      padding: "20px",
      borderRadius: "8px",
    },
    success: {
      background: "#e8f5e9",
      border: "2px solid #4CAF50",
    },
    failure: {
      background: "#ffebee",
      border: "2px solid #f44336",
    },
    pending: {
      background: "#f3e5f5",
      border: "2px solid #9c27b0",
    },
    resultHeader: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      marginBottom: "16px",
    },
    resultIcon: {
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "20px",
      fontWeight: "bold",
    },
    resultDetails: {
      background: "white",
      padding: "16px",
      borderRadius: "6px",
    },
    detailRow: {
      display: "flex",
      justifyContent: "space-between",
      padding: "8px 0",
      borderBottom: "1px solid #f0f0f0",
    },
    buttonGroup: {
      display: "flex",
      gap: "10px",
      justifyContent: "center",
      flexWrap: "wrap",
    },
    attemptCounter: {
      textAlign: "center",
      marginTop: "8px",
      fontSize: "0.85rem",
      color: "#666",
    },
  };

  const getResultStyle = () => {
    if (!result) return {};
    if (showFinalMessage) return styles.pending;
    return result.verified ? styles.success : styles.failure;
  };

  return (
    <div style={styles.container}>
      <style>
        {`
          @keyframes pulseGuide {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.8;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.05);
              opacity: 1;
            }
          }
        `}
      </style>
      
      <h2 style={styles.title}>
        Vérification faciale {useAdvanced && "(Avancée)"}
      </h2>

      <div style={styles.comparison}>
        {/* Photo de référence */}
        <div style={styles.box}>
          <h4 style={styles.boxTitle}>Photo de référence (document)</h4>
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

        {/* Photo à vérifier */}
        <div style={styles.box}>
          <h4 style={styles.boxTitle}>Photo à vérifier</h4>
          <div style={styles.imageContainer} ref={containerRef}>
            {isCameraActive ? (
              <div style={styles.webcamWrapper}>
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={getVideoConstraints()}
                  style={styles.webcam}
                  mirrored={true}
                />
                {/* Guide pour positionner le visage */}
                <div style={isMobile ? styles.faceGuideMobile : styles.faceGuide}></div>
                <div style={styles.guideText}>
                  {isMobile ? "Placez votre visage dans le cercle" : "Centre du visage"}
                </div>
              </div>
            ) : capturedImage ? (
              <img
                src={capturedImage}
                alt="Capture"
                style={styles.capturedImage}
              />
            ) : (
              <div style={styles.placeholder}>
                <div style={styles.placeholderIcon}>📷</div>
                <p>Aucune photo sélectionnée</p>
              </div>
            )}

            {isCameraActive ? (
              <div style={styles.controlsOverlay}>
                <button
                  onClick={stopCamera}
                  style={styles.btnActionSmall}
                  title="Annuler"
                >
                  ✕
                </button>

                <div style={styles.captureMain}>
                  <button
                    onClick={captureImage}
                    disabled={isLoading}
                    style={{
                      ...styles.btnCaptureRound,
                      ...(isLoading ? styles.disabledButton : {}),
                    }}
                    title="Capturer"
                  >
                    <div style={styles.captureInner}></div>
                  </button>
                  <span style={styles.captureText}>Capturer</span>
                </div>

                <div style={{ width: isMobile ? "36px" : "40px" }}></div>
              </div>
            ) : capturedImage && !showFinalMessage ? (
              <div style={styles.controlsOverlay}>
                <div style={{ width: isMobile ? "36px" : "40px" }}></div>
                <div style={styles.captureMain}>
                  <button
                    onClick={() => {
                      setCapturedImage(null);
                      setResult(null);
                      setError(null);
                    }}
                    style={styles.btnCaptureRound}
                    title="Reprendre"
                  >
                    <div style={{ ...styles.captureInner, background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      🔄
                    </div>
                  </button>
                  <span style={styles.captureText}>Reprendre</span>
                </div>
                <div style={{ width: isMobile ? "36px" : "40px" }}></div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Boutons de contrôle principaux */}
      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: "none" }}
        />

        {!isCameraActive && !capturedImage && !showFinalMessage && (
          <div style={styles.buttonGroup}>
            <button
              onClick={startCamera}
              disabled={isLoading}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                ...(isLoading ? styles.disabledButton : {}),
              }}
            >
              🎥 Ouvrir la caméra
            </button>
            {/* <button
              onClick={() => fileInputRef.current.click()}
              disabled={isLoading}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
                ...(isLoading ? styles.disabledButton : {}),
              }}
            >
              📁 Choisir une photo
            </button> */}
          </div>
        )}
      </div>

      {/* Bouton de vérification */}
      {capturedImage && !result && !showFinalMessage && (
        <button
          onClick={handleVerification}
          disabled={isLoading}
          style={{
            ...styles.button,
            ...styles.verifyButton,
            ...(isLoading ? styles.disabledButton : {}),
          }}
        >
          {isLoading
            ? "Vérification en cours..."
            : "🔍 Vérifier la correspondance"}
        </button>
      )}

      {/* Message d'erreur personnalisé pour première tentative */}
      {error && !showFinalMessage && (
        <div
          style={error.includes("Votre visage") ? styles.warning : styles.error}
        >
          <span>{error.includes("Votre visage") ? "⚠️" : "⚠️"}</span>
          <p style={{ flex: 1, margin: 0 }}>{error}</p>
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              fontSize: "20px",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Message final après 2 échecs */}
      {showFinalMessage && (
        <div style={styles.finalMessage}>
          <h3 style={{ margin: "0 0 10px 0", color: "#6a1b9a" }}>
            📋 Demande en cours
          </h3>
          <p style={{ margin: 0, fontSize: isMobile ? "1rem" : "1.1rem" }}>
            Votre demande est en cours de validation. Nos services vous
            recontacteront.
          </p>
          <p style={{ margin: "10px 0 0 0", fontSize: "0.9rem", opacity: 0.8 }}>
            Un email de confirmation vous sera envoyé.
          </p>
        </div>
      )}

      {/* Compteur de tentatives */}
      {attemptCount > 0 && !showFinalMessage && (
        <div style={styles.attemptCounter}>Tentative {attemptCount}/2</div>
      )}

      {/* Résultat */}
      {result && !showFinalMessage && (
        <div
          style={{
            ...styles.result,
            ...getResultStyle(),
          }}
        >
          <div style={styles.resultHeader}>
            <span
              style={{
                ...styles.resultIcon,
                background: result.verified ? "#4CAF50" : "#f44336",
                color: "white",
              }}
            >
              {result.verified ? "✓" : "✗"}
            </span>
            <h4 style={{ margin: 0 }}>
              {result.verified
                ? "Correspondance confirmée"
                : "Pas de correspondance"}
            </h4>
          </div>

          <div style={styles.resultDetails}>
            <div style={styles.detailRow}>
              <span>Confiance:</span>
              <strong>{(result.confidence || 0).toFixed(2)}%</strong>
            </div>
            {result.distance && (
              <div style={styles.detailRow}>
                <span>Distance:</span>
                <span>{result.distance.toFixed(4)}</span>
              </div>
            )}
            {result.threshold && (
              <div style={styles.detailRow}>
                <span>Seuil:</span>
                <span>{result.threshold}</span>
              </div>
            )}
            {result.dominant_emotion && (
              <div style={styles.detailRow}>
                <span>Émotion:</span>
                <span style={{ color: "#2196f3", textTransform: "capitalize" }}>
                  {result.dominant_emotion}
                </span>
              </div>
            )}
          </div>

          {result.verified && onVerificationComplete && (
            <div
              style={{
                textAlign: "center",
                marginTop: "16px",
                padding: "12px",
                background: "rgba(76,175,80,0.1)",
                borderRadius: "6px",
              }}
            >
              ✅ Vérification réussie ! Passage à l'étape suivante...
            </div>
          )}

          {!result.verified && !showFinalMessage && attemptCount < 2 && (
            <button
              onClick={resetAll}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
                marginTop: "16px",
                width: "100%",
              }}
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