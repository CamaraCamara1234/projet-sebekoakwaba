// const API_BASE = 'https://checkid.akwabasebeko.com';
const API_BASE = 'https://jonna-unstrung-sickeningly.ngrok-free.dev';
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

  // Ajouter le header ngrok pour toutes les requêtes (évite l'interception par ngrok)
  fetchOptions.headers = {
    'ngrok-skip-browser-warning': 'true',
    ...(fetchOptions.headers || {})
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
  return apiRequest('/extraction_passport/', {
    method: 'POST',
    body: formData
  });
};

// extractDualDocuments - désactivé (mode passeport uniquement)
// export const extractDualDocuments = (formData) => {
//   return apiRequest('/extraction_dual/', {
//     method: 'POST',
//     body: formData
//   });
// };

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

export const savePendingData = (data) => {
  const formData = new FormData();

  Object.keys(data).forEach(key => {
    const value = data[key];
    if (value !== null && value !== undefined) {
      if (typeof value === 'object' && !(value instanceof File)) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, value);
      }
    }
  });

  return apiRequest('/save_pending_identification/', {
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

/**
 * Connexion à l'api
 */
export const loginUser = async (username, password) => {
  const response = await fetch(`${API_BASE}/api/login/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();
  if (!response.ok) {
    // Le backend retourne { error: "..." } pour les erreurs 400
    throw new Error(data.error || data.non_field_errors?.[0] || 'Identifiants incorrects');
  }

  // Stocker le token
  localStorage.setItem('auth_token', data.token);
  return data;
};

/**
 * Récupération des données Dashboard
 */
export const getDashboardData = async () => {
  const token = localStorage.getItem('auth_token');
  if (!token) throw new Error('Non autorisé - token manquant');

  const response = await fetch(`${API_BASE}/api/dashboard/`, {
    method: 'GET',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    }
  });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Non autorisé - veuillez vous reconnecter');
    }
    throw new Error(data.error || 'Erreur de récupération des données.');
  }

  return data;
};