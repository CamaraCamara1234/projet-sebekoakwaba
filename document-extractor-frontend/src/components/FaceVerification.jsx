// components/FaceVerification.jsx
import React, { useState, useRef } from "react";
import Webcam from "react-webcam";
import { verifyFaces, advancedVerifyFaces } from "../services/api";

const FaceVerification = ({
  referencePhoto,
  extractionKey,
  onVerificationComplete,
  useAdvanced = true,
  photoPath, // Nouveau prop pour le chemin de la photo
}) => {
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [showFinalMessage, setShowFinalMessage] = useState(false);

  const webcamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Utiliser getImageUrl pour la photo de référence
  const photoUrl = referencePhoto;

  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "user",
  };

  const captureImage = () => {
    if (!webcamRef.current) {
      setError("Caméra non disponible");
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
      setIsCameraActive(false);
    } else {
      setError("Erreur lors de la capture");
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

  // components/FaceVerification.jsx - Modifier handleVerification

  const handleVerification = async () => {
    if (!capturedImage) {
      setError("Veuillez capturer ou uploader une image");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Convertir l'image base64 en blob
      const blob = await fetch(capturedImage).then((res) => res.blob());
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });

      const verificationFunction = advancedVerifyFaces;
      const verificationResult = await verificationFunction(file);

      setResult(verificationResult);

      if (verificationResult.dominant_emotion) {
        console.log("Émotion détectée:", verificationResult.dominant_emotion);
      }

      // Gérer les tentatives
      if (!verificationResult.verified) {
        const newAttemptCount = attemptCount + 1;
        setAttemptCount(newAttemptCount);

        if (newAttemptCount >= 2) {
          // Après 2 échecs, afficher le message final
          setShowFinalMessage(true);

          // Créer un résultat avec statut "en_cours"
          const pendingResult = {
            ...verificationResult,
            session_id: localStorage.getItem("session_id"),
            status: "en_cours",
            message:
              "Votre demande est en cours de validation. Nos services vous recontacteront.",
            captured_photo: capturedImage, // Ajouter la photo capturée
          };

          // Appeler onVerificationComplete avec le statut "en_cours"
          if (onVerificationComplete) {
            onVerificationComplete(pendingResult);
          }
        } else {
          // Premier échec : message d'encouragement
          setError(
            "Votre visage semble ne pas correspondre. Veuillez bien positionner votre visage.",
          );
        }
      } else {
        // Succès : réinitialiser le compteur et appeler le callback
        setAttemptCount(0);
        if (onVerificationComplete) {
          onVerificationComplete({
            ...verificationResult,
            status: "valide",
            session_id: localStorage.getItem("session_id"),
            captured_photo: capturedImage, // Ajouter la photo capturée
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

  // Styles
  const styles = {
    container: {
      background: "white",
      borderRadius: "12px",
      padding: "24px",
      margin: "20px 0",
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      fontFamily: "Arial, sans-serif",
    },
    title: {
      textAlign: "center",
      marginBottom: "30px",
      color: "#333",
      fontSize: "1.5rem",
    },
    comparison: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "20px",
      marginBottom: "24px",
    },
    box: {
      background: "#f8f9fa",
      padding: "16px",
      borderRadius: "8px",
    },
    boxTitle: {
      textAlign: "center",
      marginBottom: "16px",
      fontSize: "16px",
      fontWeight: "bold",
      color: "#555",
    },
    imageContainer: {
      background: "white",
      border: "2px dashed #e0e0e0",
      borderRadius: "8px",
      height: "300px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
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
    webcam: {
      width: "100%",
      height: "300px",
      objectFit: "cover",
      borderRadius: "8px",
    },
    placeholder: {
      textAlign: "center",
      color: "#999",
    },
    placeholderIcon: {
      fontSize: "48px",
      marginBottom: "10px",
    },
    controls: {
      display: "flex",
      gap: "12px",
      justifyContent: "center",
      marginTop: "16px",
    },
    button: {
      padding: "10px 20px",
      border: "none",
      borderRadius: "6px",
      fontSize: "14px",
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
      padding: "12px",
      fontSize: "16px",
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

  // Déterminer le style du résultat en fonction du statut
  const getResultStyle = () => {
    if (!result) return {};
    if (showFinalMessage) return styles.pending;
    return result.verified ? styles.success : styles.failure;
  };

  return (
    <div style={styles.container}>
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
          <div style={styles.imageContainer}>
            {isCameraActive ? (
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={videoConstraints}
                style={styles.webcam}
              />
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
          </div>

          {isCameraActive ? (
            <div style={styles.controls}>
              <button
                onClick={captureImage}
                disabled={isLoading}
                style={{
                  ...styles.button,
                  ...styles.captureButton,
                  ...(isLoading ? styles.disabledButton : {}),
                }}
              >
                📸 Capturer
              </button>
              <button
                onClick={stopCamera}
                style={{ ...styles.button, ...styles.cancelButton }}
              >
                Annuler
              </button>
            </div>
          ) : capturedImage && !showFinalMessage ? (
            <div style={styles.controls}>
              <button
                onClick={() => {
                  setCapturedImage(null);
                  setResult(null);
                  setError(null);
                }}
                style={{ ...styles.button, ...styles.secondaryButton }}
              >
                🔄 Reprendre
              </button>
            </div>
          ) : null}
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
          <p style={{ margin: 0, fontSize: "1.1rem" }}>
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
