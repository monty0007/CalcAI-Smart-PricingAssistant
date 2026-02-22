import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Download } from 'lucide-react';
import { fetchServicePricing, formatPrice, searchPrices } from '../services/azurePricingApi';
import { useEstimate } from '../context/EstimateContext';
import { POPULAR_SERVICES } from '../data/serviceCatalog';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT;
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY;
const AI_MODEL = import.meta.env.VITE_AI_MODEL || 'gpt-4o-mini';

const SUGGESTED_PROMPTS = [
    "What's the cheapest VM in East US?",
    "Compare storage pricing options",
    "How much does Azure SQL cost?",
    "Show me Azure Kubernetes pricing",
    "Cheapest database options?",
    "Azure Functions pricing",
];

function parseQuery(query) {
    const lower = query.toLowerCase();

    const matchedService = POPULAR_SERVICES.find(s =>
        lower.includes(s.serviceName.toLowerCase()) ||
        lower.includes(s.serviceName.toLowerCase().replace('azure ', ''))
    );

    let region = 'eastus';
    const regionMap = {
        'west us': 'westus', 'westus': 'westus',
        'west europe': 'westeurope', 'europe': 'westeurope',
        'east asia': 'eastasia', 'asia': 'eastasia',
        'india': 'centralindia', 'central india': 'centralindia',
        'south india': 'southindia', 'uk': 'uksouth', 'uk south': 'uksouth',
        'japan': 'japaneast', 'australia': 'australiaeast', 'canada': 'canadacentral',
    };
    for (const [key, val] of Object.entries(regionMap)) {
        if (lower.includes(key)) { region = val; break; }
    }

    let intent = 'general';
    if (lower.includes('cheap') || lower.includes('lowest')) intent = 'cheapest';
    if (lower.includes('compar')) intent = 'compare';
    if (lower.includes('how much') || lower.includes('cost') || lower.includes('pric')) intent = 'pricing';

    return { matchedService, region, intent, query };
}

async function callAI(messages, pricingContext) {
    if (!AI_ENDPOINT || !AI_API_KEY) return null;

    const systemMsg = {
        role: 'system',
        content: `You are an Azure Pricing Assistant. Help users understand Azure pricing. Provide detailed explanations and breakdown of the pricing. Reply with details about the services requested, explaining cost differences where applicable. ${pricingContext ? `\n\nRelevant pricing data:\n${pricingContext}` : ''}`
    };

    try {
        const res = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [systemMsg, ...messages.slice(-6)],
                max_tokens: 500,
                temperature: 0.7,
            }),
        });

        if (!res.ok) return null;
        const data = await res.json();
        return data.choices?.[0]?.message?.content || null;
    } catch {
        return null;
    }
}

export default function AiPage() {
    const [messages, setMessages] = useState([
        {
            role: 'bot',
            content: "Hi! I'm your Azure Pricing Assistant. Ask me about Azure service pricing, compare costs, or find the cheapest options. I fetch real-time data from Microsoft's pricing API!",
            type: 'text',
        },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const { currency, addItem } = useEstimate();
    const hasAI = Boolean(AI_ENDPOINT && AI_API_KEY);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function handleSend(text) {
        const query = text || input.trim();
        if (!query || loading) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: query, type: 'text' }]);
        setLoading(true);

        try {
            const parsed = parseQuery(query);
            let pricingData = null;
            let pricingContext = '';

            // Fetch pricing data
            if (parsed.matchedService) {
                const data = await fetchServicePricing(parsed.matchedService.serviceName, parsed.region, currency);
                if (data.items.length > 0) {
                    const sorted = [...data.items].sort((a, b) => a.retailPrice - b.retailPrice);
                    pricingData = sorted.slice(0, 5).map(item => ({
                        name: item.skuName || item.meterName,
                        product: item.productName,
                        price: item.retailPrice,
                        unit: item.unitOfMeasure,
                        region: item.location,
                        currency: item.currencyCode,
                        original: item,
                    }));
                    pricingContext = pricingData.map(p => `${p.name}: ${formatPrice(p.price, currency)}/${p.unit}`).join('\n');
                }
            } else {
                const keywords = query.split(' ').filter(w => w.length > 3);
                if (keywords.length > 0) {
                    try {
                        const data = await searchPrices(keywords.join(' '), parsed.region, currency);
                        if (data.items.length > 0) {
                            const sorted = [...data.items].sort((a, b) => a.retailPrice - b.retailPrice);
                            pricingData = sorted.slice(0, 5).map(item => ({
                                name: item.skuName || item.meterName,
                                product: item.productName,
                                price: item.retailPrice,
                                unit: item.unitOfMeasure,
                                region: item.location,
                                currency: item.currencyCode,
                                original: item,
                            }));
                            pricingContext = pricingData.map(p => `${p.name}: ${formatPrice(p.price, currency)}/${p.unit}`).join('\n');
                        }
                    } catch { /* fallback to text response */ }
                }
            }

            // Try AI response if configured
            let aiText = null;
            if (hasAI) {
                const aiMessages = messages
                    .filter(m => m.type === 'text')
                    .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content }));
                aiMessages.push({ role: 'user', content: query });
                aiText = await callAI(aiMessages, pricingContext);
            }

            // Build response
            let responseText = '';
            if (aiText) {
                responseText = aiText;
            } else if (pricingData) {
                const serviceName = parsed.matchedService?.serviceName || 'matching services';
                if (parsed.intent === 'cheapest') {
                    responseText = `Here are the **cheapest ${serviceName}** options in **${parsed.region}**:`;
                } else {
                    responseText = `Found pricing for **${serviceName}** in **${parsed.region}**. Here are the top options:`;
                }
            } else {
                responseText = `I can help with Azure pricing! Try asking about specific services:\n\n• "Virtual Machines pricing"\n• "How much does Azure SQL cost?"\n• "Cheapest storage option"\n• "Compare Kubernetes pricing"`;
            }

            setMessages(prev => [...prev, {
                role: 'bot',
                content: responseText,
                type: pricingData ? 'pricing' : 'text',
                pricingData,
                totalOptions: pricingData?.length || 0,
            }]);
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'bot',
                content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
                type: 'text',
            }]);
        } finally {
            setLoading(false);
        }
    }

    async function handleExportExcel(pricingData) {
        if (!pricingData || pricingData.length === 0) return;

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('AI Estimate');

        ws.columns = [
            { width: 35 }, // Service
            { width: 45 }, // SKU/Name
            { width: 20 }, // Region
            { width: 22 }, // Price
            { width: 15 }  // Unit
        ];

        // Title row
        const titleRow = ws.addRow(["Azure AI Pricing Assistant Results"]);
        titleRow.font = { size: 14, color: { argb: 'FF333333' } };
        ws.mergeCells('A1:E1');

        ws.addRow([]);

        // Header
        const headerRow = ws.addRow([
            "Service / Product", "SKU Name", "Region", "Estimated Reference Price", "Unit"
        ]);

        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9EAF7' }
            };
            cell.font = { size: 11, color: { argb: 'FF333333' }, bold: true };
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } }
            };
        });

        pricingData.forEach(item => {
            const dataRow = ws.addRow([
                item.product,
                item.name,
                item.region,
                formatPrice(item.price, currency),
                `per ${item.unit}`
            ]);
            dataRow.eachCell(cell => {
                cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
                cell.border = { bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } } };
            });
        });

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `Azure_AI_Pricing_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    function handleAddToEstimate(item) {
        addItem({
            serviceName: item.original.serviceName,
            productName: item.original.productName,
            skuName: item.original.skuName,
            meterName: item.original.meterName,
            retailPrice: item.original.retailPrice,
            unitOfMeasure: item.original.unitOfMeasure,
            armRegionName: item.original.armRegionName,
            location: item.original.location,
            currencyCode: item.original.currencyCode,
        });
    }

    return (
        <div className="ai-page">
            <div className="ai-header">
                <h1>
                    <Sparkles size={22} />
                    AI Pricing Assistant
                </h1>
                <p>Ask anything about Azure pricing — real-time data from Microsoft</p>
            </div>

            {!hasAI && (
                <div className="ai-no-endpoint">
                    <strong>Built-in mode</strong> — Using keyword matching for pricing queries.
                    Set <code>VITE_AI_ENDPOINT</code> and <code>VITE_AI_API_KEY</code> in <code>.env</code> for AI-powered responses.
                </div>
            )}

            <div className="chat-container">
                <div className="chat-messages">
                    {messages.map((msg, i) => (
                        <div key={i} className={`chat-message ${msg.role}`}>
                            <div className="chat-avatar">
                                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                            </div>
                            <div className="chat-bubble">
                                <div dangerouslySetInnerHTML={{
                                    __html: msg.content
                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                        .replace(/\n/g, '<br/>')
                                }} />
                                {msg.type === 'pricing' && msg.pricingData && (
                                    <>
                                        <div className="pricing-results">
                                            {msg.pricingData.map((item, j) => (
                                                <div
                                                    key={j}
                                                    className="pricing-result-card"
                                                    onClick={() => handleAddToEstimate(item)}
                                                    title="Click to add to estimate"
                                                >
                                                    <div>
                                                        <div className="name">{item.name}</div>
                                                        <div className="meta">{item.product} • {item.region}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div className="price">{formatPrice(item.price, currency)}</div>
                                                        <div className="meta">/{item.unit}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                                            <button
                                                className="btn btn-secondary chat-export-btn"
                                                onClick={() => handleExportExcel(msg.pricingData)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', background: 'var(--surface)', border: '1px solid var(--border-primary)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)' }}
                                            >
                                                <Download size={14} />
                                                Convert to Excel
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="chat-message bot">
                            <div className="chat-avatar"><Bot size={14} /></div>
                            <div className="chat-bubble">
                                <div className="loading-spinner" style={{ padding: '6px', flexDirection: 'row', gap: '8px' }}>
                                    <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                                    Fetching pricing...
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="suggested-prompts">
                    {SUGGESTED_PROMPTS.map((prompt, i) => (
                        <button key={i} className="suggested-prompt" onClick={() => handleSend(prompt)}>
                            {prompt}
                        </button>
                    ))}
                </div>

                <div className="chat-input-area">
                    <input
                        type="text"
                        className="chat-input"
                        placeholder="Ask about Azure pricing..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        disabled={loading}
                    />
                    <button
                        className="chat-send-btn"
                        onClick={() => handleSend()}
                        disabled={!input.trim() || loading}
                    >
                        <Send size={14} />
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
