// components/ReviewData.jsx
import React, { useState} from 'react';
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
    // Initialiser avec les données extraites
    const initialData = {};

    if (extractedData?.extracted_data) {
      extractedData.extracted_data.forEach(item => {
        if (!item.label.endsWith('_ar')) {
          initialData[item.label] = item.text;
        }
      });
    }

    // Ajouter les données du formulaire, mais NE PAS ÉCRASER les données extraites
    // avec des chaînes vides
    if (formData) {
      Object.entries(formData).forEach(([key, value]) => {
        // N'écraser que si la valeur n'est pas vide
        if (value && value.trim() !== '') {
          initialData[key] = value;
        }
      });
    }

    return initialData;
  });

  // Log pour déboguer
  // useEffect(() => {
  //   console.log("📦 Données extraites reçues:", extractedData);
  //   console.log("📝 Données du formulaire:", formData);
  //   console.log("✏️ Données éditées initialisées:", editedData);
  // }, []);

  const [editMode, setEditMode] = useState({});
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [externalError, setExternalError] = useState(null);

  // Extraire les items du document (sans les champs arabes)
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
      // Préparer les données pour la validation
      const formDataToSend = new FormData();

      // Ajouter le session_id
      const sessionId = getSessionId();
      if (sessionId) {
        formDataToSend.append('session_id', sessionId);
      }

      // Ajouter les données OCR corrigées
      formDataToSend.append('data', JSON.stringify(editedData));

      // Ajouter les données MRZ si disponibles
      if (extractedData?.mrz_data && extractedData.mrz_data.length > 0) {
        formDataToSend.append('data_mrz', JSON.stringify(extractedData.mrz_data[0]));
      } else {
        formDataToSend.append('data_mrz', JSON.stringify({}));
      }

      // console.log("📤 Envoi pour validation:", {
      //   data: editedData,
      //   mrz: extractedData?.mrz_data?.[0]
      // });

      // Envoyer pour validation
      const result = await validationData(formDataToSend);
      // console.log("📥 Résultat validation:", result);

      setValidationResult(result);

      // Vérifier si toutes les données sont validées
      const allVerified = result.data_verified &&
        Object.values(result.data_verified).every(v => v.verified);

      if (allVerified) {
        // Si tout est validé, créer les données finales
        const validatedData = { ...editedData };

        // Mettre à jour avec les valeurs validées
        Object.entries(result.data_verified).forEach(([key, value]) => {
          if (value.value) {
            validatedData[key] = value.value;
          }
        });

        // Vérifier la correspondance avec les données externes
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

        // Appeler onConfirm avec les données validées et le résultat
        onConfirm(validatedData, result);
      } else {
        // Si certaines données ne sont pas validées, montrer les corrections
        setShowCorrections(true);

        // Mettre à jour editedData avec les valeurs MRZ quand c'est pertinent
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
      
      // Même en cas d'erreur API, on vérifie la correspondance externe avant de laisser passer
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

  const handleForceConfirm = () => {
    // Confirmer malgré les erreurs de validation
    onConfirm(editedData, validationResult);
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

  // Fonction pour obtenir le statut de validation d'un champ
  const getValidationStatus = (field) => {
    if (!validationResult?.data_verified) return null;
    return validationResult.data_verified[field] || null;
  };

  // Vérifier si tous les champs sont validés
  const allFieldsVerified = validationResult?.data_verified &&
    Object.values(validationResult.data_verified).every(v => v.verified);

  // Compter les champs validés
  const verifiedCount = validationResult?.data_verified
    ? Object.values(validationResult.data_verified).filter(v => v.verified).length
    : 0;

  const totalCount = validationResult?.data_verified
    ? Object.keys(validationResult.data_verified).length
    : 0;

  // Mapping des champs du document pour l'affichage (basé sur ce qui est effectivement extrait)
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
          Veuillez vérifier les informations ci-dessous. Vous pouvez modifier les champs si nécessaire.
        </p>
        {/* {extractedData?.session_id && (
          <p className="session-info">
            Session: {extractedData.session_id.substring(0, 8)}...
          </p>
        )} */}
      </div>

      {/* Message d'erreur de correspondance externe */}
      {externalError && (
        <div className="validation-summary error">
          <h4>❌ Erreur de correspondance</h4>
          <p>{externalError}</p>
          <p className="validation-help error">
            Veuillez corriger le Nom et le Prénom pour qu'ils correspondent exactement aux données attendues par le système.
          </p>
        </div>
      )}

      {/* Message de validation si disponible */}
      {validationResult && (
        <div className={`validation-summary ${allFieldsVerified ? 'success' : 'warning'}`}>
          <h4>Résultat de la validation</h4>
          <p>
            {allFieldsVerified ? (
              "✅ Toutes les données ont été validées avec succès !"
            ) : (
              `⚠️ ${verifiedCount}/${totalCount} champs validés automatiquement`
            )}
          </p>
          {!allFieldsVerified && (
            <p className="validation-help">
              Les champs en orange ont été corrigés automatiquement par les données MRZ.
              Veuillez vérifier et confirmer.
            </p>
          )}
        </div>
      )}

      {/* Données de référence de l'URL */}
      {externalData && (
        <div className="external-data-reference">
          <h3 className="section-title">
            <span className="section-icon">🔗</span>
            Données de référence (Système externe)
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
        {/* Section Document */}
        <div className="review-section">
          <h3 className="section-title">
            <span className="section-icon">📄</span>
            Informations extraites du document
          </h3>

          <div className="review-cards">
            {documentFields.map(field => {
              const extractedValue = getExtractedValue(field.key);
              const confidence = field.confidence * 100;
              const currentValue = editedData[field.key] || extractedValue || '';
              const validationStatus = getValidationStatus(field.key);
              
              // Comparaison avec les données externes (URL)
              const referenceValue = externalData?.[field.key];
              const hasDiscrepancy = referenceValue && currentValue && normalizeString(referenceValue) !== normalizeString(currentValue);

              // Déterminer la classe CSS en fonction de la validation et des données externes
              let cardClass = 'review-card';
              if (validationStatus) {
                cardClass += validationStatus.verified ? ' verified' : ' warning';
              }
              if (hasDiscrepancy) {
                cardClass += ' discrepancy';
              }

              return (
                <div
                  key={field.key}
                  className={cardClass}
                >
                  <div className="card-header">
                    <span className="field-label">{field.label}</span>
                    <span className="field-source">Document</span>
                    {validationStatus && (
                      <span className={`validation-badge ${validationStatus.verified ? 'success' : 'warning'}`}>
                        {validationStatus.verified ? '✓' : '⚠️'}
                      </span>
                    )}
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
                      <small>✓ Corrigé par MRZ: {validationStatus.mrz_value}</small>
                    </div>
                  )}

                  {referenceValue && (
                    <div className={`reference-info ${hasDiscrepancy ? 'error' : 'success'}`}>
                      <small>
                        {hasDiscrepancy ? '❌ Diffère du système: ' : '✅ Correspond au système: '}
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
                      Confiance: {confidence.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Images du document */}
      <div className="document-images">
        <h3 className="section-title">
          <span className="section-icon">🖼️</span>
          Images extraites
        </h3>
        <div className="images-grid">
          {extractedData?.photo && extractedData.photo !== 'N/A' && (
            <div className="image-card">
              <h4>Photo d'identité</h4>
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
              <h4>Zone MRZ</h4>
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

      {/* Boutons d'action */}
      <div className="review-actions">
        <button
          onClick={onEdit}
          className="btn btn-secondary"
          disabled={isProcessing || isValidating}
        >
          ← Modifier le formulaire
        </button>

        {validationResult && !allFieldsVerified ? (
          // Si validation effectuée mais pas tout validé
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
            {/* <button
              onClick={handleForceConfirm}
              className="btn btn-warning"
              disabled={isProcessing || isValidating}
            >
              Confirmer manuellement
            </button> */}
          </div>
        ) : (
          // Validation initiale ou tout est validé
          <button
            onClick={handleConfirmWithValidation}
            className="btn btn-primary"
            disabled={isProcessing || isValidating}
          >
            {isValidating ? (
              <>
                <span className="spinner-small"></span>
                Validation en cours...
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
          max-width: 1000px;
          margin: 2rem auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .review-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .review-header h2 {
          color: white;
          margin-bottom: 0.25rem;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .review-subtitle {
          color: rgba(255, 255, 255, 0.9);
          font-size: 1rem;
        }

        .session-info {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.9rem;
          margin-top: 0.5rem;
        }

        .validation-summary {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
          border-left: 4px solid;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
          margin: 0 0 0.5rem;
          color: #333;
        }

        .validation-summary p {
          margin: 0.5rem 0;
          color: #666;
        }

        .validation-help {
          font-size: 0.9rem;
          color: #FF9800;
          background: #fff3e0;
          padding: 0.5rem;
          border-radius: 4px;
        }

        .validation-help.error {
          color: #f44336;
          background: #ffebee;
        }

        .review-grid {
          display: block;
          margin-bottom: 1rem;
        }

        .review-section {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .external-data-reference {
          background: #e3f2fd;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
          border-left: 4px solid #2196f3;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .external-data-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .external-item {
          display: flex;
          flex-direction: column;
        }

        .external-label {
          font-size: 0.8rem;
          color: #1976d2;
          font-weight: bold;
          text-transform: uppercase;
        }

        .external-value {
          font-size: 1rem;
          color: #333;
          font-weight: 500;
        }

        .section-note {
          font-size: 0.9rem;
          color: #666;
          margin-top: -1rem;
          margin-bottom: 1rem;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 1rem;
          color: #333;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .section-icon {
          font-size: 1.5rem;
        }

        .review-cards {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .review-card {
          background: #f8f9fa;
          border-radius: 6px;
          padding: 0.75rem;
          transition: all 0.3s ease;
          position: relative;
          border-left: 4px solid transparent;
        }

        .review-card.user-card {
          background: #fff3e0;
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
          margin-bottom: 0.5rem;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .field-label {
          font-weight: 600;
          color: #333;
        }

        .field-source {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          background: #e0e0e0;
          color: #666;
        }

        .field-source.user {
          background: #ff9800;
          color: white;
        }

        .validation-badge {
          font-size: 0.9rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
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
          margin: 0.5rem 0;
          padding: 0.5rem;
          background: #e8f5e9;
          border-radius: 4px;
          color: #2e7d32;
          font-size: 0.85rem;
          border-left: 3px solid #4CAF50;
        }

        .reference-info {
          margin: 0.5rem 0;
          padding: 0.5rem;
          border-radius: 4px;
          font-size: 0.85rem;
          border-left: 3px solid;
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
          margin-bottom: 0.5rem;
        }

        .view-mode {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .field-value {
          color: #666;
          word-break: break-word;
          font-size: 0.9rem;
        }

        .edit-btn {
          background: none;
          border: none;
          font-size: 1.2rem;
          cursor: pointer;
          opacity: 0.5;
          transition: all 0.3s ease;
          padding: 0.3rem 0.6rem;
          border-radius: 4px;
        }

        .edit-btn:hover {
          opacity: 1;
          transform: scale(1.1);
          background: #e0e0e0;
        }

        .edit-mode {
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
        }

        .edit-input {
          flex: 1;
          padding: 0.5rem;
          border: 2px solid #667eea;
          border-radius: 4px;
          font-size: 0.95rem;
          outline: none;
        }

        .edit-input:focus {
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
        }

        .edit-actions {
          display: flex;
          gap: 0.25rem;
        }

        .save-btn,
        .cancel-btn {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1.1rem;
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
          transform: scale(1.05);
        }

        .cancel-btn {
          background: #f44336;
          color: white;
        }

        .cancel-btn:hover {
          background: #d32f2f;
          transform: scale(1.05);
        }

        .card-footer {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 0.5rem;
        }

        .confidence-bar {
          flex: 1;
          height: 6px;
          background: #e0e0e0;
          border-radius: 3px;
          overflow: hidden;
        }

        .confidence-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        .confidence-text {
          font-size: 0.8rem;
          color: #666;
          min-width: 80px;
          text-align: right;
        }

        .document-images {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .images-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 1rem;
          margin-top: 1rem;
        }

        .image-card {
          text-align: center;
          background: #f8f9fa;
          padding: 0.75rem;
          border-radius: 6px;
          transition: transform 0.2s ease;
        }

        .image-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }

        .image-card h4 {
          margin: 0 0 0.5rem;
          color: #666;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .image-card img {
          width: 100%;
          max-height: 250px; /* Allow taller images to be visible without taking too much space */
          object-fit: contain; /* Ensure the whole image is visible without cropping */
          border-radius: 6px;
          border: 2px solid #e0e0e0;
          background: #f0f0f0; /* Slight gray background to distinguish boundaries of transparent/white images */
        }

        .review-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-top: 2rem;
          flex-wrap: wrap;
        }

        .button-group {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          box-shadow: 0 4px 6px rgba(102, 126, 234, 0.2);
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(102, 126, 234, 0.3);
        }

        .btn-warning {
          background: #FF9800;
          color: white;
          box-shadow: 0 4px 6px rgba(255, 152, 0, 0.2);
        }

        .btn-warning:hover:not(:disabled) {
          background: #F57C00;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(255, 152, 0, 0.3);
        }

        .btn-secondary {
          background: white;
          color: #333;
          border: 1px solid #ddd;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f5f5f5;
          transform: translateY(-1px);
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spinner-small {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 0.5rem;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 768px) {
          .review-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .review-actions {
            flex-direction: column;
          }

          .button-group {
            flex-direction: column;
            width: 100%;
          }

          .btn {
            width: 100%;
          }

          .card-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .images-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default ReviewData;