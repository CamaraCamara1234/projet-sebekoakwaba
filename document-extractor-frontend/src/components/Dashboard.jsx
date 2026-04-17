import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardData } from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await getDashboardData();
      setData(response.data || []);
    } catch (err) {
      setError(err.message);
      if (err.message.includes('Non autorisé')) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
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
                        <button className="action-button">Détails</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
