// components/UnifiedRegistrationForm.jsx
import React, { useState, useRef } from 'react';


const UnifiedRegistrationForm = ({ onSubmit, initialData, isUploading }) => {
  const [formData, setFormData] = useState({
    // Champs du document (seront extraits plus tard)
    nom: initialData?.nom || '',
    prenom: initialData?.prenom || '',
    date_naissance: initialData?.date_naissance || '',
    lieu_naissance: initialData?.lieu_naissance || '',
    nationalite: initialData?.nationalite || '',
    numero_piece: initialData?.numero_piece || '',
    type_piece: initialData?.type_piece || 'cni',
    
    // Champs complémentaires (non sur la pièce)
    email: initialData?.email || '',
    telephone: initialData?.telephone || '',
    adresse: initialData?.adresse || '',
    profession: initialData?.profession || '',
    situation_matrimoniale: initialData?.situation_matrimoniale || '',
  });

  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleFileChange = (e) => {
  const newFiles = Array.from(e.target.files);
  if (newFiles.length > 0) {
    setFiles(prevFiles => {
      const combinedFiles = [...prevFiles, ...newFiles];
      return combinedFiles.slice(0, 2);
    });
    setErrors(prev => ({ ...prev, document: null }));
  }
};

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const newFiles = Array.from(e.dataTransfer.files);
    if (newFiles.length > 0) {
      setFiles(newFiles.slice(0, 2));
      setErrors(prev => ({ ...prev, document: null }));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (index) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const validateForm = () => {
    const newErrors = {};

    // Validation des champs obligatoires
    if (!formData.email) {
      newErrors.email = 'L\'email est requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalide';
    }

    if (formData.telephone && !/^[0-9+\-\s]{8,15}$/.test(formData.telephone)) {
      newErrors.telephone = 'Format de téléphone invalide';
    }

    // Validation du document
    if (files.length === 0) {
      newErrors.document = 'Veuillez uploader votre pièce d\'identité';
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

    onSubmit({
      formData,
      files
    });
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const getFieldClass = (field) => {
    if (!touched[field]) return '';
    return errors[field] ? 'error' : 'valid';
  };

  return (
    <div className="unified-form-container">
      <div className="form-header">
        <h2>Inscription</h2>
        <p className="form-subtitle">
          Veuillez uploader votre pièce d'identité et compléter les informations manquantes.<br/>
          CNI (recto et verso), Titre séjour (recto et verso) ou le passeport
        </p>
      </div>

      <form onSubmit={handleSubmit} className="unified-form">
        {/* Section Upload du document */}
        <div className="form-section document-section">
          <h3 className="section-title">
            <span className="section-icon">📄</span>
            Pièce d'identité
          </h3>
          
          <div 
            className={`drop-zone ${isDragging ? 'dragging' : ''} ${files.length > 0 ? 'has-files' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={files.length === 0 ? () => fileInputRef.current.click() : undefined}
          >
            {files.length === 0 ? (
              <div className="upload-prompt">
                <div className="upload-icon">📁</div>
                <p className="upload-title">Glissez-déposez votre/vos document(s)</p>
                <p className="upload-subtitle">ou cliquez pour parcourir</p>
                <p className="upload-hint">Formats: JPG, PNG (recto et verso si disponible)</p>
              </div>
            ) : (
              <div className="file-previews">
                {files.map((file, index) => (
                  <div key={index} className="file-preview">
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt={`Document ${index + 1}`}
                      className="preview-image"
                    />
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="remove-button"
                    >
                      ×
                    </button>
                    <span className="file-label">
                      {index === 0 ? 'Recto' : 'Verso'}
                    </span>
                  </div>
                ))}
                {files.length === 1 && (
                  <div 
                    className="add-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current.click();
                    }}
                  >
                    <span className="add-icon">+</span>
                    <span>Ajouter verso</span>
                  </div>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              accept="image/jpeg,image/png"
              style={{ display: 'none' }}
            />
          </div>
          {errors.document && (
            <span className="error-message">{errors.document}</span>
          )}
        </div>
        {/* Section Informations complémentaires (saisies par l'utilisateur) */}
        <div className="form-section">
          <h3 className="section-title">
            <span className="section-icon">✏️</span>
            Informations complémentaires
          </h3>
          <p className="section-note">
            Veuillez remplir les informations ci-dessous
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="email">
                Email <span className="required">*</span>
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={() => handleBlur('email')}
                className={getFieldClass('email')}
                placeholder="exemple@email.com"
              />
              {touched.email && errors.email && (
                <span className="error-message">{errors.email}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="telephone">Téléphone</label>
              <input
                type="tel"
                id="telephone"
                name="telephone"
                value={formData.telephone}
                onChange={handleChange}
                onBlur={() => handleBlur('telephone')}
                className={getFieldClass('telephone')}
                placeholder="+212 6 12 34 56 78"
              />
              {touched.telephone && errors.telephone && (
                <span className="error-message">{errors.telephone}</span>
              )}
            </div>

            <div className="form-group full-width">
              <label htmlFor="adresse">Adresse postale</label>
              <textarea
                id="adresse"
                name="adresse"
                value={formData.adresse}
                onChange={handleChange}
                rows="3"
                placeholder="Votre adresse complète"
              />
            </div>

            <div className="form-group">
              <label htmlFor="profession">Profession</label>
              <input
                type="text"
                id="profession"
                name="profession"
                value={formData.profession}
                onChange={handleChange}
                placeholder="Votre profession"
              />
            </div>

            <div className="form-group">
              <label htmlFor="situation_matrimoniale">Situation matrimoniale</label>
              <select
                id="situation_matrimoniale"
                name="situation_matrimoniale"
                value={formData.situation_matrimoniale}
                onChange={handleChange}
              >
                <option value="">Sélectionnez</option>
                <option value="celibataire">Célibataire</option>
                <option value="marie">Marié(e)</option>
                <option value="divorce">Divorcé(e)</option>
                <option value="veuf">Veuf(ve)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bouton de soumission */}
        <div className="form-actions">
          <button 
            type="submit" 
            className="btn btn-primary btn-large"
            disabled={isUploading}
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
        }

        .unified-form {
          padding: 2rem;
        }

        .form-section {
          margin-bottom: 2.5rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid #e0e0e0;
        }

        .form-section:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
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

        .section-note {
          color: #666;
          font-size: 0.9rem;
          margin: -0.5rem 0 1.5rem;
          font-style: italic;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-group {
          margin-bottom: 0.5rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #333;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.3s ease;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-group input.error,
        .form-group select.error,
        .form-group textarea.error {
          border-color: #f44336;
        }

        .form-group input.valid {
          border-color: #4CAF50;
        }

        .extracted-field {
          background: #f5f5f5;
          cursor: not-allowed;
          color: #666;
        }

        .field-note {
          display: block;
          margin-top: 0.25rem;
          font-size: 0.8rem;
          color: #ff9800;
        }

        .required {
          color: #f44336;
        }

        .error-message {
          display: block;
          margin-top: 0.25rem;
          font-size: 0.85rem;
          color: #f44336;
        }

        .drop-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          background: #fafafa;
          margin-bottom: 0.5rem;
        }

        .drop-zone.dragging {
          border-color: #667eea;
          background: rgba(102, 126, 234, 0.05);
        }

        .drop-zone.has-files {
          padding: 1rem;
        }

        .upload-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .upload-title {
          font-size: 1.1rem;
          font-weight: 500;
          margin: 0 0 0.5rem;
          color: #333;
        }

        .upload-subtitle {
          margin: 0 0 0.5rem;
          color: #666;
        }

        .upload-hint {
          margin: 0;
          font-size: 0.85rem;
          color: #999;
        }

        .file-previews {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .file-preview {
          position: relative;
          width: 120px;
          height: 120px;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid #e0e0e0;
        }

        .preview-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .remove-button {
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
        }

        .remove-button:hover {
          background: #f44336;
          transform: scale(1.1);
        }

        .file-label {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 0.25rem;
          font-size: 0.75rem;
          text-align: center;
        }

        .add-more {
          width: 120px;
          height: 120px;
          border: 2px dashed #ccc;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
          color: #666;
        }

        .add-more:hover {
          border-color: #667eea;
          color: #667eea;
        }

        .add-icon {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .form-actions {
          display: flex;
          justify-content: center;
          margin-top: 2rem;
        }

        .btn {
          padding: 0.75rem 2rem;
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

        .btn-large {
          padding: 1rem 3rem;
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

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }

          .form-header {
            padding: 1.5rem;
          }

          .form-header h2 {
            font-size: 1.5rem;
          }

          .unified-form {
            padding: 1rem;
          }

          .file-previews {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default UnifiedRegistrationForm;