import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEstimate } from '../context/EstimateContext';
import { useNavigate } from 'react-router-dom';
import { formatPrice } from '../services/azurePricingApi';
import { Trash2, Download, AlertCircle } from 'lucide-react';

export default function MyEstimates() {
    const { user, token } = useAuth();
    const { replaceItems, setCurrency } = useEstimate();
    const navigate = useNavigate();
    const [estimates, setEstimates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        fetchEstimates();
    }, [user]);

    async function fetchEstimates() {
        try {
            const res = await fetch('http://localhost:3001/api/estimates', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch estimates');
            const data = await res.json();
            setEstimates(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id) {
        if (!confirm('Are you sure you want to delete this estimate?')) return;
        try {
            await fetch(`http://localhost:3001/api/estimates/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            setEstimates(estimates.filter(e => e.id !== id));
        } catch (err) {
            alert('Failed to delete');
        }
    }

    async function handleLoad(id) {
        try {
            const res = await fetch(`http://localhost:3001/api/estimates/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();

            // Restore estimate
            // Note: We might need to expose a 'replaceItems' method in EstimateContext
            // For now, let's assume we can loop and add, but clearing is tricky if not exposed.
            // Let's assume user wants to VIEW it.
            // A better way is to update EstimateContext to allow 'loadEstimate(data)'
            if (replaceItems) {
                replaceItems(data.items);
                if (data.currency) setCurrency(data.currency);
                navigate('/dashboard');
            } else {
                alert("Context update required to load estimates.");
            }

        } catch (err) {
            alert('Failed to load estimate');
        }
    }

    if (loading) return <div className="p-8 text-center">Loading...</div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <h2>My Saved Estimates</h2>
                <p className="text-muted">Manage your saved Bills of Quantities.</p>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {estimates.length === 0 ? (
                <div className="empty-state">
                    <AlertCircle size={48} className="text-muted" />
                    <p>No saved estimates found.</p>
                    <button onClick={() => navigate('/dashboard')} className="btn-primary" style={{ marginTop: 16 }}>
                        Create New Estimate
                    </button>
                </div>
            ) : (
                <div className="estimates-grid">
                    {estimates.map(estimate => (
                        <div key={estimate.id} className="estimate-card">
                            <div className="card-header">
                                <h3>{estimate.name}</h3>
                                <span className="date">
                                    {new Date(estimate.updated_at).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="card-body">
                                <div className="cost-row">
                                    <span>Total Cost:</span>
                                    <span className="cost">
                                        {formatPrice(estimate.total_cost, estimate.currency || 'USD')}
                                    </span>
                                </div>
                                <div className="item-count">
                                    {estimate.items.length} items
                                </div>
                            </div>
                            <div className="card-actions">
                                <button onClick={() => handleLoad(estimate.id)} className="btn-secondary btn-icon">
                                    <Download size={16} /> Load
                                </button>
                                <button onClick={() => handleDelete(estimate.id)} className="btn-danger btn-icon">
                                    <Trash2 size={16} /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style jsx>{`
                .page-container {
                    padding: 2rem;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .page-header {
                    margin-bottom: 2rem;
                    border-bottom: 1px solid var(--border);
                    padding-bottom: 1rem;
                }
                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 4rem;
                    background: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px dashed var(--border);
                }
                .estimates-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 1.5rem;
                }
                .estimate-card {
                    background: var(--bg-primary);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-lg);
                    padding: 1.5rem;
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .estimate-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 1rem;
                }
                .card-header h3 {
                    margin: 0;
                    font-size: 1.1rem;
                }
                .date {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .cost-row {
                    display: flex;
                    justify-content: space-between;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                }
                .cost {
                    color: var(--primary);
                }
                .item-count {
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                    margin-bottom: 1.5rem;
                }
                .card-actions {
                    display: flex;
                    gap: 0.5rem;
                }
                .btn-icon {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex: 1;
                    justify-content: center;
                    font-size: 0.9rem;
                }
                .btn-danger {
                    background: rgba(220, 38, 38, 0.1);
                    color: #ef4444;
                    border: 1px solid transparent;
                }
                .btn-danger:hover {
                    background: rgba(220, 38, 38, 0.2);
                }
            `}</style>
        </div>
    );
}
