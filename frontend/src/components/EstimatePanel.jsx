import { useState } from 'react';
import { ShoppingCart, Trash2, Download, RotateCcw, Pencil, Check } from 'lucide-react';
import { useEstimate } from '../context/EstimateContext';
import { formatPrice } from '../services/azurePricingApi';

export default function EstimatePanel() {
    const {
        items, currency, removeItem, updateItem,
        clearAll, totalMonthlyCost, refreshing,
    } = useEstimate();
    const [editingId, setEditingId] = useState(null);
    const [editPrice, setEditPrice] = useState('');

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

    function handleExport() {
        const lines = [
            'Azure Pricing Estimate',
            `Currency: ${currency}`,
            `Generated: ${new Date().toLocaleDateString()}`,
            '',
            'Services:',
            '─'.repeat(60),
        ];

        items.forEach((item, i) => {
            const monthlyPrice = calculateItemMonthly(item);
            lines.push(`${i + 1}. ${item.serviceName} - ${item.skuName || item.meterName}`);
            lines.push(`   Region: ${item.location || item.armRegionName}`);
            lines.push(`   Unit Price: ${formatPrice(item.retailPrice, currency)} / ${item.unitOfMeasure}`);
            lines.push(`   Qty: ${item.quantity} | Hours/Mo: ${item.hoursPerMonth}`);
            lines.push(`   Monthly: ${formatPrice(monthlyPrice, currency)}`);
            lines.push('');
        });

        lines.push('─'.repeat(60));
        lines.push(`TOTAL ESTIMATED MONTHLY COST: ${formatPrice(totalMonthlyCost, currency)}`);
        lines.push(`TOTAL ESTIMATED YEARLY COST: ${formatPrice(totalMonthlyCost * 12, currency)}`);

        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `azure-estimate-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
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

    return (
        <aside className="estimate-panel">
            <div className="estimate-header">
                <h3>
                    <ShoppingCart size={16} />
                    Your Estimate
                    {items.length > 0 && <span className="item-count">{items.length}</span>}
                </h3>
            </div>

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

            <div className="estimate-items">
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
                                <div>
                                    <div className="estimate-item-name">{item.serviceName}</div>
                                    <div className="estimate-item-sku">{item.skuName || item.meterName}</div>
                                    <div className="estimate-item-sku">{item.location || item.armRegionName}</div>
                                </div>
                                <button
                                    className="estimate-item-remove"
                                    onClick={() => removeItem(item.id)}
                                    title="Remove"
                                >
                                    <Trash2 size={14} />
                                </button>
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
                    <div className="estimate-actions">
                        <button className="btn-primary" onClick={handleExport}>
                            <Download size={14} />
                            Export
                        </button>
                        <button className="btn-secondary" onClick={clearAll}>
                            <RotateCcw size={14} />
                            Clear
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
}
