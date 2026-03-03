import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEstimate } from '../context/EstimateContext';
import { useNavigate } from 'react-router-dom';
import { formatPrice } from '../services/azurePricingApi';
import {
    Trash2, Download, FolderOpen, Plus, Pencil, Check, X,
    FileSpreadsheet, Clock, Tag, Save, AlertCircle, Package,
    TrendingUp, RefreshCw, LayoutGrid, List
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function MyEstimates() {
    const { user, token, loading: authLoading } = useAuth();
    const { replaceItems, setCurrency } = useEstimate();
    const navigate = useNavigate();

    const [estimates, setEstimates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [exportingId, setExportingId] = useState(null);
    const [loadingId, setLoadingId] = useState(null);

    // New states for confirm/preview
    const [loadConfirmId, setLoadConfirmId] = useState(null);
    const [previewData, setPreviewData] = useState(null); // { id, name, items, total, currency }

    useEffect(() => {
        if (authLoading) return;
        if (!user) { navigate('/'); return; }
        fetchEstimates();
    }, [user, authLoading]);

    async function fetchEstimates() {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`${API_URL}/estimates`, {
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

    function showSuccess(msg) {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3000);
    }

    async function executeLoad(id) {
        try {
            setLoadingId(id);
            const res = await fetch(`${API_URL}/estimates/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (replaceItems) {
                replaceItems(data.items || [], data.id, data.name);
                if (data.currency) setCurrency(data.currency);
                navigate('/dashboard');
            }
        } catch {
            setError('Failed to load estimate');
        } finally {
            setLoadingId(null);
            setLoadConfirmId(null);
        }
    }

    function handleLoadClick(id) {
        // If there are unsaved items in the current workspace, warn the user
        // (We can just assume there's always a warning as a safety measure, or check context. For now, always warn for safety.)
        setLoadConfirmId(id);
    }

    async function handlePreviewClick(id) {
        try {
            setLoadingId(id);
            const res = await fetch(`${API_URL}/estimates/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setPreviewData(data);
        } catch {
            setError('Failed to preview estimate');
        } finally {
            setLoadingId(null);
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
            showSuccess('Estimate deleted successfully');
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
        try {
            setExportingId(estimate.id);
            const res = await fetch(`${API_URL}/estimates/${estimate.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();

            const wb = new ExcelJS.Workbook();
            wb.creator = 'CalcAI – Azure Pricing';
            wb.created = new Date();
            const ws = wb.addWorksheet('Estimate', { views: [{ state: 'frozen', ySplit: 1 }] });
            ws.columns = [
                { header: 'Service', key: 'service', width: 28 },
                { header: 'SKU / Meter', key: 'sku', width: 32 },
                { header: 'Region', key: 'region', width: 20 },
                { header: 'Qty', key: 'qty', width: 8 },
                { header: 'Unit Price (USD)', key: 'price', width: 16 },
                { header: 'Monthly Cost', key: 'monthly', width: 16 },
            ];

            const hdr = ws.getRow(1);
            hdr.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0078D4' } };
            hdr.alignment = { horizontal: 'center', vertical: 'middle' };
            hdr.height = 22;

            (data.items || []).forEach((item, i) => {
                const monthly = (item.retailPrice || 0) * (item.quantity || 1) * (item.hoursPerMonth || 730);
                const row = ws.addRow({
                    service: item.serviceName || '',
                    sku: item.skuName || item.meterName || '',
                    region: item.armRegionName || '',
                    qty: item.quantity || 1,
                    price: +(item.retailPrice || 0).toFixed(4),
                    monthly: +monthly.toFixed(2),
                });
                if (i % 2 === 1) {
                    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } };
                }
            });

            // Summary row
            const totalMonthly = (data.items || []).reduce((acc, item) => {
                return acc + (item.retailPrice || 0) * (item.quantity || 1) * (item.hoursPerMonth || 730);
            }, 0);
            const totalRow = ws.addRow({ service: 'TOTAL', monthly: +totalMonthly.toFixed(2) });
            totalRow.font = { bold: true };
            totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F3FF' } };

            ws.getColumn('price').numFmt = '$#,##0.0000';
            ws.getColumn('monthly').numFmt = '$#,##0.00';

            const buf = await wb.xlsx.writeBuffer();
            saveAs(new Blob([buf]), `${estimate.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
            showSuccess('Exported to Excel!');
        } catch (e) {
            setError('Export failed: ' + e.message);
        } finally {
            setExportingId(null);
        }
    }

    // ─── Stats ──────────────────────────────────────────────────────────────
    const totalItems = estimates.reduce((s, e) => s + (Number(e.item_count) || 0), 0);
    const totalCost = estimates.reduce((s, e) => s + (Number(e.total_cost) || 0), 0);
    const currency = estimates.length > 0 ? estimates[0].currency : 'USD';

    // ─── Loading skeleton ───────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="me-page">
                <div className="me-loading">
                    <div className="me-loading-spinner" />
                    <p className="me-loading-txt">Loading your estimates…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="me-page">
            {/* ── HERO HEADER ── */}
            <div className="me-hero">
                <div className="me-hero-bg" aria-hidden />
                <div className="me-hero-content">
                    <div className="me-hero-text">
                        <div className="me-hero-label">
                            <Save size={13} /> Saved Estimates
                        </div>
                        <h1 className="me-hero-title">My Estimates</h1>
                        <p className="me-hero-sub">
                            Manage, load, and export all your saved Azure cost estimates.
                        </p>
                    </div>
                    <div className="me-hero-actions">
                        <button className="me-refresh-btn" onClick={fetchEstimates} title="Refresh">
                            <RefreshCw size={14} />
                        </button>
                        <button className="me-new-btn" onClick={() => navigate('/dashboard')}>
                            <Plus size={15} /> New Estimate
                        </button>
                    </div>
                </div>

                {/* Stats strip */}
                {estimates.length > 0 && (
                    <div className="me-stats">
                        <div className="me-stat">
                            <span className="me-stat-val">{estimates.length}</span>
                            <span className="me-stat-lbl">Estimates</span>
                        </div>
                        <div className="me-stat-divider" />
                        <div className="me-stat">
                            <span className="me-stat-val">{totalItems}</span>
                            <span className="me-stat-lbl">Total Services</span>
                        </div>
                        <div className="me-stat-divider" />
                        <div className="me-stat">
                            <span className="me-stat-val">{formatPrice(totalCost, currency)}</span>
                            <span className="me-stat-lbl">Combined Monthly</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── ALERTS ── */}
            <div className="me-alerts">
                {successMsg && (
                    <div className="me-toast me-toast--success">
                        <Check size={14} /> {successMsg}
                    </div>
                )}
                {error && (
                    <div className="me-toast me-toast--error">
                        <AlertCircle size={14} /> {error}
                        <button className="me-toast-close" onClick={() => setError(null)}>
                            <X size={12} />
                        </button>
                    </div>
                )}
            </div>

            {/* ── MAIN BODY ── */}
            <div className="me-body">
                {estimates.length === 0 ? (
                    /* Empty state */
                    <div className="me-empty">
                        <div className="me-empty-icon">
                            <Package size={40} />
                        </div>
                        <h3 className="me-empty-title">No saved estimates yet</h3>
                        <p className="me-empty-sub">
                            Build an estimate in the Calculator, then&nbsp;save it with a name to track it here.
                        </p>
                        <button className="me-new-btn" onClick={() => navigate('/dashboard')}>
                            <Plus size={15} /> Start Estimating
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="me-toolbar">
                            <span className="me-toolbar-count">
                                {estimates.length} estimate{estimates.length !== 1 ? 's' : ''}
                            </span>
                            <div className="me-view-toggle">
                                <button
                                    className={`me-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                                    onClick={() => setViewMode('grid')}
                                    title="Grid view"
                                >
                                    <LayoutGrid size={15} />
                                </button>
                                <button
                                    className={`me-view-btn${viewMode === 'list' ? ' active' : ''}`}
                                    onClick={() => setViewMode('list')}
                                    title="List view"
                                >
                                    <List size={15} />
                                </button>
                            </div>
                        </div>

                        {/* Cards */}
                        <div className={viewMode === 'grid' ? 'me-grid' : 'me-list'}>
                            {estimates.map(est => (
                                <EstimateCard
                                    key={est.id}
                                    est={est}
                                    viewMode={viewMode}
                                    renamingId={renamingId}
                                    renameValue={renameValue}
                                    deleteConfirmId={deleteConfirmId}
                                    loadConfirmId={loadConfirmId}
                                    exportingId={exportingId}
                                    loadingId={loadingId}
                                    setRenamingId={setRenamingId}
                                    setRenameValue={setRenameValue}
                                    setDeleteConfirmId={setDeleteConfirmId}
                                    setLoadConfirmId={setLoadConfirmId}
                                    onLoad={executeLoad}
                                    onLoadClick={handleLoadClick}
                                    onPreviewClick={handlePreviewClick}
                                    onDelete={handleDelete}
                                    onRename={handleRename}
                                    onExport={handleExport}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
            {/* Preview Drawer/Modal */}
            {previewData && (
                <div className="me-preview-overlay" onClick={() => setPreviewData(null)}>
                    <div className="me-preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="me-preview-header">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FileSpreadsheet size={18} color="var(--accent)" />
                                {previewData.name}
                            </h3>
                            <button className="me-preview-close" onClick={() => setPreviewData(null)}>
                                <X size={16} />
                            </button>
                        </div>
                        <div className="me-preview-body">
                            <div className="me-preview-stats">
                                <div className="me-preview-stat">
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Cost</span>
                                    <strong style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                                        {formatPrice(previewData.total_cost || previewData.items?.reduce((s, i) => s + ((i.retailPrice || 0) * (i.quantity || 1) * (i.hoursPerMonth || 730)), 0), previewData.currency)}
                                    </strong>
                                </div>
                                <div className="me-preview-stat">
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Services</span>
                                    <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                                        {previewData.items?.length || 0}
                                    </strong>
                                </div>
                            </div>
                            <div className="me-preview-list">
                                {(previewData.items || []).map((item, i) => {
                                    const monthly = (item.retailPrice || 0) * (item.quantity || 1) * (item.hoursPerMonth || 730);
                                    return (
                                        <div key={i} className="me-preview-item">
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                                    {item.customName ? `${item.customName} (${item.serviceName})` : item.serviceName}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    {item.skuName || item.meterName} | {item.armRegionName} | Qty: {item.quantity}
                                                </div>
                                            </div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                                {formatPrice(monthly, previewData.currency)}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="me-preview-footer">
                                <button className="me-new-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => executeLoad(previewData.id)}>
                                    <FolderOpen size={14} /> Open in Calculator
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Estimate Card Component ────────────────────────────────────────────────
function EstimateCard({
    est, viewMode,
    renamingId, renameValue, deleteConfirmId, loadConfirmId, exportingId, loadingId,
    setRenamingId, setRenameValue, setDeleteConfirmId, setLoadConfirmId,
    onLoad, onLoadClick, onPreviewClick, onDelete, onRename, onExport
}) {
    const isRenaming = renamingId === est.id;
    const isDelConfirm = deleteConfirmId === est.id;
    const isLoadConfirm = loadConfirmId === est.id;
    const isExporting = exportingId === est.id;
    const isLoading = loadingId === est.id;
    const itemCount = Number(est.item_count) || 0;

    const dateStr = new Date(est.updated_at).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric'
    });

    return (
        <div className={`me-card${viewMode === 'list' ? ' me-card--list' : ''}`}>
            {/* Colored top accent */}
            <div className="me-card-accent" />

            <div className="me-card-body">
                {/* Name / Rename row */}
                <div className="me-card-name-row">
                    {isRenaming ? (
                        <div className="me-rename-row">
                            <input
                                className="me-rename-input"
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') onRename(est.id);
                                    if (e.key === 'Escape') setRenamingId(null);
                                }}
                                autoFocus
                            />
                            <button className="me-icon-btn me-icon-btn--confirm" onClick={() => onRename(est.id)}>
                                <Check size={13} />
                            </button>
                            <button className="me-icon-btn me-icon-btn--cancel" onClick={() => setRenamingId(null)}>
                                <X size={13} />
                            </button>
                        </div>
                    ) : (
                        <div className="me-name-row">
                            <h3 className="me-card-name">{est.name}</h3>
                            <button
                                className="me-icon-btn"
                                title="Rename"
                                onClick={() => { setRenamingId(est.id); setRenameValue(est.name); }}
                            >
                                <Pencil size={13} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Meta chips */}
                <div className="me-card-meta">
                    <span className="me-chip">
                        <Clock size={11} /> {dateStr}
                    </span>
                    <span className="me-chip">
                        <Tag size={11} /> {est.currency}
                    </span>
                    <span className="me-chip">
                        <FolderOpen size={11} /> {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Cost */}
                <div className="me-card-cost-row">
                    <div className="me-card-cost-info">
                        <span className="me-cost-label">
                            <TrendingUp size={12} /> Monthly Total
                        </span>
                        <span className="me-cost-value">
                            {formatPrice(est.total_cost, est.currency)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions footer */}
            <div className="me-card-footer">
                {isDelConfirm ? (
                    <div className="me-del-confirm">
                        <span className="me-del-question">Delete this estimate?</span>
                        <button className="me-footer-btn me-footer-btn--danger" onClick={() => onDelete(est.id)}>
                            <Trash2 size={12} /> Yes, Delete
                        </button>
                        <button className="me-footer-btn me-footer-btn--ghost" onClick={() => setDeleteConfirmId(null)}>
                            Cancel
                        </button>
                    </div>
                ) : isLoadConfirm ? (
                    <div className="me-del-confirm">
                        <span className="me-del-question" style={{ color: 'var(--accent)' }}>Load estimate? Unsaved work will be lost.</span>
                        <button className="me-footer-btn me-footer-btn--primary" onClick={() => onLoad(est.id)}>
                            <FolderOpen size={12} /> Confirm
                        </button>
                        <button className="me-footer-btn me-footer-btn--ghost" onClick={() => setLoadConfirmId(null)}>
                            Cancel
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            className="me-footer-btn me-footer-btn--primary"
                            onClick={() => onLoadClick(est.id)}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <><span className="me-btn-spinner" /> Loading…</>
                            ) : (
                                <><FolderOpen size={13} /> Load</>
                            )}
                        </button>
                        <button
                            className="me-footer-btn me-footer-btn--secondary"
                            onClick={() => onPreviewClick(est.id)}
                            disabled={isLoading}
                        >
                            <FileSpreadsheet size={13} /> View
                        </button>
                        <button
                            className="me-footer-btn me-footer-btn--secondary"
                            onClick={() => onExport(est)}
                            disabled={isExporting}
                        >
                            {isExporting ? (
                                <><span className="me-btn-spinner" />…</>
                            ) : (
                                <><Download size={13} /> Export</>
                            )}
                        </button>
                        <button
                            className="me-footer-btn me-footer-btn--ghost"
                            onClick={() => setDeleteConfirmId(est.id)}
                        >
                            <Trash2 size={13} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
