import React, { useState } from 'react';
import UnifiedRegistrationForm from './components/UnifiedRegistrationForm';
import ReviewData from './components/ReviewData';
import FaceVerification from './components/FaceVerification';
import {
  extractSingleDocument,
  extractDualDocuments,
  // cleanDirectories,
  clearSessionId,
  getImageUrl
} from './services/api';
import './assets/styles/main.css';
import ResultsDisplay from './components/ResultsDisplay';

function App() {
  // États
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

  // Étape 1 : Soumission du formulaire unifié
  const handleFormSubmit = async ({ formData: userData, files }) => {
    console.log('Formulaire soumis:', userData);
    console.log('Fichiers uploadés:', files);

    setFormData(userData);
    setUploadedFiles(files);
    setIsProcessing(true);

    try {
      // Lancer l'extraction OCR
      const formDataObj = new FormData();

      if (files.length === 1) {
        formDataObj.append('image1', files[0]);
        const result = await extractSingleDocument(formDataObj);
        console.log("Résultat extraction:", result);
        setExtractionResults(result);
        setExtractionKey(prev => prev + 1);
      } else if (files.length === 2) {
        formDataObj.append('image1', files[0]);
        formDataObj.append('image2', files[1]);
        const result = await extractDualDocuments(formDataObj);
        console.log("Résultat extraction:", result);
        setExtractionResults(result);
        setExtractionKey(prev => prev + 1);
      }

      // Passer à l'étape 2 (revue des données)
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
    console.log('Données confirmées:', confirmedData);
    console.log('Résultats validation:', validationResults);

    setReviewData(confirmedData);
    setValidationResult(validationResults);

    // Vérifier si toutes les données sont validées
    if (validationResults?.data_verified) {
      const allVerified = Object.values(validationResults.data_verified).every(v => v.verified);
      console.log('Toutes les données sont-elles validées?', allVerified);

      if (allVerified) {
        // Si tout est validé, passer à l'étape suivante
        setCurrentStep(3);
        setError(null);
      } else {
        // Sinon, rester à l'étape 2 avec un message
        setError('Certaines données doivent être corrigées manuellement avant de continuer');
      }
    } else {
      // Si pas de validation (ancien comportement), on bloque aussi
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
    console.log('Vérification faciale:', result);

    // Créer l'objet complet avec les données existantes + nouveaux champs
    const updatedReviewData = {
      ...reviewData,
      session_id: localStorage.getItem('session_id'),
      statut_verification: result.status || (result.verified ? 'valide' : 'en_cours'),
      photo_reference_url: extractionResults?.photo ? getImageUrl(extractionResults.photo) : null,
      photo_capture_url: result.captured_photo || null,
      date_verification: new Date().toISOString(),
      score_confiance: result.confidence || 0,
      distance_faciale: result.distance || 0
    };

    console.log('✅ Données mises à jour avec statut:', updatedReviewData);

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
  const handleFinalizeRegistration = () => {
    setIsProcessing(true);

    // Simuler l'envoi au serveur
    setTimeout(() => {
      setRegistrationComplete(true);
      setIsProcessing(false);
      alert('✅ Inscription réussie !');

      setTimeout(() => {
        resetRegistration();
      }, 3000);
    }, 2000);
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

    // Effacer le session_id du localStorage
    clearSessionId();
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
            <UnifiedRegistrationForm
              onSubmit={handleFormSubmit}
              initialData={reviewData || formData}
              isUploading={isProcessing}
            />
          </div>
        );

      case 2:
        return (
          <div className="step-container">
            <div className="step-header">
              <h2>Étape 2 : Vérification des données</h2>
              <p className="step-description">
                Vérifiez les informations extraites de votre document et modifiez si nécessaire
              </p>
              <button
                className="nav-link"
                onClick={() => setCurrentStep(1)}
              >
                ← Modifier le formulaire
              </button>
            </div>
            <ReviewData
              extractedData={extractionResults}
              formData={formData}
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
              <h2>Étape 3 : Vérification faciale</h2>
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
            <div className="success-animation">
              <div className="checkmark-circle">
                <div className="checkmark"></div>
              </div>
            </div>

            <div className="success-message">
              <h2>Félicitations !</h2>
              <p>Votre inscription a été validée avec succès</p>
            </div>

            {/* Afficher ResultsDisplay avec les données de reviewData */}
            <ResultsDisplay
              data={reviewData}
              processingTime={extractionResults?.temps}
              extractionKey={extractionKey}
              showConfirmButton={false}
              title="Récapitulatif des données"
            />

            <div className="action-buttons">
              <button
                onClick={resetRegistration}
                className="btn btn-secondary"
                disabled={isProcessing}
              >
                Nouvelle inscription
              </button>
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
          <h1>SecureID Verification</h1>
          <p className="header-subtitle">
            Inscription sécurisée avec vérification d'identité
          </p>
        </div>
      </header>

      {/* Barre de progression */}
      <div className="progress-container">
        <div className="container">
          <div className="progress-steps">
            <div
              className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}
              onClick={() => goToStep(1)}
            >
              <div className="step-indicator">
                <span className="step-number">1</span>
                {currentStep > 1 && <span className="step-check">✓</span>}
              </div>
              <span className="step-label">Formulaire</span>
            </div>
            <div className="step-connector"></div>
            <div
              className={`step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}
              onClick={() => extractionResults && goToStep(2)}
            >
              <div className="step-indicator">
                <span className="step-number">2</span>
                {currentStep > 2 && <span className="step-check">✓</span>}
              </div>
              <span className="step-label">Revue</span>
            </div>
            <div className="step-connector"></div>
            <div
              className={`step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}
              onClick={() => reviewData && validationResult?.allVerified && goToStep(3)}
            >
              <div className="step-indicator">
                <span className="step-number">3</span>
                {currentStep > 3 && <span className="step-check">✓</span>}
              </div>
              <span className="step-label">Visage</span>
            </div>
            <div className="step-connector"></div>
            <div
              className={`step ${currentStep >= 4 ? 'active' : ''}`}
              onClick={() => faceVerificationResult && goToStep(4)}
            >
              <div className="step-indicator">
                <span className="step-number">4</span>
              </div>
              <span className="step-label">Finalisation</span>
            </div>
          </div>
        </div>
      </div>

      <main className="app-main">
        <div className="container">
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
            <p>© {new Date().getFullYear()} SecureID Verification. Tous droits réservés.</p>
            <div className="footer-links">
              <a href="/privacy">Confidentialité</a>
              <a href="/terms">Sebeko</a>
              <a href="/help">Aide</a>
            </div>
          </div>
        </div>
      </footer>
      {/* Styles globaux */}
      <style jsx="true">{`
        .app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .app-header {
          background: rgba(255, 255, 255, 0.95);
          padding: 1.5rem 0;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .app-header h1 {
          margin: 0;
          color: #333;
          font-size: 2rem;
        }

        .header-subtitle {
          margin: 0.5rem 0 0;
          color: #666;
        }

        .progress-container {
          background: white;
          padding: 1rem 0;
          border-bottom: 1px solid #e0e0e0;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }

        .progress-steps {
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: relative;
          max-width: 800px;
          margin: 0 auto;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          z-index: 2;
          flex: 1;
        }

        .step-indicator {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #e0e0e0;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.5rem;
          transition: all 0.3s ease;
          position: relative;
        }

        .step.active .step-indicator {
          background: #4CAF50;
          color: white;
          transform: scale(1.1);
        }

        .step.completed .step-indicator {
          background: #4CAF50;
          color: white;
        }

        .step-number {
          font-weight: bold;
        }

        .step-check {
          position: absolute;
          font-size: 1.2rem;
        }

        .step-label {
          font-size: 0.9rem;
          color: #666;
          font-weight: 500;
        }

        .step.active .step-label {
          color: #4CAF50;
          font-weight: 600;
        }

        .step-connector {
          flex: 1;
          height: 2px;
          background: #e0e0e0;
          margin: 0 0.5rem;
        }

        .app-main {
          flex: 1;
          padding: 2rem 0;
        }

        .step-container {
          animation: fadeIn 0.5s ease;
        }

        .step-header {
          text-align: center;
          margin-bottom: 2rem;
          position: relative;
        }

        .step-header h2 {
          color: white;
          margin-bottom: 0.5rem;
          font-size: 1.8rem;
        }

        .step-description {
          color: rgba(255, 255, 255, 0.9);
          font-size: 1.1rem;
        }

        .nav-link {
          background: none;
          border: none;
          color: white;
          text-decoration: underline;
          cursor: pointer;
          font-size: 1rem;
          padding: 0.5rem 1rem;
          transition: all 0.3s ease;
          margin-top: 0.5rem;
        }

        .nav-link:hover {
          color: #4CAF50;
        }

        .error-container {
          margin-bottom: 2rem;
        }

        .alert {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        .alert.error {
          border-left: 4px solid #f44336;
        }

        .alert-icon {
          font-size: 1.5rem;
        }

        .alert p {
          flex: 1;
          margin: 0;
          color: #c62828;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #999;
          padding: 0.5rem;
        }

        .close-btn:hover {
          color: #333;
        }

        .warning-message {
          background: #fff3e0;
          border-left: 4px solid #ff9800;
          padding: 1.5rem;
          border-radius: 8px;
          text-align: center;
          color: #e65100;
        }

        .success-animation {
          text-align: center;
          margin: 2rem 0;
        }

        .checkmark-circle {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #4CAF50;
          margin: 0 auto;
          position: relative;
          animation: scaleIn 0.5s ease;
        }

        .checkmark {
          width: 40px;
          height: 20px;
          border-left: 4px solid white;
          border-bottom: 4px solid white;
          transform: rotate(-45deg);
          position: absolute;
          top: 50%;
          left: 50%;
          margin-left: -20px;
          margin-top: -12px;
        }

        .success-message {
          text-align: center;
          padding: 2rem;
          background: rgba(255,255,255,0.9);
          border-radius: 8px;
          margin-bottom: 2rem;
        }

        .success-message h2 {
          color: #4CAF50;
          margin-bottom: 0.5rem;
        }

        .registration-summary {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          margin: 2rem 0;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-top: 1.5rem;
        }

        .summary-card {
          padding: 1.5rem;
          background: #f9f9f9;
          border-radius: 8px;
        }

        .summary-card h4 {
          margin: 0 0 1rem;
          color: #333;
        }

        .verified {
          color: #4CAF50;
          position: relative;
          padding-left: 1.5rem;
        }

        .verified::before {
          content: '✓';
          position: absolute;
          left: 0;
          color: #4CAF50;
          font-weight: bold;
        }

        .action-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
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

        .btn-secondary {
          background: white;
          color: #333;
          border: 1px solid #ddd;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f5f5f5;
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
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 0.5rem;
        }

        .app-footer {
          background: rgba(0, 0, 0, 0.3);
          color: white;
          padding: 1.5rem 0;
          margin-top: auto;
        }

        .footer-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .footer-links a {
          color: white;
          text-decoration: none;
          margin-left: 1.5rem;
          opacity: 0.8;
          transition: opacity 0.3s ease;
        }

        .footer-links a:hover {
          opacity: 1;
          text-decoration: underline;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes scaleIn {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
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
          }

          .step-indicator {
            margin-bottom: 0;
          }

          .summary-grid {
            grid-template-columns: 1fr;
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

          .footer-links a {
            margin: 0 0.75rem;
          }
        }
      `}</style> 
    </div>
  );
}

export default App;