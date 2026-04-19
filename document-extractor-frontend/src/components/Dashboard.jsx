import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardData, get_user_details } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
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
        localStorage.removeItem('auth_token');
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

  const closeModal = () => {
    setShowModal(false);
    setSelectedUser(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  if (loading) return <div className="dashboard-loading">Chargement du tableau de bord...</div>;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Vérifications en cours</h1>
        <button onClick={handleLogout} className="logout-button">Déconnexion</button>
      </header>

      {error ? (
        <div className="dashboard-error">{error}</div>
      ) : (
        <div className="dashboard-content">
          {data.length === 0 ? (
            <div className="empty-state">Aucune vérification en cours.</div>
          ) : (
            <div className="table-responsive">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Nom & Prénom</th>
                    <th>Type Pièce</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item._id}>
                      <td>{new Date(item.created_at).toLocaleString('fr-FR')}</td>
                      <td>{item.nom} {item.prenom}</td>
                      <td>{item.type_piece}</td>
                      <td>
                        <span className="status-badge status-en-cours">En attente</span>
                      </td>
                      <td>
                        <button className="action-button" onClick={() => displayDetail(item._id)}>Détails</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal de détails */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Détails de l'identification</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>

            {detailLoading ? (
              <div className="modal-loading">Chargement des détails...</div>
            ) : selectedUser ? (
              <div className="modal-body">
                {/* Images */}
                {selectedUser.images_base64 && (
                  <div className="detail-images">
                    {selectedUser.images_base64.photo && (
                      <div className="detail-image-wrapper">
                        <label>Photo du document</label>
                        <img src={selectedUser.images_base64.photo} alt="Photo document" />
                      </div>
                    )}
                    {selectedUser.images_base64.photo_capture && (
                      <div className="detail-image-wrapper">
                        <label>Photo selfie</label>
                        <img src={selectedUser.images_base64.photo_capture} alt="Photo selfie" />
                      </div>
                    )}
                  </div>
                )}

                {/* Informations personnelles */}
                <div className="detail-section">
                  <h3>Informations personnelles</h3>
                  <div className="detail-grid">
                    <div className="detail-field">
                      <span className="detail-label">Nom</span>
                      <span className="detail-value">{selectedUser.nom || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Prénom</span>
                      <span className="detail-value">{selectedUser.prenom || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Date de naissance</span>
                      <span className="detail-value">{selectedUser.date_naissance || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Sexe</span>
                      <span className="detail-value">{selectedUser.sexe || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Nationalité</span>
                      <span className="detail-value">{selectedUser.nationalite || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Adresse</span>
                      <span className="detail-value">{selectedUser.adresse || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Informations document */}
                <div className="detail-section">
                  <h3>Informations du document</h3>
                  <div className="detail-grid">
                    <div className="detail-field">
                      <span className="detail-label">Type de pièce</span>
                      <span className="detail-value">{selectedUser.type_piece || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">N° CIN</span>
                      <span className="detail-value">{selectedUser.cin || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Code</span>
                      <span className="detail-value">{selectedUser.code || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Date d'expiration</span>
                      <span className="detail-value">{selectedUser.date_expiration || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Motif de séjour</span>
                      <span className="detail-value">{selectedUser.motif_sejour || '—'}</span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Statut</span>
                      <span className="detail-value">
                        <span className="status-badge status-en-cours">
                          {selectedUser.statut_verification || 'en_cours'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Date de création */}
                <div className="detail-section">
                  <h3>Métadonnées</h3>
                  <div className="detail-grid">
                    <div className="detail-field">
                      <span className="detail-label">Date de création</span>
                      <span className="detail-value">
                        {selectedUser.created_at
                          ? new Date(selectedUser.created_at).toLocaleString('fr-FR')
                          : '—'}
                      </span>
                    </div>
                    <div className="detail-field">
                      <span className="detail-label">Session ID</span>
                      <span className="detail-value">{selectedUser.session_id || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="modal-error">Impossible de charger les détails.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
