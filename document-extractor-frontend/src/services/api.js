const API_BASE = 'https://checkid.akwabasebeko.com';
// const API_BASE = 'https://jonna-unstrung-sickeningly.ngrok-free.dev';
// const API_BASE = 'http://127.0.0.1:8000';

const SESSION_ID_KEY = 'secureid_session_id';
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

// ─── Session Helpers ────────────────────────────────────────────────────────

/**
 * Sauvegarde le session_id dans le localStorage
 * @param {string} sessionId 
 */
export const saveSessionId = (sessionId) => {
  if (sessionId) {
    localStorage.setItem(SESSION_ID_KEY, sessionId);
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

// ─── JWT Token Helpers ──────────────────────────────────────────────────────

/**
 * Stocke les tokens JWT
 */
const saveTokens = (accessToken, refreshToken) => {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

/**
 * Récupère l'access token
 */
const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);

/**
 * Récupère le refresh token
 */
const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);

/**
 * Efface tous les tokens (déconnexion)
 */
export const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  // Legacy cleanup
  localStorage.removeItem('auth_token');
};

/**
 * Décode le payload JWT (sans vérifier la signature — côté client uniquement)
 * @param {string} token 
 * @returns {object|null}
 */
const decodeJwtPayload = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
};

/**
 * Vérifie si un token JWT est expiré (avec une marge de 30 secondes)
 * @param {string} token 
 * @returns {boolean}
 */
const isTokenExpired = (token) => {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  // Marge de 30 secondes pour anticiper les latences réseau
  return Date.now() >= (payload.exp * 1000) - 30000;
};

// Flag pour éviter les appels concurrents au refresh
let isRefreshing = false;
let refreshPromise = null;

/**
 * Tente de renouveler l'access token avec le refresh token.
 * @returns {Promise<string|null>} Le nouveau access token, ou null si échec.
 */
const refreshAccessToken = async () => {
  // Si un refresh est déjà en cours, attendre son résultat
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken || isTokenExpired(refreshToken)) {
    clearTokens();
    return null;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/token/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        clearTokens();
        return null;
      }

      const data = await response.json();
      if (data.access_token) {
        saveTokens(data.access_token, null); // Ne pas écraser le refresh token
        return data.access_token;
      }

      clearTokens();
      return null;
    } catch (error) {
      console.error('Erreur lors du refresh du token:', error);
      clearTokens();
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

/**
 * Récupère un access token valide, en le renouvelant si nécessaire.
 * @returns {Promise<string|null>}
 */
const getValidAccessToken = async () => {
  let token = getAccessToken();

  // Si le token est encore valide, le retourner directement
  if (token && !isTokenExpired(token)) {
    return token;
  }

  // Sinon tenter un refresh
  console.log('Access token expiré, tentative de refresh...');
  token = await refreshAccessToken();
  return token;
};

// ─── API Core Logic ─────────────────────────────────────────────────────────

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

/**
 * Requête API authentifiée avec gestion automatique du JWT.
 * Si le token expire pendant la requête, il est renouvelé automatiquement.
 */
const authenticatedRequest = async (endpoint, options = {}) => {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error('Non autorisé - session expirée');
  }

  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {}),
    },
    ...options,
  };

  // Override headers pour s'assurer que Authorization est toujours présent
  fetchOptions.headers = {
    ...fetchOptions.headers,
    'Authorization': `Bearer ${token}`,
    'ngrok-skip-browser-warning': 'true',
  };

  const url = `${API_BASE}${endpoint}`;

  try {
    let response = await fetch(url, fetchOptions);

    // Si 401 → tenter un refresh et retry UNE FOIS
    if (response.status === 401) {
      console.log('401 reçu, tentative de refresh...');
      const newToken = await refreshAccessToken();

      if (!newToken) {
        throw new Error('Non autorisé - veuillez vous reconnecter');
      }

      // Retry avec le nouveau token
      fetchOptions.headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, fetchOptions);
    }

    return await handleResponse(response);
  } catch (error) {
    console.error(`Auth API Error [${endpoint}]:`, error);
    throw error;
  }
};

// ─── Exported API Functions ─────────────────────────────────────────────────

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
    clearSessionId();
  }
};

// ─── Auth API Functions (JWT) ───────────────────────────────────────────────

/**
 * Connexion — retourne et stocke les tokens JWT
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
    throw new Error(data.error || 'Identifiants incorrects');
  }

  // Stocker les tokens JWT
  saveTokens(data.access_token, data.refresh_token);

  // Legacy compat: stocker aussi sous l'ancien nom (au cas où)
  localStorage.setItem('auth_token', data.access_token);

  return data;
};

/**
 * Récupération des données Dashboard (authentifié)
 */
export const getDashboardData = async () => {
  return authenticatedRequest('/api/dashboard/');
};

/**
 * Détails d'un utilisateur (authentifié)
 */
export const get_user_details = async (id) => {
  return authenticatedRequest(`/api/userDetails/${id}/`);
};

/**
 * Validation d'un profil utilisateur (authentifié)
 */
export const valid_user_profil = async (id) => {
  return authenticatedRequest(`/api/validUserProfil/${id}/`);
};