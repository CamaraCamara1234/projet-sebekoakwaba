const API_BASE = 'https://checkid.akwabasebeko.com';
// const API_BASE = 'http://127.0.0.1:8000';

const SESSION_ID_KEY = 'secureid_session_id';

// --- Session Helpers ---

/**
 * Sauvegarde le session_id dans le localStorage
 * @param {string} sessionId 
 */
export const saveSessionId = (sessionId) => {
  if (sessionId) {
    localStorage.setItem(SESSION_ID_KEY, sessionId);
    // console.log('Session ID sauvegardé:', sessionId);
  }
};

/**
 * Récupère le session_id depuis le localStorage
 * @returns {string|null}
 */
export const getSessionId = () => {
  return localStorage.getItem(SESSION_ID_KEY);
};

/**
 * Efface le session_id du localStorage
 */
export const clearSessionId = () => {
  localStorage.removeItem(SESSION_ID_KEY);
  console.log('Session ID effacé');
};

// --- API Core Logic ---

/**
 * Gère la réponse du serveur
 * @param {Response} response 
 * @returns {Promise<any>}
 */
const handleResponse = async (response) => {
  const contentType = response.headers.get('content-type');

  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();

    // Auto-sauvegarde du session_id si présent
    if (data.session_id) {
      saveSessionId(data.session_id);
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || `Erreur HTTP ${response.status}`);
    }

    return data;
  }

  const text = await response.text();

  if (!response.ok) {
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(`Le serveur a retourné une erreur HTML (${response.status}). Le backend est peut-être hors service.`);
    }
    throw new Error(`Erreur serveur (${response.status}): ${text.substring(0, 100)}`);
  }

  return text;
};

/**
 * Fonction générique pour effectuer des requêtes API
 * @param {string} endpoint 
 * @param {Object} options 
 */
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;

  // Configuration par défaut
  const fetchOptions = {
    method: options.method || 'GET',
    ...options
  };

  // Gestion automatique du session_id pour les requêtes POST avec FormData
  if (fetchOptions.method === 'POST' && fetchOptions.body instanceof FormData) {
    const sessionId = getSessionId();
    if (sessionId && !fetchOptions.body.has('session_id')) {
      fetchOptions.body.append('session_id', sessionId);
    }
  }

  try {
    const response = await fetch(url, fetchOptions);
    return await handleResponse(response);
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
};

// --- Exported API Functions ---

/**
 * Extraction d'un document simple (ex: Passeport)
 * @param {FormData} formData 
 */
export const extractSingleDocument = (formData) => {
  return apiRequest('/extraction_front/', {
    method: 'POST',
    body: formData
  });
};

/**
 * Extraction recto-verso
 * @param {FormData} formData 
 */
export const extractDualDocuments = (formData) => {
  return apiRequest('/extraction_dual/', {
    method: 'POST',
    body: formData
  });
};

/**
 * Vérification faciale simple
 * @param {File} imageFile 
 */
export const verifyFaces = (imageFile) => {
  const formData = new FormData();
  formData.append('image', imageFile);

  return apiRequest('/face_verification/', {
    method: 'POST',
    body: formData
  });
};

/**
 * Vérification faciale avancée
 * @param {File} imageFile 
 */
export const advancedVerifyFaces = (imageFile) => {
  const formData = new FormData();
  formData.append('image', imageFile);

  return apiRequest('/advenced_face_verification/', {
    method: 'POST',
    body: formData
  });
};

/**
 * Validation des données extraites
 * @param {FormData} formData 
 */
export const validationData = (formData) => {
  return apiRequest('/data_validation/', {
    method: 'POST',
    body: formData
  });
};

export const updateUserStatus = (data) => {
  const formData = new FormData();

  // Conversion de l'objet simple en FormData pour le backend Django (request.POST)
  Object.keys(data).forEach(key => {
    const value = data[key];
    if (value !== null && value !== undefined) {
      // Pour les objets complexes (comme images_base64), on les sérialise en JSON
      if (typeof value === 'object' && !(value instanceof File)) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, value);
      }
    }
  });

  return apiRequest('/finalisation_process/', {
    method: 'POST',
    body: formData
  });
};

/**
 * Nettoyage des fichiers temporaires de session
 */
export const cleanDirectories = async () => {
  const sessionId = getSessionId();
  if (!sessionId) {
    console.log('Pas de session à nettoyer');
    return { status: 'success', message: 'Aucune session active' };
  }

  try {
    // Note: apiRequest ajoutera automatiquement le session_id car il est dans le localStorage
    const result = await apiRequest('/clear_session_files/', {
      method: 'POST',
      body: new FormData()
    });

    console.log('Session nettoyée côté serveur:', result);
    return result;
  } catch (error) {
    console.warn('Erreur lors du nettoyage serveur:', error);
    return { status: 'warning', message: 'Nettoyage serveur incomplet' };
  } finally {
    // On efface TOUJOURS l'ID local pour permettre une nouvelle session propre
    clearSessionId();
  }
};