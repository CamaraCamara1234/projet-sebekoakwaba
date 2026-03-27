// services/api.js
const API_BASE = 'https://jonna-unstrung-sickeningly.ngrok-free.dev';

// Clé pour le localStorage
const SESSION_ID_KEY = 'secureid_session_id';

// Fonction pour sauvegarder le session_id
export const saveSessionId = (sessionId) => {
  if (sessionId) {
    localStorage.setItem(SESSION_ID_KEY, sessionId);
    console.log('Session ID sauvegardé:', sessionId);
  }
};

// Fonction pour récupérer le session_id
export const getSessionId = () => {
  return localStorage.getItem(SESSION_ID_KEY);
};

// Fonction pour effacer le session_id
export const clearSessionId = () => {
  localStorage.removeItem(SESSION_ID_KEY);
  console.log('Session ID effacé');
};

// Fonction utilitaire pour gérer les réponses
const handleResponse = async (response) => {
  const contentType = response.headers.get('content-type');

  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();

    // Si la réponse contient un session_id, le sauvegarder
    if (data.session_id) {
      saveSessionId(data.session_id);
    }

    return data;
  }

  const text = await response.text();
  console.error('Réponse non-JSON reçue:', text.substring(0, 200));

  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new Error(`Le serveur a retourné une page HTML (code ${response.status}). Vérifiez que le backend est bien démarré sur ${API_BASE}`);
  }

  throw new Error(`Réponse inattendue du serveur: ${text.substring(0, 100)}`);
};

// Fonction pour construire les URLs des images avec session
export const getImageUrl = (path) => {
  if (!path || path === "N/A") return null;
  if (path.startsWith('http')) return path;

  const sessionId = getSessionId();
  const baseUrl = 'https://jonna-unstrung-sickeningly.ngrok-free.dev';

  // Construire l'URL de base
  let imageUrl = `${baseUrl}${path}`;

  // Ajouter les paramètres
  const params = [];

  if (sessionId) {
    params.push(`session_id=${sessionId}`);
  }

  // Ajout du paramètre pour ignorer l'avertissement ngrok
  params.push(`ngrok-skip-browser-warning=1`);

  // Ajouter un timestamp pour éviter le cache
  params.push(`t=${Date.now()}`);

  if (params.length > 0) {
    imageUrl = `${imageUrl}?${params.join('&')}`;
  }

  // console.log('URL générée:', imageUrl);
  return imageUrl;
};

// Extraction simple (recto seul)
export const extractSingleDocument = async (formData) => {
  try {
    console.log('Envoi requête à:', `${API_BASE}/extraction_front/`);

    const response = await fetch(`${API_BASE}/extraction_front/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      try {
        const errorData = await handleResponse(response);
        throw new Error(errorData.message || `Erreur HTTP ${response.status}`);
      } catch (e) {
        throw new Error(`Erreur serveur (${response.status}): Vérifiez que le backend est accessible`);
      }
    }

    return await handleResponse(response);
  } catch (error) {
    console.error('Erreur détaillée:', error);
    throw error;
  }
};

// Extraction recto-verso
export const extractDualDocuments = async (formData) => {
  try {
    console.log('Envoi requête à:', `${API_BASE}/extraction_dual/`);

    const response = await fetch(`${API_BASE}/extraction_dual/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      try {
        const errorData = await handleResponse(response);
        throw new Error(errorData.message || `Erreur HTTP ${response.status}`);
      } catch (e) {
        throw new Error(`Erreur serveur (${response.status}): Vérifiez que le backend est accessible`);
      }
    }

    return await handleResponse(response);
  } catch (error) {
    console.error('Erreur détaillée:', error);
    throw error;
  }
};

// Vérification faciale simple
export const verifyFaces = async (imageFile) => {
  const formData = new FormData();
  formData.append('image', imageFile);

  // Ajouter le session_id s'il existe
  const sessionId = getSessionId();
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  try {
    const response = await fetch(`${API_BASE}/face_verification/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la vérification faciale');
    }

    return await response.json();
  } catch (error) {
    console.error('Face verification error:', error);
    throw error;
  }
};


// advenced face verification
export const AdvencedverifyFaces = async (imageFile) => {
  const formData = new FormData();
  formData.append('image', imageFile);

  // Ajouter le session_id s'il existe
  const sessionId = getSessionId();
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  try {
    const response = await fetch(`${API_BASE}/advenced_face_verification/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la vérification faciale');
    }

    return await response.json();
  } catch (error) {
    console.error('Face verification error:', error);
    throw error;
  }
};

export const validationData = async (formData) => {
  // formData.append('session_id', getSessionId());

  try {
    const response = await fetch(`${API_BASE}/data_validation/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la validation des données');
    }

    return await response.json();
  } catch (error) {
    console.error('Validation data error:', error);
    throw error;
  }
};


// Nettoyage des dossiers
export const cleanDirectories = async () => {

  const formData = new FormData();

  formData.append('session_id', getSessionId());

  try {
    console.log('Nettoyage des dossiers...');

    const response = await fetch(`${API_BASE}/clear-directories/`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    const result = await handleResponse(response);

    // Effacer le session_id après nettoyage
    clearSessionId();

    return result;
  } catch (error) {
    console.error('Clean directories error:', error);
    return { status: 'warning', message: 'Nettoyage non effectué' };
  }
};