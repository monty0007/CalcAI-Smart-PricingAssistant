import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEstimate } from '../context/EstimateContext';
import { useNavigate, Link } from 'react-router-dom';
import { formatPrice } from '../services/azurePricingApi';
import {
    Trash2, Download, FolderOpen, Plus, Pencil, Check, X,
    FileSpreadsheet, Clock, Tag, ChevronRight, Save, AlertCircle
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function MyEstimates() {
    const { user, token } = useAuth();
    const { replaceItems, setCurrency } = useEstimate();
    const navigate = useNavigate();

    const [estimates, setEstimates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        fetchEstimates();
    }, [user]);

    async function fetchEstimates() {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/estimates`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch estimates');
            setEstimates(await res.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function showSuccess(msg) {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 2800);
    }

    async function handleLoad(id) {
        try {
            const res = await fetch(`${API_URL}/estimates/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (replaceItems) {
                replaceItems(data.items);
                if (data.currency) setCurrency(data.currency);
                navigate('/dashboard');
            }
        } catch {
            setError('Failed to load estimate');
        }
    }

    async function handleDelete(id) {
        try {
            await fetch(`${API_URL}/estimates/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            setEstimates(prev => prev.filter(e => e.id !== id));
            setDeleteConfirmId(null);
            showSuccess('Estimate deleted');
        } catch {
            setError('Failed to delete estimate');
        }
    }

    async function handleRename(id) {
        if (!renameValue.trim()) return;
        try {
            const res = await fetch(`${API_URL}/estimates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: renameValue.trim() })
            });
            const updated = await res.json();
            setEstimates(prev => prev.map(e => e.id === id ? { ...e, name: updated.name, updated_at: updated.updated_at } : e));
            setRenamingId(null);
            setRenameValue('');
            showSuccess('Estimate renamed');
        } catch {
            setError('Failed to rename estimate');
        }
    }

    async function handleExport(estimate) {
        // Fetch full items
        const res = await fetch(`${API_URL}/estimates/${estimate.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Estimate');
        ws.columns = [
            { header: 'Service', key: 'service', width: 28 },
            { header: 'SKU', key: 'sku', width: 30 },
            { header: 'Region', key: 'region', width: 20 },
            { header: 'Qty', key: 'qty', width: 8 },
            { header: 'Unit Price', key: 'price', width: 14 },
            { header: 'Monthly Cost', key: 'monthly', width: 14 },
        ];
        const hdr = ws.getRow(1);
        hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0078D4' } };

        (data.items || []).forEach(item => {
            const monthly = (item.retailPrice || 0) * (item.quantity || 1) * (item.hoursPerMonth || 730);
            ws.addRow({
                service: item.serviceName || '',
                sku: item.skuName || item.meterName || '',
                region: item.armRegionName || '',
                qty: item.quantity || 1,
                price: item.retailPrice || 0,
                monthly: +monthly.toFixed(2),
            });
        });

        const buf = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buf]), `${estimate.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
    }

    if (loading) {
        return (
            <div className="my-estimates-page">
                <div className="my-est-loading">
                    <div className="my-est-spinner" />
                    <p>Loading your estimates…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="my-estimates-page">
            {/* Header */}
            <div className="my-est-header">
                <div>
                    <h1 className="my-est-title">
                        <Save size={22} /> My Saved Estimates
                    </h1>
                    <p className="my-est-sub">
                        All your saved Bills of Quantity · {estimates.length} estimate{estimates.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button className="my-est-new-btn" onClick={() => navigate('/dashboard')}>
                    <Plus size={15} /> New Estimate
                </button>
            </div>

            {/* Success */}
            {successMsg && (
                <div className="my-est-success">
                    <Check size={14} /> {successMsg}
                </div>
            )}
            {error && (
                <div className="my-est-error">
                    <AlertCircle size={14} /> {error}
                    <button onClick={() => setError(null)}><X size={12} /></button>
                </div>
            )}

            {/* Empty state */}
            {estimates.length === 0 ? (
                <div className="my-est-empty">
                    <div className="my-est-empty-icon">📦</div>
                    <h3>No saved estimates yet</h3>
                    <p>Build an estimate in the Calculator, then save it with a name to track it here.</p>
                    <button className="btn-primary" onClick={() => navigate('/dashboard')}>
                        <Plus size={15} /> Start Estimating
                    </button>
                </div>
            ) : (
                <div className="my-est-grid">
                    {estimates.map(est => (
                        <div key={est.id} className="my-est-card">
                            {/* Card header */}
                            <div className="my-est-card-top">
                                {renamingId === est.id ? (
                                    <div className="my-est-rename-row">
                                        <input
                                            className="my-est-rename-input"
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleRename(est.id); if (e.key === 'Escape') setRenamingId(null); }}
                                            autoFocus
                                        />
                                        <button className="my-est-icon-btn confirm" onClick={() => handleRename(est.id)}>
                                            <Check size={14} />
                                        </button>
                                        <button className="my-est-icon-btn cancel" onClick={() => setRenamingId(null)}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="my-est-name-row">
                                        <h3 className="my-est-name">{est.name}</h3>
                                        <button
                                            className="my-est-icon-btn"
                                            title="Rename"
                                            onClick={() => { setRenamingId(est.id); setRenameValue(est.name); }}
                                        >
                                            <Pencil size={13} />
                                        </button>
                                    </div>
                                )}

                                <div className="my-est-meta">
                                    <span><Clock size={11} /> {new Date(est.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    <span><Tag size={11} /> {est.currency}</span>
                                    <span><FolderOpen size={11} /> {est.item_count} item{est.item_count !== 1 ? 's' : ''}</span>
                                </div>
                            </div>

                            {/* Cost */}
                            <div className="my-est-cost-row">
                                <span className="my-est-cost-label">Total Monthly</span>
                                <span className="my-est-cost">{formatPrice(est.total_cost, est.currency)}</span>
                            </div>

                            {/* Actions */}
                            <div className="my-est-card-actions">
                                <button className="my-est-action-btn load" onClick={() => handleLoad(est.id)}>
                                    <FolderOpen size={13} /> Load
                                </button>
                                <button className="my-est-action-btn export" onClick={() => handleExport(est)}>
                                    <FileSpreadsheet size={13} /> Export
                                </button>
                                {deleteConfirmId === est.id ? (
                                    <div className="my-est-delete-confirm">
                                        <span>Delete?</span>
                                        <button className="my-est-action-btn delete-yes" onClick={() => handleDelete(est.id)}>Yes</button>
                                        <button className="my-est-action-btn cancel" onClick={() => setDeleteConfirmId(null)}>No</button>
                                    </div>
                                ) : (
                                    <button className="my-est-action-btn delete" onClick={() => setDeleteConfirmId(est.id)}>
                                        <Trash2 size={13} /> Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
