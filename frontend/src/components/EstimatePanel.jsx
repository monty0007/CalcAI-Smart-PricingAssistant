import { useState } from 'react';
import { ShoppingCart, Trash2, Download, RotateCcw, Pencil, Check, Save, X, LogIn, FileEdit, Settings, Lock } from 'lucide-react';
import { useEstimate } from '../context/EstimateContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../services/azurePricingApi';
import toast from 'react-hot-toast';

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/** Generate a readable title from the estimate items */
function generateEstimateTitle(items) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const monthYear = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    const primary = items[0];
    const label = primary?.customName || primary?.skuName || primary?.serviceName || 'Estimate';
    return `${label} — ${monthYear}`;
}

export default function EstimatePanel({ onEditItem }) {
    const {
        items, currency, removeItem, updateItem,
        clearAll, totalMonthlyCost, refreshing,
        activeEstimateId, activeEstimateTitle, setActiveEstimate
    } = useEstimate();
    const { user, token } = useAuth();
    const [editingId, setEditingId] = useState(null);
    const [editPrice, setEditPrice] = useState('');

    const [editingNameId, setEditingNameId] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');

    // Save estimate state
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveLoading, setSaveLoading] = useState(false);

    async function handleSaveEstimate() {
        if (!activeEstimateId && !saveName.trim()) return;
        setSaveLoading(true);
        try {
            const url = activeEstimateId ? `${API_URL}/estimates/${activeEstimateId}` : `${API_URL}/estimates`;
            const method = activeEstimateId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...(activeEstimateId ? {} : { name: saveName.trim() }),
                    items,
                    total_cost: totalMonthlyCost,
                    currency,
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.message || d.error || 'Save failed');
            }
            if (!activeEstimateId) {
                const data = await res.json();
                setActiveEstimate(data.id, data.name);
            }
            toast.success(activeEstimateId ? 'Estimate updated!' : `"${saveName.trim()}" saved!`);
            setSaveName('');
            setShowSaveForm(false);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSaveLoading(false);
        }
    }

    function handleOpenSaveForm() {
        if (!user) {
            toast('Sign in to save your estimate', { icon: '🔒' });
            return;
        }
        if (activeEstimateId) {
            // If already editing a saved estimate, just auto-update it without asking for name
            handleSaveEstimate();
        } else {
            // New save: ask for name
            if (!saveName) setSaveName(generateEstimateTitle(items));
            setShowSaveForm(v => !v);
        }
    }

    function startEditPrice(item) {
        setEditingId(item.id);
        setEditPrice(String(item.retailPrice));
    }

    function savePrice(id) {
        const newPrice = parseFloat(editPrice);
        if (!isNaN(newPrice) && newPrice >= 0) {
            updateItem(id, { retailPrice: newPrice });
        }
        setEditingId(null);
        setEditPrice('');
    }

    async function saveActiveEstimateName() {
        if (!editNameValue.trim() || !activeEstimateId) return;
        try {
            const res = await fetch(`${API_URL}/estimates/${activeEstimateId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: editNameValue.trim() })
            });
            if (!res.ok) throw new Error('Failed to rename estimate');
            const updated = await res.json();
            setActiveEstimate(updated.id, updated.name);
            setEditingNameId(null);
            toast.success('Estimate renamed');
        } catch (err) {
            toast.error(err.message);
        }
    }

    async function handleExportExcel() {
        if (items.length === 0) return;

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Estimate');

        ws.columns = [
            { width: 22 }, // Category
            { width: 25 }, // Type
            { width: 20 }, // Custom name
            { width: 18 }, // Region
            { width: 65 }, // Description
            { width: 22 }, // Monthly cost
            { width: 22 }  // Upfront cost
        ];

        // Title row
        const titleRow = ws.addRow(["Microsoft Azure Estimate"]);
        titleRow.font = { size: 14, color: { argb: 'FF333333' } };
        ws.mergeCells('A1:G1');

        // Subtitle
        const subtitleRow = ws.addRow(["Your Estimate"]);
        subtitleRow.font = { size: 12, color: { argb: 'FF333333' } };
        ws.mergeCells('A2:G2');

        // Header
        const headerRow = ws.addRow([
            "Service category", "Service type", "Custom name", "Region", "Description", "Estimated monthly cost", "Estimated upfront cost"
        ]);

        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9EAF7' } // Light Azure Blue
            };
            cell.font = { size: 11, color: { argb: 'FF333333' } };
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            };
        });

        items.forEach(item => {
            const monthlyPrice = calculateItemMonthly(item);

            let description = '';
            if (item.serviceFamily === 'Compute') {
                description = `${item.quantity || 1} ${item.skuName || item.meterName} x ${item.hoursPerMonth || 730} Hours (Pay as you go)`;
            } else {
                description = `${item.quantity || 1} x ${item.skuName || item.meterName}`;
            }

            const dataRow = ws.addRow([
                item.serviceFamily || 'Other',
                item.serviceName || '',
                item.customName || '', // Custom Name
                item.location || item.armRegionName || '',
                description,
                formatPrice(monthlyPrice, currency),
                formatPrice(0, currency)
            ]);

            dataRow.getCell(5).alignment = { wrapText: true, vertical: 'top' };
            dataRow.eachCell(cell => {
                cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
                cell.border = { bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } } };
            });
        });

        // Add Support row mimicking official format
        const supportRow = ws.addRow(["Support", "", "", "Support", "", formatPrice(0, currency), formatPrice(0, currency)]);
        supportRow.eachCell(cell => {
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } } };
        });

        ws.addRow([]);

        // Footer summary blocks
        ws.addRow(["", "", "", "Licensing Program", "Microsoft Customer Agreement (MCA)", "", ""]);
        ws.addRow(["", "", "", "Billing Account", "", "", ""]);
        ws.addRow(["", "", "", "Billing Profile", "", "", ""]);

        const totalRow = ws.addRow(["", "", "", "Total", "", formatPrice(totalMonthlyCost, currency), formatPrice(0, currency)]);

        // Add borders to total row from D to G
        totalRow.getCell(4).border = { top: { style: 'medium', color: { argb: 'FF999999' } } };
        totalRow.getCell(5).border = { top: { style: 'medium', color: { argb: 'FF999999' } } };
        totalRow.getCell(6).border = { top: { style: 'medium', color: { argb: 'FF999999' } } };
        totalRow.getCell(7).border = { top: { style: 'medium', color: { argb: 'FF999999' } } };

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Azure_Estimate_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    function calculateItemMonthly(item) {
        const price = item.retailPrice || 0;
        const qty = item.quantity || 1;
        const hours = item.hoursPerMonth || 730;
        const unit = (item.unitOfMeasure || '').toLowerCase();

        if (unit.includes('hour')) return price * qty * hours;
        if (unit.includes('month')) return price * qty;
        if (unit.includes('day')) return price * qty * 30;
        if (unit.includes('gb')) return price * qty;
        if (unit.includes('year')) return (price * qty) / 12;
        return price * qty;
    }

    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);

    function handleConfirmClear() {
        clearAll();
        setShowClearConfirm(false);
        toast.success("Estimate cleared!");
    }

    function handleConfirmUpdate() {
        handleSaveEstimate();
        setShowUpdateConfirm(false);
    }
    const totalItemsCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    return (
        <>
            <aside className="estimate-panel">
                <div className="estimate-header">
                    <h3>
                        <ShoppingCart size={16} />
                        Your Estimate
                        {totalItemsCount > 0 && <span className="item-count">{totalItemsCount}</span>}
                    </h3>
                </div>

                {activeEstimateId && (
                    <div className="active-estimate-banner">
                        <FileEdit size={14} />
                        {editingNameId === 'BANNER' ? (
                            <div className="me-rename-row" style={{ flex: 1, padding: 0, margin: 0, background: 'transparent' }}>
                                <input
                                    className="me-rename-input"
                                    style={{ fontSize: '0.8rem', padding: '2px 6px', height: 24 }}
                                    value={editNameValue}
                                    onChange={e => setEditNameValue(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') saveActiveEstimateName();
                                        if (e.key === 'Escape') setEditingNameId(null);
                                    }}
                                    autoFocus
                                />
                                <button className="me-icon-btn me-icon-btn--confirm" style={{ width: 20, height: 20 }} onClick={saveActiveEstimateName}>
                                    <Check size={12} />
                                </button>
                                <button className="me-icon-btn me-icon-btn--cancel" style={{ width: 20, height: 20 }} onClick={() => setEditingNameId(null)}>
                                    <X size={12} />
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden' }}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Editing: <strong>{activeEstimateTitle}</strong>
                                </span>
                                <button
                                    className="me-icon-btn"
                                    title="Rename"
                                    onClick={() => { setEditingNameId('BANNER'); setEditNameValue(activeEstimateTitle); }}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}
                                >
                                    <Pencil size={12} />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {refreshing && (
                    <div style={{
                        padding: '8px 18px', fontSize: '0.75rem', color: 'var(--accent)',
                        background: 'rgba(0,120,212,0.06)', borderBottom: '1px solid var(--border-primary)',
                        display: 'flex', alignItems: 'center', gap: 8
                    }}>
                        <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div>
                        Refreshing prices...
                    </div>
                )}

                <div className={`estimate-items ${items.length === 0 ? 'empty' : ''}`}>
                    {items.length === 0 ? (
                        <div className="estimate-empty">
                            <ShoppingCart size={36} strokeWidth={1} />
                            <p>No services added yet</p>
                            <p style={{ fontSize: '0.72rem' }}>Browse services and click "Add to Estimate"</p>
                        </div>
                    ) : (
                        items.map(item => (
                            <div key={item.id} className="estimate-item">
                                <div className="estimate-item-header">
                                    <div style={{ flex: 1, marginRight: 12 }}>
                                        <div className="estimate-item-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                            <span style={{ color: 'var(--text-primary)' }}>
                                                {item.serviceName}
                                            </span>
                                        </div>
                                        <div className="estimate-item-sku">{item.skuName || item.meterName}</div>
                                        <div className="estimate-item-sku">{item.location || item.armRegionName}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <button
                                            className="estimate-item-remove"
                                            onClick={() => onEditItem?.(item)}
                                            title="Edit Configuration"
                                            style={{ color: 'var(--accent)' }}
                                        >
                                            <Settings size={14} />
                                        </button>
                                        <button
                                            className="estimate-item-remove"
                                            onClick={() => removeItem(item.id)}
                                            title="Remove"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="estimate-item-controls">
                                    <div className="control-group">
                                        <label>Qty</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                        />
                                    </div>
                                    {(item.unitOfMeasure || '').toLowerCase().includes('hour') && (
                                        <div className="control-group">
                                            <label>Hrs/Mo</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="744"
                                                value={item.hoursPerMonth}
                                                onChange={(e) => updateItem(item.id, { hoursPerMonth: Math.max(1, parseInt(e.target.value) || 730) })}
                                            />
                                        </div>
                                    )}
                                    <div className="control-group">
                                        <label>Unit Price</label>
                                        {editingId === item.id ? (
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                <input
                                                    type="number"
                                                    step="0.0001"
                                                    min="0"
                                                    value={editPrice}
                                                    onChange={(e) => setEditPrice(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && savePrice(item.id)}
                                                    autoFocus
                                                    style={{ width: 70 }}
                                                />
                                                <button
                                                    onClick={() => savePrice(item.id)}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--success)', display: 'flex', padding: 2
                                                    }}
                                                    title="Save"
                                                >
                                                    <Check size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                                                    {formatPrice(item.retailPrice, currency)}
                                                </span>
                                                <button
                                                    onClick={() => startEditPrice(item)}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--text-muted)', display: 'flex', padding: 2
                                                    }}
                                                    title="Edit price"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="estimate-item-price">
                                    <div className="per-unit">
                                        {formatPrice(item.retailPrice, currency)} / {item.unitOfMeasure}
                                    </div>
                                    <div className="price">
                                        {formatPrice(calculateItemMonthly(item), currency)}/mo
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {items.length > 0 && (
                    <div className="estimate-footer">
                        <div className="estimate-total">
                            <span className="label">Estimated Monthly</span>
                            <span className="amount">{formatPrice(totalMonthlyCost, currency)}</span>
                        </div>
                        <div className="estimate-period">
                            ≈ {formatPrice(totalMonthlyCost * 12, currency)} / year
                        </div>

                        {/* Save estimate inline form */}
                        {showSaveForm && user && !activeEstimateId && (
                            <div className="est-save-form">
                                <input
                                    className="est-save-input"
                                    placeholder="Name this estimate…"
                                    value={saveName}
                                    onChange={e => setSaveName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEstimate(); if (e.key === 'Escape') setShowSaveForm(false); }}
                                    autoFocus
                                    maxLength={80}
                                />
                                <button
                                    className="est-save-confirm-btn"
                                    onClick={handleSaveEstimate}
                                    disabled={saveLoading || !saveName.trim()}
                                >
                                    {saveLoading ? '…' : <Check size={13} />}
                                </button>
                                <button className="est-save-cancel-btn" onClick={() => setShowSaveForm(false)}>
                                    <X size={13} />
                                </button>
                            </div>
                        )}

                        {/* Update Confirm */}
                        {showUpdateConfirm && (
                            <div className="est-save-form" style={{ background: 'var(--bg-tertiary)' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1 }}>Update saved estimate?</span>
                                <button
                                    className="est-action-btn est-save-btn"
                                    style={{ flex: 'none' }}
                                    onClick={handleConfirmUpdate}
                                >
                                    <Check size={13} /> Yes
                                </button>
                                <button
                                    className="est-action-btn"
                                    style={{ flex: 'none' }}
                                    onClick={() => setShowUpdateConfirm(false)}
                                >
                                    <X size={13} /> No
                                </button>
                            </div>
                        )}

                        {/* Clear Confirm */}
                        {showClearConfirm && (
                            <div className="est-save-form" style={{ background: 'var(--bg-tertiary)' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1 }}>Clear all items?</span>
                                <button
                                    className="est-action-btn"
                                    style={{ flex: 'none', background: 'var(--danger)', color: 'white', borderColor: 'var(--danger)' }}
                                    onClick={handleConfirmClear}
                                >
                                    <Check size={13} /> Yes
                                </button>
                                <button
                                    className="est-action-btn"
                                    style={{ flex: 'none' }}
                                    onClick={() => setShowClearConfirm(false)}
                                >
                                    <X size={13} /> No
                                </button>
                            </div>
                        )}

                        {!showSaveForm && !showUpdateConfirm && !showClearConfirm && (
                            <div className="estimate-actions">
                                <button
                                    className="est-action-btn est-save-btn"
                                    onClick={activeEstimateId ? () => setShowUpdateConfirm(true) : handleOpenSaveForm}
                                    title={activeEstimateId ? "Update this estimate" : "Save this estimate"}
                                >
                                    <Save size={13} /> {activeEstimateId ? "Update" : "Save"}
                                </button>
                                {(() => {
                                    const tier = user?.subscription_tier || 'free';
                                    const canExport = tier === 'plus' || tier === 'pro';
                                    return (
                                        <button
                                            className={`est-action-btn est-export-btn${!canExport ? ' est-export-btn--locked' : ''}`}
                                            onClick={canExport ? handleExportExcel : () => toast('Upgrade to Plus or Pro to export', { icon: '🔒' })}
                                            title={canExport ? (tier === 'pro' ? 'Export to Excel (custom format available — contact us)' : 'Export to Excel') : 'Export available on Plus & Pro plans'}
                                        >
                                            {canExport ? <Download size={13} /> : <Lock size={13} />}
                                            {' Excel'}{!canExport && ' ↗'}
                                        </button>
                                    );
                                })()}
                                <button className="est-action-btn est-clear-btn" onClick={() => setShowClearConfirm(true)}>
                                    <RotateCcw size={13} /> Clear
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </aside>
        </>
    );
}
