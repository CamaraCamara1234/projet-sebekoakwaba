// components/ReviewData.jsx
import React, { useState } from 'react';
import { validationData, getSessionId, cleanDirectories } from '../services/api';

const normalizeString = (str) => {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const ReviewData = ({
  extractedData,
  formData,
  externalData,
  onConfirm,
  onEdit,
  isProcessing
}) => {
  const [editedData, setEditedData] = useState(() => {
    const initialData = {};
    if (extractedData?.extracted_data) {
      extractedData.extracted_data.forEach(item => {
        if (!item.label.endsWith('_ar')) {
          initialData[item.label] = item.text;
        }
      });
    }
    if (formData) {
      Object.entries(formData).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          initialData[key] = value;
        }
      });
    }
    return initialData;
  });

  const [editMode, setEditMode] = useState({});
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [externalError, setExternalError] = useState(null);

  const extractedItems = extractedData?.extracted_data?.filter(
    item => !item.label.endsWith('_ar')
  ) || [];

  const handleEdit = (field) => {
    setEditMode(prev => ({ ...prev, [field]: true }));
  };

  const handleSave = (field, value) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
    setEditMode(prev => ({ ...prev, [field]: false }));
  };

  const handleCancel = (field) => {
    setEditMode(prev => ({ ...prev, [field]: false }));
  };

  const handleConfirmWithValidation = async () => {
    setIsValidating(true);
    setExternalError(null);
    try {
      const formDataToSend = new FormData();
      const sessionId = getSessionId();
      if (sessionId) {
        formDataToSend.append('session_id', sessionId);
      }
      formDataToSend.append('data', JSON.stringify(editedData));
      if (extractedData?.mrz_data && extractedData.mrz_data.length > 0) {
        formDataToSend.append('data_mrz', JSON.stringify(extractedData.mrz_data[0]));
      } else {
        formDataToSend.append('data_mrz', JSON.stringify({}));
      }
      const result = await validationData(formDataToSend);
      setValidationResult(result);
      const allVerified = result.data_verified &&
        Object.values(result.data_verified).every(v => v.verified);
      if (allVerified) {
        const validatedData = { ...editedData };
        Object.entries(result.data_verified).forEach(([key, value]) => {
          if (value.value) {
            validatedData[key] = value.value;
          }
        });
        if (externalData) {
          const nomMatch = !externalData.nom ||
            normalizeString(validatedData.nom) === normalizeString(externalData.nom);
          const prenomMatch = !externalData.prenom ||
            normalizeString(validatedData.prenom) === normalizeString(externalData.prenom);
          if (!nomMatch || !prenomMatch) {
            let errorMsg = "Divergence avec les données du système :";
            if (!nomMatch) errorMsg += ` le nom "${validatedData.nom}" ne correspond pas à "${externalData.nom}".`;
            if (!prenomMatch) errorMsg += ` le prénom "${validatedData.prenom}" ne correspond pas à "${externalData.prenom}".`;
            setExternalError(errorMsg);
            cleanDirectories()
            return;
          }
        }
        onConfirm(validatedData, result);
      } else {
        setShowCorrections(true);
        const updatedData = { ...editedData };
        let hasChanges = false;
        Object.entries(result.data_verified || {}).forEach(([key, value]) => {
          if (!value.verified && value.mrz_value && value.mrz_value !== updatedData[key]) {
            updatedData[key] = value.mrz_value;
            hasChanges = true;
          }
        });
        if (hasChanges) {
          setEditedData(updatedData);
        }
      }
    } catch (error) {
      console.error("❌ Erreur lors de la validation:", error);
      if (externalData) {
        const nomMatch = !externalData.nom ||
          normalizeString(editedData.nom) === normalizeString(externalData.nom);
        const prenomMatch = !externalData.prenom ||
          normalizeString(editedData.prenom) === normalizeString(externalData.prenom);
        if (!nomMatch || !prenomMatch) {
          let errorMsg = "Impossible de valider car les données ne correspondent pas au système :";
          if (!nomMatch) errorMsg += ` le nom "${editedData.nom}" vs "${externalData.nom}".`;
          if (!prenomMatch) errorMsg += ` le prénom "${editedData.prenom}" vs "${externalData.prenom}".`;
          setExternalError(errorMsg);
          return;
        }
      }
      onConfirm(editedData);
    } finally {
      setIsValidating(false);
    }
  };

  const getExtractedValue = (field) => {
    const item = extractedItems.find(item => item.label === field);
    return item ? item.text : null;
  };

  const getConfidence = (field) => {
    const item = extractedItems.find(item => item.label === field);
    return item ? item.confidence * 100 : 0;
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 90) return '#4CAF50';
    if (confidence >= 70) return '#FF9800';
    return '#F44336';
  };

  const getValidationStatus = (field) => {
    if (!validationResult?.data_verified) return null;
    return validationResult.data_verified[field] || null;
  };

  const allFieldsVerified = validationResult?.data_verified &&
    Object.values(validationResult.data_verified).every(v => v.verified);

  const verifiedCount = validationResult?.data_verified
    ? Object.values(validationResult.data_verified).filter(v => v.verified).length
    : 0;

  const totalCount = validationResult?.data_verified
    ? Object.keys(validationResult.data_verified).length
    : 0;

  const getDocumentFields = () => {
    const fields = [];
    if (extractedItems.length > 0) {
      extractedItems.forEach(item => {
        const labelMapping = {
          'nom': 'Nom',
          'prenom': 'Prénom',
          'date_naissance': 'Date de naissance',
          'lieu_naissance': 'Lieu de naissance',
          'nationalite': 'Nationalité',
          'cin': 'N° de pièce',
          'date_expiration': "Date d'expiration",
          'sexe': 'Sexe',
          'adresse': 'Adresse',
          'motif_sejour': 'Motif de séjour',
          'pere': 'Nom du père',
          'mere': 'Nom de la mère',
          'profession': 'Profession',
          'numero': 'Numéro de passeport',
          'date_delivrance': 'Date de délivrance',
          'code': 'Code MRZ',
          'pays': 'Pays',
          'taille': 'Taille',
          'nini': 'Numéro NINI'
        };
        fields.push({
          key: item.label,
          label: labelMapping[item.label] || item.label,
          confidence: item.confidence
        });
      });
    }
    return fields;
  };

  const documentFields = getDocumentFields();

  return (
    <div className="review-container">
      <div className="review-header">
        <h2>Vérification des données</h2>
        <p className="review-subtitle">
          Vérifiez et modifiez si nécessaire
        </p>
      </div>

      {externalError && (
        <div className="validation-summary error">
          <h4>❌ Erreur de correspondance</h4>
          <p>{externalError}</p>
          <p className="validation-help error">
            Corrigez le Nom et Prénom pour correspondre au système.
          </p>
        </div>
      )}

      {validationResult && (
        <div className={`validation-summary ${allFieldsVerified ? 'success' : 'warning'}`}>
          <h4>Résultat de la validation</h4>
          <p>
            {allFieldsVerified ? (
              "✅ Toutes les données validées !"
            ) : (
              `⚠️ ${verifiedCount}/${totalCount} champs validés`
            )}
          </p>
          {!allFieldsVerified && (
            <p className="validation-help">
              Champs orange corrigés par MRZ.
            </p>
          )}
        </div>
      )}

      {externalData && (
        <div className="external-data-reference">
          <h3 className="section-title">
            <span className="section-icon">🔗</span>
            Données de référence
          </h3>
          <div className="external-data-grid">
            {Object.entries(externalData)
              .filter(([key]) => key !== 'id')
              .map(([key, value]) => (
                <div key={key} className="external-item">
                  <span className="external-label">{key}:</span>
                  <span className="external-value">{value}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="review-grid">
        <div className="review-section">
          <h3 className="section-title">
            <span className="section-icon">📄</span>
            Informations extraites
          </h3>

          <div className="review-cards">
            {documentFields.map(field => {
              const extractedValue = getExtractedValue(field.key);
              const confidence = field.confidence * 100;
              const currentValue = editedData[field.key] || extractedValue || '';
              const validationStatus = getValidationStatus(field.key);
              const referenceValue = externalData?.[field.key];
              const hasDiscrepancy = referenceValue && currentValue && normalizeString(referenceValue) !== normalizeString(currentValue);

              let cardClass = 'review-card';
              if (validationStatus) {
                cardClass += validationStatus.verified ? ' verified' : ' warning';
              }
              if (hasDiscrepancy) {
                cardClass += ' discrepancy';
              }

              return (
                <div key={field.key} className={cardClass}>
                  <div className="card-header">
                    <div className="card-header-left">
                      <span className="field-label">{field.label}</span>
                      {validationStatus && (
                        <span className={`validation-badge ${validationStatus.verified ? 'success' : 'warning'}`}>
                          {validationStatus.verified ? '✓' : '⚠️'}
                        </span>
                      )}
                    </div>
                    <span className="field-source">Document</span>
                  </div>

                  <div className="card-content">
                    {editMode[field.key] ? (
                      <div className="edit-mode">
                        <input
                          type="text"
                          defaultValue={currentValue}
                          className="edit-input"
                          id={`edit-${field.key}`}
                          autoFocus
                        />
                        <div className="edit-actions">
                          <button
                            onClick={() => {
                              const input = document.getElementById(`edit-${field.key}`);
                              handleSave(field.key, input.value);
                            }}
                            className="save-btn"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => handleCancel(field.key)}
                            className="cancel-btn"
                          >
                            ✗
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="view-mode">
                        <span className="field-value">{currentValue || '-'}</span>
                        {field.key !== 'code' && (
                          <button
                            onClick={() => handleEdit(field.key)}
                            className="edit-btn"
                            title="Modifier"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {validationStatus && !validationStatus.verified && validationStatus.mrz_value && (
                    <div className="validation-correction">
                      <small>✓ MRZ: {validationStatus.mrz_value}</small>
                    </div>
                  )}

                  {referenceValue && (
                    <div className={`reference-info ${hasDiscrepancy ? 'error' : 'success'}`}>
                      <small>
                        {hasDiscrepancy ? '❌ Système: ' : '✅ Système: '}
                        <strong>{referenceValue}</strong>
                      </small>
                    </div>
                  )}

                  <div className="card-footer">
                    <div className="confidence-bar">
                      <div
                        className="confidence-fill"
                        style={{
                          width: `${confidence}%`,
                          backgroundColor: getConfidenceColor(confidence)
                        }}
                      ></div>
                    </div>
                    <span className="confidence-text">
                      {confidence.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="document-images">
        <h3 className="section-title">
          <span className="section-icon">🖼️</span>
          Images extraites
        </h3>
        <div className="images-grid">
          {extractedData?.photo && extractedData.photo !== 'N/A' && (
            <div className="image-card">
              <h4>Photo</h4>
              <img
                src={extractedData.photo}
                alt="Photo"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/150?text=Photo';
                }}
              />
            </div>
          )}
          {extractedData?.photo_portrait && extractedData.photo_portrait !== 'N/A' && (
            <div className="image-card">
              <h4>Portrait</h4>
              <img
                src={extractedData.photo_portrait}
                alt="Portrait"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/150?text=Portrait';
                }}
              />
            </div>
          )}
          {extractedData?.cin_recto && extractedData.cin_recto !== 'N/A' && (
            <div className="image-card">
              <h4>Recto</h4>
              <img
                src={extractedData.cin_recto}
                alt="Recto"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/150?text=Recto';
                }}
              />
            </div>
          )}
          {extractedData?.cin_verso && extractedData.cin_verso !== 'N/A' && (
            <div className="image-card">
              <h4>Verso</h4>
              <img
                src={extractedData.cin_verso}
                alt="Verso"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/150?text=Verso';
                }}
              />
            </div>
          )}
          {extractedData?.passeport && extractedData.passeport !== 'N/A' && (
            <div className="image-card">
              <h4>Passeport</h4>
              <img
                src={extractedData.passeport}
                alt="passeport"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/150?text=passeport';
                }}
              />
            </div>
          )}
          {extractedData?.mrz_image && extractedData.mrz_image !== 'N/A' && (
            <div className="image-card">
              <h4>MRZ</h4>
              <img
                src={extractedData.mrz_image}
                alt="MRZ"
                onError={(e) => {
                  e.target.src = 'https://via.placeholder.com/150?text=MRZ';
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="review-actions">
        <button
          onClick={onEdit}
          className="btn btn-secondary"
          disabled={isProcessing || isValidating}
        >
          ← Modifier
        </button>

        {validationResult && !allFieldsVerified ? (
          <div className="button-group">
            <button
              onClick={handleConfirmWithValidation}
              className="btn btn-primary"
              disabled={isProcessing || isValidating}
            >
              {isValidating ? (
                <>
                  <span className="spinner-small"></span>
                  Validation...
                </>
              ) : (
                'Re-valider'
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={handleConfirmWithValidation}
            className="btn btn-primary"
            disabled={isProcessing || isValidating}
          >
            {isValidating ? (
              <>
                <span className="spinner-small"></span>
                Validation...
              </>
            ) : isProcessing ? (
              <>
                <span className="spinner-small"></span>
                Traitement...
              </>
            ) : (
              'Valider et continuer'
            )}
          </button>
        )}
      </div>

      <style jsx="true">{`
        .review-container {
          max-width: 100%;
          margin: 0;
          padding: 0.5rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-sizing: border-box;
        }

        .review-header {
          text-align: left;
          margin-bottom: 0.75rem;
          padding: 0 0.25rem;
        }

        .review-header h2 {
          color: white;
          margin-bottom: 0.15rem;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .review-subtitle {
          color: rgba(255, 255, 255, 0.9);
          font-size: 0.8rem;
          margin: 0;
        }

        .validation-summary {
          background: white;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          margin-bottom: 0.75rem;
          border-left: 3px solid;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .validation-summary.success {
          border-left-color: #4CAF50;
        }

        .validation-summary.warning {
          border-left-color: #FF9800;
        }

        .validation-summary.error {
          border-left-color: #f44336;
          background-color: #fffde7;
        }

        .validation-summary h4 {
          margin: 0 0 0.25rem;
          color: #333;
          font-size: 0.9rem;
        }

        .validation-summary p {
          margin: 0.25rem 0;
          color: #666;
          font-size: 0.8rem;
        }

        .validation-help {
          font-size: 0.75rem;
          color: #FF9800;
          background: #fff3e0;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          margin-top: 0.25rem;
        }

        .validation-help.error {
          color: #f44336;
          background: #ffebee;
        }

        .review-grid {
          display: block;
          margin-bottom: 0.75rem;
        }

        .review-section {
          background: white;
          border-radius: 6px;
          padding: 0.75rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .external-data-reference {
          background: #e3f2fd;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          margin-bottom: 0.75rem;
          border-left: 3px solid #2196f3;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .external-data-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .external-item {
          display: flex;
          flex-direction: column;
          background: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          min-width: 120px;
          flex: 1 0 auto;
        }

        .external-label {
          font-size: 0.65rem;
          color: #1976d2;
          font-weight: bold;
          text-transform: uppercase;
        }

        .external-value {
          font-size: 0.8rem;
          color: #333;
          font-weight: 500;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          margin: 0 0 0.5rem;
          color: #333;
          font-size: 0.95rem;
          font-weight: 600;
        }

        .section-icon {
          font-size: 1.1rem;
        }

        .review-cards {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .review-card {
          background: #f8f9fa;
          border-radius: 5px;
          padding: 0.5rem;
          transition: all 0.2s ease;
          position: relative;
          border-left: 3px solid transparent;
        }

        .review-card.verified {
          border-left-color: #4CAF50;
        }

        .review-card.warning {
          border-left-color: #FF9800;
        }

        .review-card.discrepancy {
          border-left-color: #f44336;
          background-color: #fffde7;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
          flex-wrap: wrap;
          gap: 0.25rem;
        }

        .card-header-left {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-wrap: wrap;
        }

        .field-label {
          font-weight: 600;
          color: #333;
          font-size: 0.8rem;
        }

        .field-source {
          font-size: 0.6rem;
          padding: 0.15rem 0.35rem;
          border-radius: 3px;
          background: #e0e0e0;
          color: #666;
        }

        .validation-badge {
          font-size: 0.7rem;
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
        }

        .validation-badge.success {
          background: #4CAF50;
          color: white;
        }

        .validation-badge.warning {
          background: #FF9800;
          color: white;
        }

        .validation-correction {
          margin: 0.25rem 0;
          padding: 0.25rem 0.35rem;
          background: #e8f5e9;
          border-radius: 3px;
          color: #2e7d32;
          font-size: 0.7rem;
          border-left: 2px solid #4CAF50;
        }

        .reference-info {
          margin: 0.25rem 0;
          padding: 0.25rem 0.35rem;
          border-radius: 3px;
          font-size: 0.7rem;
          border-left: 2px solid;
        }

        .reference-info.success {
          background: #e8f5e9;
          color: #2e7d32;
          border-left-color: #4CAF50;
        }

        .reference-info.error {
          background: #ffebee;
          color: #c62828;
          border-left-color: #f44336;
        }

        .card-content {
          margin-bottom: 0.25rem;
        }

        .view-mode {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .field-value {
          color: #666;
          word-break: break-word;
          font-size: 0.8rem;
        }

        .edit-btn {
          background: none;
          border: none;
          font-size: 1rem;
          cursor: pointer;
          opacity: 0.5;
          transition: all 0.2s ease;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          min-width: 28px;
          min-height: 28px;
        }

        .edit-btn:hover {
          opacity: 1;
          transform: scale(1.05);
          background: #e0e0e0;
        }

        .edit-mode {
          display: flex;
          gap: 0.25rem;
          align-items: flex-start;
        }

        .edit-input {
          flex: 1;
          padding: 0.35rem;
          border: 1.5px solid #667eea;
          border-radius: 4px;
          font-size: 0.8rem;
          outline: none;
          min-width: 0;
        }

        .edit-input:focus {
          box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.15);
        }

        .edit-actions {
          display: flex;
          gap: 0.15rem;
        }

        .save-btn,
        .cancel-btn {
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .save-btn {
          background: #4caf50;
          color: white;
        }

        .save-btn:hover {
          background: #45a049;
        }

        .cancel-btn {
          background: #f44336;
          color: white;
        }

        .cancel-btn:hover {
          background: #d32f2f;
        }

        .card-footer {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }

        .confidence-bar {
          flex: 1;
          height: 4px;
          background: #e0e0e0;
          border-radius: 2px;
          overflow: hidden;
        }

        .confidence-fill {
          height: 100%;
          transition: width 0.2s ease;
        }

        .confidence-text {
          font-size: 0.65rem;
          color: #666;
          min-width: 40px;
          text-align: right;
        }

        .document-images {
          background: white;
          border-radius: 6px;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .images-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .image-card {
          text-align: center;
          background: #f8f9fa;
          padding: 0.35rem;
          border-radius: 4px;
          transition: transform 0.15s ease;
        }

        .image-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .image-card h4 {
          margin: 0 0 0.25rem;
          color: #666;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .image-card img {
          width: 100%;
          max-height: 120px;
          object-fit: contain;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
          background: #f0f0f0;
        }

        .review-actions {
          display: flex;
          gap: 0.5rem;
          justify-content: stretch;
          margin-top: 0.75rem;
          flex-wrap: wrap;
        }

        .button-group {
          display: flex;
          gap: 0.35rem;
          flex: 1;
        }

        .btn {
          padding: 0.5rem 0.75rem;
          border: none;
          border-radius: 5px;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 1;
          min-height: 40px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(102, 126, 234, 0.25);
        }

        .btn-warning {
          background: #FF9800;
          color: white;
          box-shadow: 0 2px 4px rgba(255, 152, 0, 0.2);
        }

        .btn-warning:hover:not(:disabled) {
          background: #F57C00;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: white;
          color: #333;
          border: 1px solid #ddd;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f5f5f5;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spinner-small {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-right: 0.35rem;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Optimisations spécifiques très petits écrans */
        @media (max-width: 480px) {
          .review-container {
            padding: 0.25rem;
          }

          .review-header h2 {
            font-size: 1.1rem;
          }

          .review-subtitle {
            font-size: 0.7rem;
          }

          .section-title {
            font-size: 0.85rem;
          }

          .field-label {
            font-size: 0.75rem;
          }

          .field-value {
            font-size: 0.75rem;
          }

          .btn {
            font-size: 0.75rem;
            padding: 0.4rem 0.5rem;
            min-height: 36px;
          }

          .external-item {
            min-width: 100px;
          }

          .images-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .image-card img {
            max-height: 100px;
          }
        }

        /* Pour écrans entre 480px et 768px */
        @media (min-width: 481px) and (max-width: 768px) {
          .review-container {
            padding: 0.5rem 1rem;
          }

          .images-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .image-card img {
            max-height: 130px;
          }
        }

        /* Ajustements desktop */
        @media (min-width: 769px) {
          .review-container {
            max-width: 1000px;
            margin: 2rem auto;
            padding: 0 1rem;
          }

          .review-header h2 {
            font-size: 1.5rem;
          }

          .review-subtitle {
            font-size: 1rem;
          }

          .field-label {
            font-size: 0.9rem;
          }

          .field-value {
            font-size: 0.9rem;
          }

          .image-card img {
            max-height: 180px;
          }

          .images-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }
        }
      `}</style>
    </div>
  );
};

export default ReviewData;