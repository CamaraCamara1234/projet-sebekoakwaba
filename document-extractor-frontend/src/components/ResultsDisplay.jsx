// components/ResultsDisplay.jsx
import React from 'react';
import DocumentPreview from './DocumentPreview';
import DataTable from './DataTable';
import MRZSection from './MRZSection';

const ResultsDisplay = ({
  data,
  processingTime,
  extractionKey,
  onConfirm,
  showConfirmButton = true,
  title = "Résultats de l'extraction"
}) => {
  if (!data) return null;

  const isReviewData = data.statut_verification !== undefined;

  const getStatusMessage = () => {
    if (!isReviewData) return null;

    if (data.statut_verification === 'valide') {
      return {
        title: "Félicitations !",
        message: "Votre inscription a été validée avec succès",
        icon: "🎉",
        className: "success-message"
      };
    } else {
      return {
        title: "Vérification en attente",
        message: "Votre visage ne semble pas correspondre, nous vous contacterons",
        icon: "⏳",
        className: "pending-message"
      };
    }
  };

  const statusMessage = getStatusMessage();

  const getExtractedData = () => {
    if (isReviewData) {
      return Object.entries(data)
        .filter(([key]) => !key.startsWith('photo_') && !key.includes('_url') && !key.includes('date_verification') && key !== 'statut_verification' && key !== 'images_base64' && key !== 'session_id')
        .map(([key, value]) => ({
          label: key,
          text: value,
          confidence: 100
        }));
    }
    return (data.extracted_data || []).filter(item => item.label !== 'session_id');
  };

  if (data.status === 'error') {
    return (
      <div className="error-message">
        <h3>Erreur lors de l'extraction</h3>
        <p>{data.message}</p>
      </div>
    );
  }

  return (
    <div className="results-container">
      <div className="results-header">
        <h2>{title}</h2>
        <div className="header-info">
          {processingTime && (
            <div className="processing-time">
              ⏱️ {processingTime}s
            </div>
          )}
          {isReviewData && data.statut_verification && (
            <div className={`status-badge ${data.statut_verification}`}>
              {data.statut_verification === 'valide' ? '✅' : '⏳'}
            </div>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className={`status-message ${statusMessage.className}`}>
          {/* <div className="status-icon">{statusMessage.icon}</div> */}
          <div className="status-content">
            <h3>{statusMessage.title}</h3>
            {/* <p>{statusMessage.message}</p> */}
          </div>
        </div>
      )}

      {isReviewData ? (
        <div className="review-data-display">
          <h3>Données validées</h3>
          <div className="data-grid">
            {Object.entries(data)
              .filter(([key]) => !key.startsWith('photo_') && !key.includes('_url') && key !== 'date_verification' && key !== 'statut_verification' && key !== 'images_base64' && key !== 'session_id')
              .map(([key, value]) => (
                <div key={key} className="data-item">
                  <span className="data-label">{formatLabel(key)}</span>
                  <span className="data-value">{value || '-'}</span>
                </div>
              ))}
          </div>

          {(data.photo_reference_url || data.photo_capture_url) && (
            <div className="photo-section">
              <h4>Photos</h4>
              <div className="photo-grid">
                {data.photo_reference_url && (
                  <div className="photo-item">
                    <p>Référence</p>
                    <img src={data.photo_reference_url} alt="Référence" />
                  </div>
                )}
                {data.photo_capture_url && (
                  <div className="photo-item">
                    <p>Capture</p>
                    <img src={data.photo_capture_url} alt="Capture" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <DataTable
            data={getExtractedData()}
            title="Données extraites"
          />

          {data.mrz_data && data.mrz_data.length > 0 && (
            <MRZSection
              mrzData={data.mrz_data}
            />
          )}
        </>
      )}

      {showConfirmButton && onConfirm && (
        <div className="confirm-section">
          <button
            onClick={onConfirm}
            className="btn btn-primary"
          >
            ✓ Terminer
          </button>
        </div>
      )}

      <style jsx="true">{`
        .results-container {
          background: white;
          border-radius: 10px;
          padding: 1rem;
          margin: 0.5rem 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.08);
          width: 100%;
          box-sizing: border-box;
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1.5px solid #f0f0f0;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .results-header h2 {
          margin: 0;
          color: #333;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .header-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .processing-time {
          background: #e8f5e9;
          color: #2e7d32;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
        }

        .status-badge {
          padding: 0.25rem 0.4rem;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .status-badge.valide {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .status-badge.en_cours {
          background: #fff3e0;
          color: #e65100;
        }

        .status-message {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          margin-bottom: 1rem;
          border-radius: 8px;
          animation: slideIn 0.3s ease;
        }

        .status-message.success-message {
          background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
          border: 1.5px solid #4CAF50;
        }

        .status-message.pending-message {
          background: linear-gradient(135deg, #fff3e0, #ffe0b2);
          border: 1.5px solid #FF9800;
        }

        .status-icon {
          font-size: 2rem;
          min-width: 40px;
          text-align: center;
        }

        .status-content {
          flex: 1;
        }

        .status-content h3 {
          margin: 0 0 0.15rem;
          font-size: 0.95rem;
        }

        .success-message .status-content h3 {
          color: #2e7d32;
        }

        .pending-message .status-content h3 {
          color: #e65100;
        }

        .status-content p {
          margin: 0;
          font-size: 0.8rem;
          line-height: 1.3;
        }

        .success-message .status-content p {
          color: #1b5e20;
        }

        .pending-message .status-content p {
          color: #bf360c;
        }

        .review-data-display {
          margin-top: 0.5rem;
        }

        .review-data-display h3 {
          font-size: 0.9rem;
          margin: 0 0 0.5rem;
          color: #555;
        }

        .data-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.4rem;
          margin-top: 0.5rem;
        }

        .data-item {
          background: #f8f9fa;
          padding: 0.5rem 0.6rem;
          border-radius: 6px;
          border-left: 3px solid #667eea;
          display: flex;
          flex-direction: column;
        }

        .data-label {
          font-size: 0.65rem;
          color: #666;
          margin-bottom: 0.1rem;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .data-value {
          font-size: 0.85rem;
          font-weight: 600;
          color: #333;
          word-break: break-word;
          line-height: 1.2;
        }

        .photo-section {
          margin-top: 1rem;
        }

        .photo-section h4 {
          margin: 0 0 0.5rem;
          color: #555;
          font-size: 0.85rem;
        }

        .photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 0.75rem;
        }

        .photo-item {
          text-align: center;
          background: #fafafa;
          padding: 0.4rem;
          border-radius: 6px;
        }

        .photo-item p {
          margin: 0 0 0.25rem;
          color: #666;
          font-size: 0.7rem;
        }

        .photo-item img {
          width: 100%;
          height: 100px;
          object-fit: contain;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
          background: #f5f5f5;
        }

        .confirm-section {
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1.5px solid #f0f0f0;
          text-align: center;
        }

        .btn {
          padding: 0.6rem 1rem;
          border: none;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(102, 126, 234, 0.25);
        }

        .error-message {
          background: #ffebee;
          border-left: 3px solid #f44336;
          padding: 0.75rem;
          border-radius: 6px;
          color: #c62828;
        }

        .error-message h3 {
          margin: 0 0 0.25rem;
          font-size: 0.9rem;
        }

        .error-message p {
          margin: 0;
          font-size: 0.8rem;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Tablettes et écrans moyens */
        @media (min-width: 481px) and (max-width: 768px) {
          .results-container {
            padding: 1.25rem;
          }

          .data-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 0.6rem;
          }

          .photo-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .photo-item img {
            height: 120px;
          }

          .results-header h2 {
            font-size: 1.2rem;
          }
        }

        /* Desktop */
        @media (min-width: 769px) {
          .results-container {
            padding: 2rem;
            margin: 2rem 0;
            border-radius: 12px;
          }

          .results-header {
            margin-bottom: 2rem;
            padding-bottom: 1rem;
          }

          .results-header h2 {
            font-size: 1.5rem;
          }

          .processing-time {
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
          }

          .status-badge {
            padding: 0.5rem 1rem;
            font-size: 0.9rem;
          }

          .status-message {
            padding: 2rem;
            gap: 1.5rem;
          }

          .status-icon {
            font-size: 3rem;
            min-width: 80px;
          }

          .status-content h3 {
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
          }

          .status-content p {
            font-size: 1.1rem;
          }

          .data-grid {
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 0.75rem;
          }

          .data-item {
            padding: 0.75rem 1rem;
          }

          .data-label {
            font-size: 0.75rem;
          }

          .data-value {
            font-size: 1rem;
          }

          .photo-grid {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
          }

          .photo-item img {
            height: 150px;
          }

          .btn {
            width: auto;
            min-width: 300px;
            padding: 1rem 3rem;
            font-size: 1.1rem;
          }
        }

        /* Très petits écrans */
        @media (max-width: 480px) {
          .results-container {
            padding: 0.75rem;
          }

          .results-header h2 {
            font-size: 1rem;
          }

          .status-icon {
            font-size: 1.75rem;
            min-width: 35px;
          }

          .status-content h3 {
            font-size: 0.9rem;
          }

          .status-content p {
            font-size: 0.75rem;
          }

          .data-label {
            font-size: 0.6rem;
          }

          .data-value {
            font-size: 0.8rem;
          }

          .photo-item img {
            height: 90px;
          }

          .btn {
            font-size: 0.85rem;
            padding: 0.5rem 0.75rem;
            min-height: 40px;
          }
        }

        /* Optimisations pour l'impression */
        @media print {
          .results-container {
            box-shadow: none;
            padding: 1cm;
          }

          .confirm-section,
          .btn {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};

const formatLabel = (label) => {
  const labels = {
    nom: "Nom",
    prenom: "Prénom",
    date_naissance: "Date de naissance",
    date_expiration: "Date d'expiration",
    nationalite: "Nationalité",
    cin: "Numéro CIN",
    code: "Code MRZ",
    sexe: "Sexe",
    adresse: "Adresse",
    nini: "N° identification",
    motif_sejour: "Motif de séjour",
    lieu_naissance: "Lieu de naissance",
    type_piece: "Type document",
    numero_piece: "N° pièce",
    profession: "Profession",
    date_delivrance: "Date délivrance",
    numero: "N° passeport",
    score_confiance: "Score confiance",
    distance_faciale: "Distance faciale"
  };

  return labels[label] || label.replace(/_/g, ' ');
};

export default ResultsDisplay;