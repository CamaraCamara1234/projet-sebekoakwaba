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

  // Vérifier si c'est un objet reviewData (avec statut) ou extractionResults
  const isReviewData = data.statut_verification !== undefined;

  // Convertir reviewData en format compatible avec DataTable si nécessaire
  const getExtractedData = () => {
    if (isReviewData) {
      // Convertir l'objet reviewData en tableau pour DataTable
      return Object.entries(data)
        .filter(([key]) => !key.startsWith('photo_') && !key.includes('_url') && !key.includes('date_verification'))
        .map(([key, value]) => ({
          label: key,
          text: value,
          confidence: 100 // Valeur par défaut pour les données validées
        }));
    }
    return data.extracted_data || [];
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
        {processingTime && (
          <div className="processing-time">
            Temps de traitement: {processingTime} secondes
          </div>
        )}
        {isReviewData && data.statut_verification && (
          <div className={`status-badge ${data.statut_verification}`}>
            {data.statut_verification === 'valide' ? '✅ Validé' : '⏳ En cours'}
          </div>
        )}
      </div>

      {isReviewData ? (
        // Affichage spécifique pour reviewData
        <div className="review-data-display">
          <h3>Données validées</h3>
          <div className="data-grid">
            {Object.entries(data)
              .filter(([key]) => !key.startsWith('photo_') && !key.includes('_url') && key !== 'date_verification')
              .map(([key, value]) => (
                <div key={key} className="data-item">
                  <span className="data-label">{key}:</span>
                  <span className="data-value">{value || '-'}</span>
                </div>
              ))}
          </div>
          
          {/* Afficher les URLs des photos si disponibles */}
          {(data.photo_reference_url || data.photo_capture_url) && (
            <div className="photo-section">
              <h4>Photos</h4>
              <div className="photo-grid">
                {data.photo_reference_url && (
                  <div className="photo-item">
                    <p>Photo de référence</p>
                    <img src={data.photo_reference_url} alt="Référence" />
                  </div>
                )}
                {data.photo_capture_url && (
                  <div className="photo-item">
                    <p>Photo capturée</p>
                    <img src={data.photo_capture_url} alt="Capture" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Affichage normal pour extractionResults
        <>
          <DocumentPreview 
            data={data} 
            extractionKey={extractionKey}
          />

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

      {/* Bouton de confirmation */}
      {showConfirmButton && onConfirm && (
        <div className="confirm-section">
          <button
            onClick={onConfirm}
            className="btn btn-primary btn-large"
          >
            ✓ Confirmer les données
          </button>
        </div>
      )}

      <style jsx="true">{`
        .results-container {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          margin: 2rem 0;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #f0f0f0;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .results-header h2 {
          margin: 0;
          color: #333;
        }

        .processing-time {
          background: #e8f5e9;
          color: #2e7d32;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .status-badge {
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .status-badge.valide {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .status-badge.en_cours {
          background: #fff3e0;
          color: #e65100;
        }

        .review-data-display {
          margin-top: 1rem;
        }

        .data-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .data-item {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }

        .data-label {
          display: block;
          font-size: 0.85rem;
          color: #666;
          margin-bottom: 0.25rem;
          text-transform: uppercase;
        }

        .data-value {
          font-size: 1.1rem;
          font-weight: 600;
          color: #333;
          word-break: break-word;
        }

        .photo-section {
          margin-top: 2rem;
        }

        .photo-section h4 {
          margin: 0 0 1rem;
          color: #333;
        }

        .photo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .photo-item {
          text-align: center;
        }

        .photo-item p {
          margin: 0 0 0.5rem;
          color: #666;
        }

        .photo-item img {
          width: 100%;
          height: 200px;
          object-fit: contain;
          border-radius: 8px;
          border: 2px solid #e0e0e0;
        }

        .confirm-section {
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 2px solid #f0f0f0;
          text-align: center;
        }

        .btn {
          padding: 1rem 3rem;
          border: none;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(102, 126, 234, 0.3);
        }

        .btn-large {
          min-width: 300px;
        }

        .error-message {
          background: #ffebee;
          border-left: 4px solid #f44336;
          padding: 1.5rem;
          border-radius: 8px;
          color: #c62828;
        }

        @media (max-width: 768px) {
          .results-header {
            flex-direction: column;
            text-align: center;
          }

          .data-grid {
            grid-template-columns: 1fr;
          }

          .btn-large {
            min-width: auto;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default ResultsDisplay;