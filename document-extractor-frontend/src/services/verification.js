// services/verification.js
const API_BASE = 'http://localhost:8000';

// Fonction utilitaire pour normaliser les dates (format JJ/MM/AAAA)
const normalizeDate = (dateStr) => {
  if (!dateStr) return '';
  
  // Si c'est au format AAAA-MM-JJ (input date)
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

// Fonction de comparaison des données (côté client)
export const compareExtractedData = (formData, extractedData) => {
  const results = {
    nom: false,
    prenom: false,
    date_naissance: false,
    nationalite: false,
    cin: false,
    allMatch: false
  };

  if (!extractedData || !Array.isArray(extractedData)) {
    return results;
  }

  // Fonction helper pour nettoyer et comparer les chaînes
  const normalizeString = (str) => {
    if (!str) return '';
    return str.toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, ''); // Enlever la ponctuation
  };

  // Créer un dictionnaire des données extraites pour un accès facile
  const extractedMap = {};
  extractedData.forEach(item => {
    if (item.label && item.text) {
      extractedMap[item.label] = item.text;
    }
  });

  // Comparaison du nom
  if (formData.nom && extractedMap.nom) {
    results.nom = normalizeString(formData.nom) === normalizeString(extractedMap.nom);
  }

  // Comparaison du prénom
  if (formData.prenom && extractedMap.prenom) {
    results.prenom = normalizeString(formData.prenom) === normalizeString(extractedMap.prenom);
  }

  // Comparaison de la date de naissance
  if (formData.date_naissance && extractedMap.date_naissance) {
    const formDate = normalizeDate(formData.date_naissance);
    results.date_naissance = formDate === extractedMap.date_naissance;
  }

  // Comparaison de la nationalité
  if (formData.nationalite && extractedMap.nationalite) {
    results.nationalite = normalizeString(formData.nationalite) === normalizeString(extractedMap.nationalite);
  }

  // Comparaison du numéro CIN
  if (formData.numero_piece && extractedMap.cin) {
    results.cin = normalizeString(formData.numero_piece) === normalizeString(extractedMap.cin);
  }

  // Vérifier si tous les champs correspondent
  results.allMatch = results.nom && results.prenom && 
                     results.date_naissance && results.cin;

  return results;
};