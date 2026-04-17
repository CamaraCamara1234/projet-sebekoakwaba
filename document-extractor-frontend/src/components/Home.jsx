import React, { useState, useEffect } from 'react';
import RegistrationForm from './RegistrationForm';
import ReviewData from './ReviewData';
import FaceVerification from './FaceVerification';
import {
  extractSingleDocument,
  cleanDirectories,
  clearSessionId,
  updateUserStatus,
} from '../services/api';
import '../assets/styles/main.css';
import ResultsDisplay from './ResultsDisplay';

const normalizeString = (str) => {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

function Home() {
  // États (inchangés)
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState(null);
  const [extractionResults, setExtractionResults] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [faceVerificationResult, setFaceVerificationResult] = useState(null);
  const [error, setError] = useState(null);
  const [extractionKey, setExtractionKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [externalData, setExternalData] = useState(null);

  // Récupérer les données de l'URL au chargement
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const data = {};
    const keys = ['id', 'nom', 'prenom', 'email', 'username', 'ville', 'adresse', 'telephone'];

    let hasData = false;
    keys.forEach(key => {
      const value = params.get(key);
      if (value) {
        data[key] = value;
        hasData = true;
      }
    });

    if (hasData) {
      // console.log('📦 Données extraites de l\'URL:', data);
      setExternalData(data);
    }
  }, []);

  // Étape 1 : Soumission du formulaire unifié
  const handleFormSubmit = async ({ formData: userData, files }) => {
    setFormData(userData);
    setUploadedFiles(files);
    setIsProcessing(true);

    try {
      const formDataObj = new FormData();
      formDataObj.append('image1', files[0]);
      
      const result = await extractSingleDocument(formDataObj);
      console.log("Résultat extraction:", result);
      setExtractionResults(result);
      setExtractionKey(prev => prev + 1);

      setCurrentStep(2);

    } catch (err) {
      console.error("Erreur extraction:", err);
      setError(err.message || "Erreur lors de l'extraction");
    } finally {
      setIsProcessing(false);
    }
  };

  // Étape 2 : Confirmation des données après revue
  const handleReviewConfirm = (confirmedData, validationResults = null) => {
    // console.log('Données confirmées:', confirmedData);
    // console.log('Résultats validation:', validationResults);

    setReviewData(confirmedData);
    setValidationResult(validationResults);

    if (validationResults?.data_verified) {
      const allVerified = Object.values(validationResults.data_verified).every(v => v.verified);
      
      // Double vérification avec les données externes (Nom/Prénom)
      const nomMatch = !externalData?.nom || 
        normalizeString(confirmedData.nom) === normalizeString(externalData.nom);
      const prenomMatch = !externalData?.prenom || 
        normalizeString(confirmedData.prenom) === normalizeString(externalData.prenom);

      console.log('Toutes les données sont-elles validées?', allVerified);
      console.log('Match données externes?', nomMatch && prenomMatch);

      if (allVerified && nomMatch && prenomMatch) {
        setCurrentStep(3);
        setError(null);
      } else if (!nomMatch || !prenomMatch) {
        setError('Le nom ou le prénom ne correspond pas aux données du système externe.');
      } else {
        setError('Certaines données doivent être corrigées manuellement avant de continuer');
      }
    } else {
      setError('Veuillez valider les données avant de continuer');
    }
  };

  // Retour à l'étape 1 pour modification
  const handleEdit = () => {
    setCurrentStep(1);
    setError(null);
  };

  // Étape 3 : Vérification faciale
  const handleFaceVerificationComplete = (result) => {
    // console.log('Vérification faciale:', result);

    const updatedReviewData = {
      ...reviewData,
      session_id: result.session_id || extractionResults?.session_id || localStorage.getItem('secureid_session_id'),
      statut_verification: result.status || (result.verified ? 'valide' : 'en_cours'),
      photo_reference_url: extractionResults?.images_base64?.photo || (extractionResults?.photo ? extractionResults.photo : null),
      photo_capture_url: result.photo_capture_base64 || result.captured_photo || null,
      date_verification: new Date().toISOString(),
      score_confiance: result.confidence || result.similarity || 0,
      distance_faciale: result.distance || 0,
      images_base64: {
        ...(extractionResults?.images_base64 || {}),
        photo_capture: result.photo_capture_base64 || null
      }
    };

    // console.log('✅ Données mises à jour avec statut:', updatedReviewData);

    setReviewData(updatedReviewData);
    setFaceVerificationResult(result);

    if (result.status === 'valide' || result.verified) {
      setCurrentStep(4);
      setError(null);
    } else {
      setError(result.message || 'La vérification faciale a échoué. Veuillez réessayer avec une meilleure lumière.');
      setCurrentStep(4);
    }
  };

  // Étape 4 : Finalisation
  const handleFinalizeRegistration = async () => {
    if (!externalData || !externalData.id) {
      setError("ID utilisateur manquant (données externes non chargées)");
      return;
    }

    const finalData = {
      ...reviewData,
      user_id: externalData.id
    };

    // console.log('✅ Données finales:', finalData);
    setIsProcessing(true);

    try {
      await updateUserStatus(finalData);
      await cleanDirectories();
      setRegistrationComplete(true);
      setShowToast(true);
      // Redirection très rapide pour éviter tout délai, on laisse juste le temps au navigateur
      // de peindre le toast
      setTimeout(() => {
        window.location.href = "https://akwabasebeko.com/";
      }, 300);
    } catch (err) {
      console.error("Erreur finalisation:", err);
      setError("Erreur lors de la communication avec le serveur principal");
    } finally {
      setIsProcessing(false);
    }
  };

  // Réinitialisation complète avec nettoyage de la session
  const resetRegistration = () => {
    setCurrentStep(1);
    setFormData(null);
    setUploadedFiles(null);
    setExtractionResults(null);
    setReviewData(null);
    setValidationResult(null);
    setFaceVerificationResult(null);
    setError(null);
    setRegistrationComplete(false);
    setExtractionKey(prev => prev + 1);

    cleanDirectories();
    console.log('Session réinitialisée');
  };

  const goToStep = (step) => {
    if (step < currentStep) {
      setCurrentStep(step);
      setError(null);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="step-container">
            <RegistrationForm
              onSubmit={handleFormSubmit}
              initialData={reviewData || formData}
              isUploading={isProcessing}
            />
          </div>
        );

      case 2:
        return (
          <div className="step-container">
            <ReviewData
              extractedData={extractionResults}
              formData={formData}
              externalData={externalData}
              onConfirm={handleReviewConfirm}
              onEdit={handleEdit}
              isProcessing={isProcessing}
            />
          </div>
        );

      case 3:
        return (
          <div className="step-container">
            <div className="step-header">
              <h2>Vérification faciale</h2>
              <p className="step-description">
                Prenez une photo en temps réel pour confirmer votre identité
              </p>
              <button
                className="nav-link"
                onClick={() => setCurrentStep(2)}
              >
                ← Retour à la revue
              </button>
            </div>

            {extractionResults?.photo && (
              <FaceVerification
                referencePhoto={extractionResults.photo}
                extractionKey={extractionKey}
                onVerificationComplete={handleFaceVerificationComplete}
                useAdvanced={true}
              />
            )}

            {!extractionResults?.photo && (
              <div className="warning-message">
                <p>⚠️ Aucune photo de référence trouvée dans le document</p>
                <button
                  onClick={() => setCurrentStep(2)}
                  className="btn btn-primary"
                >
                  Retour
                </button>
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="step-container step-4">
            <ResultsDisplay
              data={reviewData}
              processingTime={extractionResults?.temps}
              extractionKey={extractionKey}
              showConfirmButton={false}
              title="Récapitulatif des données"
            />

            <div className="action-buttons">
              {/* <button
                onClick={resetRegistration}
                className="btn btn-secondary"
                disabled={isProcessing}
              >
                Nouvelle inscription
              </button> */}
              <button
                onClick={handleFinalizeRegistration}
                disabled={isProcessing || registrationComplete}
                className="btn btn-primary btn-large"
              >
                {isProcessing ? (
                  <>
                    <span className="spinner-small"></span>
                    Finalisation...
                  </>
                ) : registrationComplete ? (
                  '✓ Terminé'
                ) : (
                  'Terminer'
                )}
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="container">
          <div className="header-content">
            <div className="logo-section">
              <div className="logo-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h1>Akwaba-checkid</h1>
                <p className="header-subtitle">Vérification d'identité sécurisée</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Barre de progression améliorée */}
      <div className="progress-container">
        <div className="container">
          <div className="progress-steps">
            {[
              { number: 1, label: 'Formulaire', icon: '📝' },
              { number: 2, label: 'Revue', icon: '✓' },
              { number: 3, label: 'Visage', icon: '👤' },
              { number: 4, label: 'Finalisation', icon: '🎉' }
            ].map((step, index) => (
              <React.Fragment key={step.number}>
                <div
                  className={`step ${currentStep >= step.number ? 'active' : ''} ${currentStep > step.number ? 'completed' : ''}`}
                  onClick={() => {
                    if (step.number === 1) goToStep(1);
                    if (step.number === 2 && extractionResults) goToStep(2);
                    if (step.number === 3 && reviewData && validationResult?.allVerified) goToStep(3);
                    if (step.number === 4 && faceVerificationResult) goToStep(4);
                  }}
                >
                  <div className="step-indicator">
                    {currentStep > step.number ? (
                      <span className="step-check">✓</span>
                    ) : (
                      <span className="step-icon">{step.icon}</span>
                    )}
                  </div>
                  <span className="step-label">{step.label}</span>
                </div>
                {index < 3 && <div className="step-connector"></div>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <main className="app-main">
        <div className="container">
          {showToast && (
            <div className="toast-notification">
              <span className="toast-icon">✅</span> 
              Vérification terminée ! Redirection en cours...
            </div>
          )}
          {error && (
            <div className="error-container">
              <div className="alert error">
                <span className="alert-icon">⚠️</span>
                <p>{error}</p>
                <button onClick={() => setError(null)} className="close-btn">×</button>
              </div>
            </div>
          )}

          {renderStep()}
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <div className="footer-content">
            <p>© {new Date().getFullYear()} AkwabaCheckid. Tous droits réservés.</p>
            <div className="footer-links">
              <a href="/privacy">Confidentialité</a>
              <a href="/terms">Conditions</a>
              <a href="/help">Support</a>
            </div>
          </div>
        </div>
      </footer>

      <style jsx="true">{`
        .app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #0477a8ff 0%, #a8dbeaff 50%, #2c5364 100%);
          position: relative;
          overflow-x: hidden;
        }

        .app::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(circle at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%);
          pointer-events: none;
        }

        .app-header {
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(10px);
          padding: 1rem 0;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
          position: relative;
          z-index: 10;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .logo-icon {
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #3e5ff2 0%, #d4ceda 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .app-header h1 {
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-size: 1.8rem;
          font-weight: 700;
        }

        .header-subtitle {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
        }

        .progress-container {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          padding: 1.5rem 0;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          position: sticky;
          top: 0;
          z-index: 9;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
        }

        .progress-steps {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 800px;
          margin: 0 auto;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          position: relative;
          flex: 1;
          transition: all 0.3s ease;
        }

        .step:hover .step-label {
          color: #667eea;
        }

        .step-indicator {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #e8eef2;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.75rem;
          transition: all 0.3s ease;
          position: relative;
          font-size: 1.2rem;
        }

        .step.active .step-indicator {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          transform: scale(1.1);
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .step.completed .step-indicator {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
        }

        .step-icon {
          font-size: 1.2rem;
        }

        .step-check {
          font-size: 1.4rem;
          font-weight: bold;
        }

        .step-label {
          font-size: 0.85rem;
          color: #6c757d;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.3s ease;
        }

        .step.active .step-label {
          color: #667eea;
          font-weight: 700;
        }

        .step-connector {
          flex: 1;
          height: 2px;
          background: linear-gradient(90deg, #e8eef2 0%, #e8eef2 50%, transparent 100%);
          margin: 0 0.5rem;
          position: relative;
          top: -24px;
        }

        .step.active + .step-connector,
        .step.completed + .step-connector {
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        }

        .app-main {
          flex: 1;
          padding: 3rem 0;
          position: relative;
          z-index: 1;
        }

        .step-container {
          animation: fadeInUp 0.6s ease;
        }

        .step-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .step-header h2 {
          color: white;
          margin-bottom: 0.75rem;
          font-size: 2rem;
          font-weight: 700;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .step-description {
          color: rgba(255, 255, 255, 0.9);
          font-size: 1rem;
          max-width: 600px;
          margin: 0 auto;
        }

        .nav-link {
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          border: none;
          color: white;
          cursor: pointer;
          font-size: 0.9rem;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          transition: all 0.3s ease;
          margin-top: 1rem;
        }

        .nav-link:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateX(-4px);
        }

        .error-container {
          margin-bottom: 2rem;
          animation: slideInDown 0.5s ease;
        }

        .alert {
          background: white;
          border-radius: 12px;
          padding: 1rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }

        .alert.error {
          border-left: 4px solid #ef4444;
        }

        .alert-icon {
          font-size: 1.5rem;
        }

        .alert p {
          flex: 1;
          margin: 0;
          color: #dc2626;
          font-weight: 500;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #999;
          padding: 0.5rem;
          transition: all 0.3s ease;
        }

        .close-btn:hover {
          color: #333;
          transform: rotate(90deg);
        }

        .warning-message {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-left: 4px solid #f59e0b;
          padding: 2rem;
          border-radius: 12px;
          text-align: center;
          color: #92400e;
          font-weight: 500;
        }

        .action-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-top: 2rem;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: inherit;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
        }

        .btn-secondary {
          background: white;
          color: #374151;
          border: 1px solid #e5e7eb;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f9fafb;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-large {
          padding: 1rem 2rem;
          font-size: 1.1rem;
        }

        .spinner-small {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-right: 0.5rem;
        }

        .app-footer {
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(10px);
          color: white;
          padding: 1.5rem 0;
          margin-top: auto;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .footer-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .footer-links {
          display: flex;
          gap: 2rem;
        }

        .footer-links a {
          color: rgba(255, 255, 255, 0.8);
          text-decoration: none;
          transition: all 0.3s ease;
          font-size: 0.9rem;
        }

        .footer-links a:hover {
          color: white;
          text-decoration: underline;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .toast-notification {
          position: fixed;
          top: 20px;
          right: 20px;
          background: white;
          color: #333;
          padding: 16px 24px;
          border-radius: 8px;
          border-left: 4px solid #4CAF50;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 9999;
          animation: slideInRight 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          font-weight: 500;
          font-size: 0.95rem;
        }

        .toast-icon {
          font-size: 1.2rem;
        }

        @keyframes slideInRight {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .toast-notification {
            top: 10px;
            right: 10px;
            left: 10px; /* Takes full width with margin on small devices */
          }
          .container {
            padding: 0 1rem;
          }

          .progress-steps {
            flex-direction: column;
            gap: 1rem;
          }

          .step-connector {
            display: none;
          }

          .step {
            flex-direction: row;
            width: 100%;
            gap: 1rem;
            justify-content: flex-start;
          }

          .step-indicator {
            margin-bottom: 0;
            width: 40px;
            height: 40px;
          }

          .step-label {
            font-size: 0.9rem;
          }

          .action-buttons {
            flex-direction: column;
          }

          .btn {
            width: 100%;
          }

          .footer-content {
            flex-direction: column;
            text-align: center;
          }

          .footer-links {
            justify-content: center;
          }

          .step-header h2 {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}

export default Home;