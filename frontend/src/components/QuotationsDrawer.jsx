import { useState, useEffect, useCallback } from 'react';
import { X, BookOpen, Trash2, FolderOpen, Clock, Tag, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEstimate } from '../context/EstimateContext';
import { useNavigate } from 'react-router-dom';
import { formatPrice } from '../services/azurePricingApi';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function QuotationsDrawer({ open, onClose }) {
    const { user, token } = useAuth();
    const { replaceItems, setCurrency, updateItem } = useEstimate();
    const navigate = useNavigate();

    const [estimates, setEstimates] = useState([]);
    const [loading, setLoading] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [loadConfirmId, setLoadConfirmId] = useState(null);
    const [expandedCards, setExpandedCards] = useState({});
    const [openingId, setOpeningId] = useState(null);

    const { items: currentEstimateItems, setActiveEstimate } = useEstimate();

    const fetchEstimates = useCallback(async () => {
        if (!user || !token) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/estimates`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to load');
            setEstimates(await res.json());
        } catch {
            toast.error('Could not load saved quotations');
        } finally {
            setLoading(false);
        }
    }, [user, token]);

    useEffect(() => {
        if (open) fetchEstimates();
    }, [open, fetchEstimates]);

    useEffect(() => {
        if (!user) {
            setEstimates([]);
        }
    }, [user]);

    async function handleDelete(id) {
        try {
            await fetch(`${API_URL}/estimates/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            setEstimates(prev => prev.filter(e => e.id !== id));
            setDeleteConfirmId(null);
            toast.success('Quotation deleted');
        } catch {
            toast.error('Failed to delete');
        }
    }

    async function handleOpen(est) {
        setOpeningId(est.id);
        try {
            // 1. Fetch full items
            const res = await fetch(`${API_URL}/estimates/${est.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const savedItems = data.items || [];

            // 2. Load into estimate context immediately (stale prices)
            if (data.currency) setCurrency(data.currency, []);
            replaceItems(savedItems);
            setActiveEstimate(est.id, est.name);
            onClose();
            navigate('/dashboard');

            // 3. Silently reprice in background using calculate_estimate
            (async () => {
                try {
                    // Build typed items for the calculate_estimate tool
                    const typedItems = savedItems.map(item => {
                        const baseItem = {
                            type: item._type || deriveType(item),
                            name: item.customName || item.serviceName,
                            quantity: item.quantity || 1,
                            region: item.armRegionName || 'centralindia',
                        };
                        // VM-specific fields
                        if (baseItem.type === 'vm') {
                            baseItem.sku = item.skuName || '';
                            baseItem.os = item.os || (item.productName?.toLowerCase().includes('windows') ? 'windows' : 'linux');
                            baseItem.reservation = item.reservation || '';
                        }
                        return baseItem;
                    });

                    const repriceRes = await fetch(`${API_URL}/tools/calculate_estimate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: typedItems, currency: data.currency || 'INR' }),
                    });

                    if (repriceRes.ok) {
                        const repriceData = await repriceRes.json();
                        // Apply fresh prices back to each item by index
                        const breakdown = repriceData.breakdown || [];
                        savedItems.forEach((item, idx) => {
                            const freshEntry = breakdown[idx];
                            if (freshEntry && freshEntry.cost > 0) {
                                // Recalculate hourly/monthly retailPrice from total monthly cost
                                const qty = item.quantity || 1;
                                const hours = item.hoursPerMonth || 730;
                                const unit = (item.unitOfMeasure || '').toLowerCase();
                                let freshRetailPrice = freshEntry.cost / qty;
                                if (unit.includes('hour')) freshRetailPrice = freshEntry.cost / (qty * hours);
                                else if (unit.includes('month')) freshRetailPrice = freshEntry.cost / qty;
                                updateItem(item.id, { retailPrice: freshRetailPrice });
                            }
                        });
                        toast.success('✅ Prices updated to today\'s rates');
                    }
                } catch (err) {
                    console.warn('Reprice failed silently:', err);
                }
            })();
        } catch {
            toast.error('Failed to load quotation');
        } finally {
            setOpeningId(null);
        }
    }

    // Derive a best-guess type from the item for repricing
    function deriveType(item) {
        const svc = (item.serviceName || '').toLowerCase();
        if (svc.includes('virtual machine') || svc === 'compute') return 'vm';
        if (svc.includes('storage') || svc.includes('disk')) return 'managed_disk';
        if (svc.includes('bandwidth')) return 'bandwidth';
        if (svc.includes('ip')) return 'ip_address';
        if (svc.includes('defender')) return 'defender';
        if (svc.includes('monitor') || svc.includes('log')) return 'monitor';
        return 'vm'; // fallback
    }

    function formatDate(iso) {
        return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function toggleExpand(id) {
        setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
    }

    function generateSummary(items) {
        if (!items || items.length === 0) return 'No items';
        const names = items.slice(0, 3).map(i => i.customName || i.serviceName);
        if (items.length > 3) return `${names.join(' · ')} +${items.length - 3} more`;
        return names.join(' · ');
    }

    function attemptLoad(est) {
        if (currentEstimateItems.length > 0) {
            setLoadConfirmId(est.id);
        } else {
            handleOpen(est);
        }
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className={`quot-backdrop ${open ? 'open' : ''}`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer */}
            <aside className={`quot-drawer ${open ? 'open' : ''}`} aria-label="My Quotations">
                <div className="quot-header">
                    <div className="quot-title">
                        <BookOpen size={18} />
                        My Saved Quotations
                    </div>
                    <button className="quot-close-btn" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="quot-body">
                    {!user ? (
                        <div className="quot-empty">
                            <AlertCircle size={32} strokeWidth={1.5} />
                            <p>Sign in to view your saved quotations.</p>
                        </div>
                    ) : loading ? (
                        <div className="quot-loading">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="quot-skeleton" />
                            ))}
                        </div>
                    ) : estimates.length === 0 ? (
                        <div className="quot-empty">
                            <BookOpen size={36} strokeWidth={1} />
                            <p>No saved quotations yet.</p>
                            <span>Build an estimate and click Save.</span>
                        </div>
                    ) : (
                        <div className="quot-list">
                            {estimates.map(est => {
                                const isExpanded = expandedCards[est.id];
                                return (
                                    <div key={est.id} className="quot-card">
                                        <div className="quot-card-top" onClick={() => toggleExpand(est.id)} style={{ cursor: 'pointer' }}>
                                            <h4 className="quot-card-title">{est.name}</h4>
                                        </div>
                                        <div className="quot-card-meta">
                                            <span><Clock size={11} /> {formatDate(est.updated_at || est.created_at)}</span>
                                            <span><Tag size={11} /> {est.currency}</span>
                                        </div>
                                        <div className="quot-card-summary" onClick={() => toggleExpand(est.id)}>
                                            {generateSummary(est.items)}
                                        </div>

                                        {isExpanded && est.items && est.items.length > 0 && (
                                            <div className="quot-card-details">
                                                {est.items.map((item, idx) => (
                                                    <div key={idx} className="quot-card-detail-item">
                                                        <span className="qcd-name">{item.customName || item.serviceName}</span>
                                                        <span className="qcd-price">{formatPrice(item.retailPrice * (item.quantity || 1) * (item.hoursPerMonth || 730), est.currency)}/mo</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="quot-card-total">
                                            {formatPrice(est.total_cost, est.currency)}
                                            <span className="quot-card-period">/mo</span>
                                        </div>
                                        <div className="quot-card-actions">
                                            {loadConfirmId === est.id ? (
                                                <div className="quot-delete-confirm">
                                                    <span style={{ fontSize: '0.75rem' }}>Overwrite current?</span>
                                                    <button className="quot-delete-yes" onClick={() => { setLoadConfirmId(null); handleOpen(est); }}>
                                                        <Check size={12} /> Yes
                                                    </button>
                                                    <button className="quot-delete-no" onClick={() => setLoadConfirmId(null)}>
                                                        <X size={12} /> No
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="quot-open-btn primary"
                                                    onClick={() => attemptLoad(est)}
                                                    disabled={openingId === est.id}
                                                >
                                                    <FolderOpen size={13} />
                                                    {openingId === est.id ? 'Loading…' : 'Load Estimate'}
                                                </button>
                                            )}

                                            {deleteConfirmId === est.id ? (
                                                <div className="quot-delete-confirm">
                                                    <span>Delete?</span>
                                                    <button className="quot-delete-yes" onClick={() => handleDelete(est.id)}>
                                                        <Check size={12} /> Yes
                                                    </button>
                                                    <button className="quot-delete-no" onClick={() => setDeleteConfirmId(null)}>
                                                        <X size={12} /> No
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="quot-delete-btn"
                                                    onClick={() => setDeleteConfirmId(est.id)}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
