import React from 'react';

const MRZSection = ({ mrzData }) => {
  if (!mrzData || mrzData.length === 0) return null;

  return (
    <div className="mrz-section">
      <h3>Données MRZ</h3>
      <div className="mrz-cards">
        {mrzData.map((mrz, index) => (
          <div key={index} className="mrz-card">
            <div className="mrz-row">
              <span>Numéro CIN:</span>
              <strong>{mrz.passeport_mrz}</strong>
            </div>
            <div className="mrz-row">
              <span>Nom:</span>
              <strong>{mrz.nom_mrz}</strong>
            </div>
            <div className="mrz-row">
              <span>Prénom:</span>
              <strong>{mrz.prenom_mrz}</strong>
            </div>
            <div className="mrz-row">
              <span>Date de naissance:</span>
              <strong>{mrz.date_naiss_mrz}</strong>
            </div>
            <div className="mrz-row">
              <span>Date d'expiration:</span>
              <strong>{mrz.date_exp_mrz}</strong>
            </div>
            <div className="mrz-row">
              <span>Sexe:</span>
              <strong>{mrz.sexe_mrz}</strong>
            </div>
            <div className="mrz-row">
              <span>Pays:</span>
              <strong>{mrz.pays}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MRZSection;