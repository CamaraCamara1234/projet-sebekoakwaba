// components/UnifiedRegistrationForm.jsx
import React, { useState, useRef } from 'react';


const RegistrationForm = ({ onSubmit, initialData, isUploading }) => {
  const [formData, setFormData] = useState({
    nom: initialData?.nom || '',
    prenom: initialData?.prenom || '',
    date_naissance: initialData?.date_naissance || '',
    lieu_naissance: initialData?.lieu_naissance || '',
    nationalite: initialData?.nationalite || '',
    numero_piece: initialData?.numero_piece || '',
    type_piece: initialData?.type_piece || 'cni',
    type_piece: initialData?.type_piece || 'cni',
  });

  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const fileInputRef = useRef(null);

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


  return (
    <div className="unified-form-container">
      <div className="form-header">
        <h2>Vérification d'identité</h2>
        <p className="form-subtitle">
          Veuillez uploader votre pièce d'identité pour démarrer l'extraction des données.<br />
          CNI (recto et verso), Titre séjour (recto et verso) ou le passeport
        </p>
      </div>

      <form onSubmit={handleSubmit} className="unified-form">
        {/* Section Upload du document */}
        <div className="form-section document-section">
          <h3 className="section-title">
            <span className="section-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </span>
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
                <div className="upload-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <p className="upload-title">Déposez votre document ici</p>
                <p className="upload-subtitle">ou cliquez pour parcourir vos fichiers</p>
                <div className="upload-badges">
                  <span className="badge">JPG</span>
                  <span className="badge">PNG</span>
                  <span className="badge">JPEG</span>
                </div>
                <p className="upload-hint">Recto et verso recommandés pour la carte séjour et la CNI</p>
              </div>
            ) : (
              <div className="file-previews">
                {files.map((file, index) => (
                  <div key={index} className="file-preview-card">
                    <div className="preview-image-container">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Document ${index + 1}`}
                        className="preview-image"
                      />
                      <div className="preview-overlay">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="remove-btn-premium"
                          title="Supprimer"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="file-info">
                      <span className="file-name">{file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name}</span>
                      <span className="file-type-badge">
                        {index === 0 ? 'FACE 1' : 'FAACE 2'}
                      </span>
                    </div>
                  </div>
                ))}
                {files.length === 1 && (
                  <div
                    className="add-more-card"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current.click();
                    }}
                  >
                    <div className="add-icon-wrapper">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </div>
                    <span>Face 2 (si CNI ou CARTE SEJOUR)</span>
                  </div>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              accept="image/jpeg,image/png,application/pdf"
              style={{ display: 'none' }}
            />
          </div>
          {errors.document && (
            <div className="error-container-premium">
              <span className="error-icon">⚠️</span>
              <span className="error-message">{errors.document}</span>
            </div>
          )}
        </div>

        {/* Bouton de soumission */}
        <div className="form-actions">
          <button
            type="submit"
            className="btn-premium"
            disabled={isUploading}
          >
            {isUploading ? (
              <div className="loader-container">
                <span className="spinner-premium"></span>
                <span>Traitement...</span>
              </div>
            ) : (
              <>
                <span>Démarrer l'extraction</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </>
            )}
          </button>
        </div>
      </form>

      <style jsx="true">{`
        .unified-form-container {
          max-width: 850px;
          margin: 3rem auto;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          box-shadow: 
            0 20px 50px rgba(0, 0, 0, 0.1),
            0 0 0 1px rgba(255, 255, 255, 0.5) inset;
          overflow: hidden;
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .form-header {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          padding: 3rem 2rem;
          text-align: center;
          position: relative;
        }

        .form-header::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 50px;
          background: linear-gradient(to top, rgba(255,255,255,0.1), transparent);
          pointer-events: none;
        }

        .form-header h2 {
          margin: 0 0 1rem;
          font-size: 2.5rem;
          font-weight: 800;
          letter-spacing: -0.025em;
        }

        .form-subtitle {
          margin: 0;
          opacity: 0.9;
          font-size: 1.1rem;
          line-height: 1.6;
          max-width: 600px;
          margin: 0 auto;
        }

        .unified-form {
          padding: 3rem;
        }

        .form-section {
          margin-bottom: 2rem;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          color: #1f2937;
          font-size: 1.4rem;
          font-weight: 700;
        }

        .section-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: #eef2ff;
          color: #4f46e5;
          border-radius: 10px;
        }

        .drop-zone {
          border: 2px dashed #d1d5db;
          border-radius: 20px;
          padding: 3rem 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          background: rgba(249, 250, 251, 0.5);
          position: relative;
          overflow: hidden;
        }

        .drop-zone:hover {
          border-color: #4f46e5;
          background: #f5f7ff;
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(79, 70, 229, 0.05);
        }

        .drop-zone.dragging {
          border-color: #4f46e5;
          background: rgba(79, 70, 229, 0.08);
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(79, 70, 229, 0); }
          100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
        }

        .upload-icon {
          color: #9ca3af;
          margin-bottom: 1.5rem;
          transition: transform 0.3s ease;
        }

        .drop-zone:hover .upload-icon {
          transform: translateY(-5px) scale(1.1);
          color: #4f46e5;
        }

        .upload-title {
          font-size: 1.3rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.5rem;
        }

        .upload-subtitle {
          color: #6b7280;
          margin-bottom: 1.5rem;
        }

        .upload-badges {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          color: #4b5563;
        }

        .upload-hint {
          font-size: 0.9rem;
          color: #9ca3af;
          font-style: italic;
        }

        .file-previews {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          width: 100%;
        }

        .file-preview-card {
          background: white;
          border-radius: 16px;
          padding: 0.75rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          border: 1px solid #f3f4f6;
          transition: all 0.3s ease;
          animation: fadeIn 0.4s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .preview-image-container {
          position: relative;
          width: 100%;
          height: 140px;
          border-radius: 12px;
          overflow: hidden;
          background: #f9fafb;
        }

        .preview-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .preview-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.2);
          opacity: 0;
          transition: opacity 0.3s ease;
          display: flex;
          justify-content: flex-end;
          padding: 0.5rem;
        }

        .file-preview-card:hover .preview-overlay {
          opacity: 1;
        }

        .remove-btn-premium {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: white;
          color: #ef4444;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .remove-btn-premium:hover {
          transform: scale(1.2) rotate(90deg);
          background: #ef4444;
          color: white;
        }

        .file-info {
          padding: 0.75rem 0.25rem 0.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .file-name {
          font-size: 0.85rem;
          font-weight: 600;
          color: #374151;
        }

        .file-type-badge {
          font-size: 0.7rem;
          font-weight: 800;
          color: #4f46e5;
          letter-spacing: 0.05em;
          padding: 0.15rem 0.5rem;
          background: #eef2ff;
          border-radius: 4px;
          align-self: flex-start;
        }

        .add-more-card {
          height: 200px;
          border: 2px dashed #e5e7eb;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          color: #6b7280;
          transition: all 0.3s ease;
          font-weight: 600;
          font-size: 0.95rem;
        }

        .add-more-card:hover {
          background: #f9fafb;
          border-color: #4f46e5;
          color: #4f46e5;
        }

        .add-icon-wrapper {
          width: 48px;
          height: 48px;
          background: #f3f4f6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .add-more-card:hover .add-icon-wrapper {
          background: #eef2ff;
          transform: rotate(90deg);
        }

        .form-actions {
          margin-top: 3rem;
          display: flex;
          justify-content: center;
        }

        .btn-premium {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem 3rem;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 1.2rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 10px 25px rgba(79, 70, 229, 0.3);
        }

        .btn-premium:hover:not(:disabled) {
          transform: translateY(-5px);
          box-shadow: 0 15px 35px rgba(79, 70, 229, 0.4);
        }

        .btn-premium:active {
          transform: translateY(-2px);
        }

        .btn-premium:disabled {
          background: #9ca3af;
          box-shadow: none;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .loader-container {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .spinner-premium {
          width: 24px;
          height: 24px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-container-premium {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #fef2f2;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          border: 1px solid #fee2e2;
          margin-top: 1rem;
          animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }

        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }

        .error-icon { font-size: 1.2rem; }

        .error-message {
          color: #ef4444;
          font-weight: 600;
          font-size: 0.9rem;
        }

        @media (max-width: 768px) {
          .unified-form-container { margin: 1rem; }
          .form-header { padding: 2rem 1.5rem; }
          .form-header h2 { font-size: 1.8rem; }
          .unified-form { padding: 1.5rem; }
          .btn-premium { width: 100%; justify-content: center; }
          .file-previews { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default RegistrationForm;