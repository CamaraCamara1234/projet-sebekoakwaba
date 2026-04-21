import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardData, get_user_details, valid_user_profil, clearTokens } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [validating, setValidating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await getDashboardData();
      setData(response.data || []);
    } catch (err) {
      const msg = err.message || '';
      setError(msg);
      // Rediriger si non autorisé (401)
      if (msg.includes('Non autoris') || msg.includes('401') || msg.includes('autorisé')) {
        clearTokens();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const displayDetail = async (id) => {
    setDetailLoading(true);
    setShowModal(true);
    try {
      const response = await get_user_details(id);
      setSelectedUser(response.data || null);
    } catch (err) {
      console.error('Erreur lors du chargement des détails:', err);
      setSelectedUser(null);
      setError(err.message || 'Erreur lors du chargement des détails');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleValid = async (id) => {
    setValidating(true);
    try {
      const response = await valid_user_profil(id);
      setData(response.data || []);
      setShowModal(false);
      setSelectedUser(null);
    } catch (err) {
      console.error('Erreur lors de la validation:', err);
      setError(err.message || 'Erreur lors de la validation');
    } finally {
      setValidating(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedUser(null);
  };

  const handleLogout = () => {
    clearTokens();
    navigate('/login');
  };

  const filteredData = data.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.nom || '').toLowerCase().includes(q) ||
      (item.prenom || '').toLowerCase().includes(q) ||
      (item.type_piece || '').toLowerCase().includes(q) ||
      (item.numero || '').toLowerCase().includes(q)
    );
  });

  const getInitials = (nom, prenom) => {
    const n = (nom || '?')[0]?.toUpperCase() || '?';
    const p = (prenom || '?')[0]?.toUpperCase() || '?';
    return `${n}${p}`;
  };

  const getAvatarColor = (name) => {
    const colors = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
      'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
      'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="dash-loading-screen">
        <div className="dash-loading-spinner">
          <div className="dash-spinner-ring"></div>
          <div className="dash-spinner-ring"></div>
          <div className="dash-spinner-ring"></div>
        </div>
        <p className="dash-loading-text">Chargement du tableau de bord...</p>
      </div>
    );
  }

  return (
    <div className="dash-root">
      {/* ─── Sidebar ─── */}
      <aside className="dash-sidebar">
        <div className="dash-sidebar-brand">
          <div className="dash-brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div>
            <span className="dash-brand-name">AkwabaCheck</span>
            <span className="dash-brand-sub">Administration</span>
          </div>
        </div>

        <nav className="dash-sidebar-nav">
          <a href="#dashboard" className="dash-nav-item active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <span>Tableau de bord</span>
          </a>
          <a href="#verifications" className="dash-nav-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <polyline points="17 11 19 13 23 9"/>
            </svg>
            <span>Vérifications</span>
          </a>
        </nav>

        <div className="dash-sidebar-footer">
          <button onClick={handleLogout} className="dash-logout-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="dash-main">
        {/* Header */}
        <header className="dash-header">
          <div className="dash-header-left">
            <h1 className="dash-title">Vérifications</h1>
            <p className="dash-subtitle">Gérez les identifications en attente de validation</p>
          </div>
          <div className="dash-header-right">
            <div className="dash-search-wrapper">
              <svg className="dash-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                className="dash-search-input"
                placeholder="Rechercher par nom, prénom, CIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* Stats Cards */}
        <div className="dash-stats-row">
          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-stat-icon--total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="dash-stat-info">
              <span className="dash-stat-number">{data.length}</span>
              <span className="dash-stat-label">Total en attente</span>
            </div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-stat-icon--today">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className="dash-stat-info">
              <span className="dash-stat-number">
                {data.filter(d => {
                  const today = new Date().toDateString();
                  return new Date(d.created_at).toDateString() === today;
                }).length}
              </span>
              <span className="dash-stat-label">Aujourd'hui</span>
            </div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-stat-icon--passport">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="18" rx="2"/>
                <circle cx="12" cy="10" r="3"/>
                <path d="M7 21v-1a5 5 0 0 1 10 0v1"/>
              </svg>
            </div>
            <div className="dash-stat-info">
              <span className="dash-stat-number">
                {data.filter(d => (d.type_piece || '').toLowerCase().includes('passeport')).length}
              </span>
              <span className="dash-stat-label">Passeports</span>
            </div>
          </div>
          <div className="dash-stat-card">
            <div className="dash-stat-icon dash-stat-icon--cin">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            </div>
            <div className="dash-stat-info">
              <span className="dash-stat-number">
                {data.filter(d => (d.type_piece || '').toLowerCase().includes('cin') || (d.type_piece || '').toLowerCase().includes('carte')).length}
              </span>
              <span className="dash-stat-label">Cartes d'identité</span>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="dash-error-banner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="dash-error-dismiss">&times;</button>
          </div>
        )}

        {/* Table */}
        <div className="dash-table-card">
          <div className="dash-table-header">
            <h2 className="dash-table-title">Identifications en attente</h2>
            <span className="dash-table-count">{filteredData.length} résultat{filteredData.length !== 1 ? 's' : ''}</span>
          </div>

          {filteredData.length === 0 ? (
            <div className="dash-empty-state">
              <div className="dash-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </div>
              <p className="dash-empty-title">Aucune vérification trouvée</p>
              <p className="dash-empty-sub">
                {searchQuery ? 'Essayez avec d\'autres termes de recherche.' : 'Il n\'y a aucune vérification en cours pour le moment.'}
              </p>
            </div>
          ) : (
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Type de pièce</th>
                    <th>Date</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item, index) => (
                    <tr key={item._id} className="dash-table-row" style={{ animationDelay: `${index * 0.04}s` }}>
                      <td>
                        <div className="dash-user-cell">
                          <div
                            className="dash-user-avatar"
                            style={{ background: getAvatarColor(item.nom + item.prenom) }}
                          >
                            {getInitials(item.nom, item.prenom)}
                          </div>
                          <div className="dash-user-info">
                            <span className="dash-user-name">{item.nom} {item.prenom}</span>
                            <span className="dash-user-id">{item.cin || item.numero || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="dash-piece-badge">
                          {item.type_piece || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="dash-date-text">{formatDate(item.created_at)}</span>
                      </td>
                      <td>
                        <span className="dash-status-chip dash-status--pending">
                          <span className="dash-status-dot"></span>
                          En attente
                        </span>
                      </td>
                      <td>
                        <div className="dash-actions">
                          <button
                            className="dash-btn dash-btn--view"
                            onClick={() => displayDetail(item._id)}
                            title="Voir les détails"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                            <span>Détails</span>
                          </button>
                          <button
                            className="dash-btn dash-btn--validate"
                            onClick={() => handleValid(item._id)}
                            title="Valider l'identification"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ─── Detail Modal ─── */}
      {showModal && (
        <div className="dash-modal-overlay" onClick={closeModal}>
          <div className="dash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dash-modal-head">
              <div>
                <h2 className="dash-modal-title">Détails de l'identification</h2>
                <p className="dash-modal-sub">
                  {selectedUser ? `${selectedUser.nom || ''} ${selectedUser.prenom || ''}` : 'Chargement...'}
                </p>
              </div>
              <button className="dash-modal-close" onClick={closeModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {detailLoading ? (
              <div className="dash-modal-loader">
                <div className="dash-spinner-ring small"></div>
                <p>Chargement des détails...</p>
              </div>
            ) : selectedUser ? (
              <div className="dash-modal-body">
                {/* Images */}
                {selectedUser.images_base64 && (
                  <div className="dash-modal-images">
                    {selectedUser.images_base64.photo && (
                      <div className="dash-modal-img-wrap">
                        <label>Photo du document</label>
                        <img src={selectedUser.images_base64.photo} alt="Photo document" />
                      </div>
                    )}
                    {selectedUser.images_base64.photo_capture && (
                      <div className="dash-modal-img-wrap">
                        <label>Photo selfie</label>
                        <img src={selectedUser.images_base64.photo_capture} alt="Photo selfie" />
                      </div>
                    )}
                    {selectedUser.images_base64.passeport && (
                      <div className="dash-modal-img-wrap">
                        <label>Photo du passeport</label>
                        <img src={selectedUser.images_base64.passeport} alt="Photo passeport" />
                      </div>
                    )}
                  </div>
                )}

                {/* Personal Info */}
                <div className="dash-modal-section">
                  <h3>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Informations personnelles
                  </h3>
                  <div className="dash-modal-grid">
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Nom</span>
                      <span className="dash-field-value">{selectedUser.nom || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Prénom</span>
                      <span className="dash-field-value">{selectedUser.prenom || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Date de naissance</span>
                      <span className="dash-field-value">{selectedUser.date_naissance || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Sexe</span>
                      <span className="dash-field-value">{selectedUser.sexe || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Nationalité</span>
                      <span className="dash-field-value">{selectedUser.nationalite || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Adresse</span>
                      <span className="dash-field-value">{selectedUser.adresse || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Document Info */}
                <div className="dash-modal-section">
                  <h3>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="5" width="20" height="14" rx="2"/>
                      <line x1="2" y1="10" x2="22" y2="10"/>
                    </svg>
                    Informations du document
                  </h3>
                  <div className="dash-modal-grid">
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Type de pièce</span>
                      <span className="dash-field-value">{selectedUser.type_piece || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">N° CIN</span>
                      <span className="dash-field-value">{selectedUser.numero || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Code</span>
                      <span className="dash-field-value">{selectedUser.code || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Date d'expiration</span>
                      <span className="dash-field-value">{selectedUser.date_expiration || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Motif de séjour</span>
                      <span className="dash-field-value">{selectedUser.motif_sejour || '—'}</span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Statut</span>
                      <span className="dash-field-value">
                        <span className="dash-status-chip dash-status--pending">
                          <span className="dash-status-dot"></span>
                          {selectedUser.statut_verification || 'en_cours'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metadata */}
                <div className="dash-modal-section">
                  <h3>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Métadonnées
                  </h3>
                  <div className="dash-modal-grid">
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Date de création</span>
                      <span className="dash-field-value">
                        {selectedUser.created_at
                          ? new Date(selectedUser.created_at).toLocaleString('fr-FR')
                          : '—'}
                      </span>
                    </div>
                    <div className="dash-modal-field">
                      <span className="dash-field-label">Session ID</span>
                      <span className="dash-field-value dash-field-mono">{selectedUser.session_id || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Validate Button */}
                <div className="dash-modal-footer">
                  <button className="dash-btn dash-btn--cancel" onClick={closeModal}>
                    Fermer
                  </button>
                  <button
                    className="dash-btn dash-btn--confirm"
                    onClick={() => handleValid(selectedUser._id)}
                    disabled={validating}
                  >
                    {validating ? (
                      <>
                        <div className="dash-btn-spinner"></div>
                        Validation...
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Valider l'identification
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="dash-modal-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>Impossible de charger les détails.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
