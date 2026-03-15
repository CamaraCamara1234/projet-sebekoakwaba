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
        "nom_ar",
        "prenom_ar",
        "nationalite_ar",
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
    <div className="data-table-section">
      <h3>{title}</h3>
      {Object.entries(groupedData).map(([category, items]) => {
        if (items.length === 0) return null;

        return (
          <div key={category} className="data-category">
            <h4>{category}</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Champ</th>
                  <th>Valeur</th>
                  <th>Confiance</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td className="field-name">{formatLabel(item.label)}</td>
                    <td className="field-value">{item.text || "N/A"}</td>
                    <td className="field-confidence">
                      <div className="confidence-bar">
                        <div
                          className="confidence-fill"
                          style={{ width: `${item.confidence * 100}%` }}
                        ></div>
                        <span>{Math.round(item.confidence * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

const formatLabel = (label) => {
  const labels = {
    nom: "Nom",
    prenom: "Prénom",
    nom_ar: "Nom (arabe)",
    prenom_ar: "Prénom (arabe)",
    date_naissance: "Date de naissance",
    date_expiration: "Date d'expiration",
    nationalite: "Nationalité",
    nationalite_ar: "Nationalité (arabe)",
    cin: "Numéro CIN",
    code: "Code MRZ",
    sexe: "Sexe",
    adresse: "Adresse",
    adresse_ar: "Adresse (arabe)",
    motif_sejour: "Motif de séjour",
    motif_sejour_ar: "Motif de séjour (arabe)",
    pere: "pere",
    pere_ar: "pere (arabe)",
    mere: "mere",
    mere_ar: "mere (arabe)",
    num_etat_civil: "numero d'etat civil",
  };

  return labels[label] || label;
};

export default DataTable;
