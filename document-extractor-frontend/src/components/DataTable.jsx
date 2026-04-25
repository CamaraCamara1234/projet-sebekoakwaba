import React from "react";

const DataTable = ({ data, title }) => {
  if (!data || data.length === 0) return null;

  // Grouper les données par catégorie
  const groupedData = {
    "Informations personnelles": [],
    "Détails du document": [],
    Autres: [],
  };

  data.forEach((item) => {
    if (
      [
        "nom",
        "prenom",
        "date_naissance",
        "sexe",
        "nationalite",
      ].includes(item.label)
    ) {
      groupedData["Informations personnelles"].push(item);
    } else if (["cin", "date_expiration", "code"].includes(item.label)) {
      groupedData["Détails du document"].push(item);
    } else {
      groupedData["Autres"].push(item);
    }
  });

  return (
    <div className="e-id-container">
      <div className="e-id-card">
        <div className="e-id-header">
          <div className="header-titles">
            <h2>AUTHENTIFICATION ÉLECTRONIQUE</h2>
            <p>SYSTÈME D'IDENTIFICATION OFFICIEL</p>
          </div>
          {/* <div className="validation-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            VÉRIFIÉ
          </div> */}
        </div>

        <div className="e-id-alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Zone sécurisée. Vérifiez l'URL avant de confirmer les informations.
        </div>

        <div className="e-id-content">
          {Object.entries(groupedData).map(([category, items]) => {
            if (items.length === 0) return null;

            return (
              <div key={category} className="e-id-section">
                {/* <h4 className="section-title">{category}</h4> */}
                <div className="info-list">
                  {items.map((item, index) => (
                    <div className="info-row" key={index}>
                      <span className="info-label">{formatLabel(item.label)}</span>
                      <span className="info-value">{item.text || "N/A"}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="e-id-footer">
          <div className="footer-text">
            Identifiant de vérification unique généré le {new Date().toLocaleDateString('fr-FR')} •
          </div>
          <div className="qr-code-placeholder">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1"></rect>
              <rect x="3" y="14" width="7" height="7" rx="1"></rect>
              <path d="M7 7h.01"></path>
              <path d="M18 7h.01"></path>
              <path d="M18 18h.01"></path>
              <path d="M7 18h.01"></path>
              <path d="M9 3v4"></path>
              <path d="M15 3v4"></path>
              <path d="M9 17v4"></path>
              <path d="M15 17v4"></path>
              <path d="M3 9h4"></path>
              <path d="M17 9h4"></path>
              <path d="M3 15h4"></path>
              <path d="M17 15h4"></path>
            </svg>
          </div>
        </div>
      </div>
      <style jsx="true">{`
        .e-id-container {
          padding: 1rem 0;
          display: flex;
          justify-content: center;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        .e-id-card {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
          width: 100%;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.05);
          transition: transform 0.3s ease;
        }

        .e-id-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 50px rgba(0, 0, 0, 0.12), 0 3px 10px rgba(0, 0, 0, 0.08);
        }

        .e-id-header {
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          color: white;
          padding: 24px 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: relative;
          overflow: hidden;
        }

        .e-id-header::after {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          background: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+CgkJPGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPgoJPC9zdmc+') repeat;
          opacity: 0.5;
          pointer-events: none;
        }

        .header-titles {
          position: relative;
          z-index: 1;
        }

        .header-titles h2 {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        .header-titles p {
          margin: 6px 0 0;
          font-size: 0.65rem;
          opacity: 0.85;
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 500;
        }

        .validation-badge {
          position: relative;
          z-index: 1;
          background: rgba(255, 255, 255, 0.15);
          padding: 6px 12px;
          border-radius: 30px;
          font-size: 0.75rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }

        .e-id-alert {
          background: #fff5f5;
          color: #d32f2f;
          padding: 12px 28px;
          font-size: 0.8rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #ffebee;
        }

        .e-id-content {
          padding: 28px;
          background-color: #ffffff;
        }

        .e-id-section {
          margin-bottom: 24px;
        }

        .e-id-section:last-child {
          margin-bottom: 0;
        }

        .section-title {
          font-size: 0.75rem;
          color: #1976d2;
          text-transform: uppercase;
          margin: 0 0 16px;
          font-weight: 700;
          letter-spacing: 0.8px;
          border-bottom: 2px solid #e3f2fd;
          padding-bottom: 6px;
          display: inline-block;
        }

        .info-list {
          display: flex;
          flex-direction: column;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px dashed #e0e0e0;
          transition: all 0.2s ease;
        }

        .info-row:last-child {
          border-bottom: none;
        }

        .info-row:hover {
          padding-left: 10px;
          padding-right: 10px;
          background-color: #f8f9fa;
          border-radius: 6px;
          border-bottom-color: transparent;
        }

        .info-label {
          color: #1577d8ff;
          font-size: 0.85rem;
          font-weight: 600;
          flex: 1;
        }

        .info-value {
          color: #1a202c;
          font-size: 0.95rem;
          font-weight: 700;
          text-align: right;
          flex: 1.5;
          word-break: break-word;
        }

        .e-id-footer {
          padding: 16px 28px;
          background: #f8f9fa;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid #edf2f7;
        }

        .footer-text {
          color: #a0aec0;
          font-size: 0.65rem;
          line-height: 1.5;
          max-width: 80%;
        }

        .qr-code-placeholder {
          color: #cbd5e0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 480px) {
          .e-id-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
            padding: 20px;
          }

          .header-titles h2 {
            font-size: 1rem;
          }

          .validation-badge {
            align-self: flex-start;
          }

          .e-id-content {
            padding: 20px;
          }

          .info-row {
            padding: 12px 0;
          }

          .info-row:hover {
            padding-left: 0;
            padding-right: 0;
            background-color: transparent;
          }

          .info-value {
            text-align: right;
            font-size: 0.85rem;
          }
          
          .info-label {
            font-size: 0.75rem;
          }

          .e-id-footer {
            flex-direction: column-reverse;
            gap: 12px;
            align-items: flex-start;
            padding: 20px;
          }

          .footer-text {
            max-width: 100%;
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
    nini: "Numero d'identification nationale",
    motif_sejour: "Motif de séjour"
  };

  return labels[label] || label;
};

export default DataTable;
