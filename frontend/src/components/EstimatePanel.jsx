import { useState } from 'react';
import { ShoppingCart, Trash2, Download, RotateCcw, Pencil, Check } from 'lucide-react';
import { useEstimate } from '../context/EstimateContext';
import { formatPrice } from '../services/azurePricingApi';

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

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
                '', // Custom Name
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
                        <button className="btn-primary" onClick={handleExportExcel}>
                            <Download size={14} />
                            Convert to Excel
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
