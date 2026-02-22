import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Download, Plus, RefreshCw, FileSpreadsheet, ChevronRight } from 'lucide-react';
import { fetchServicePricing, formatPrice, searchPrices } from '../services/azurePricingApi';
import { useEstimate } from '../context/EstimateContext';
import { POPULAR_SERVICES } from '../data/serviceCatalog';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ── Env config ───────────────────────────────────────────────────────
const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT;
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY;
const AI_MODEL = import.meta.env.VITE_AI_MODEL || 'gpt-4o-mini';

// ── Suggested prompts ────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
    { icon: '💻', text: "Cheapest VM in Central India" },
    { icon: '🗄️', text: "Azure SQL Database pricing" },
    { icon: '☸️', text: "Kubernetes (AKS) pricing" },
    { icon: '🪣', text: "Blob Storage cost comparison" },
    { icon: '⚡', text: "Azure Functions cost" },
    { icon: '🔍', text: "Cheapest database options" },
];

// ── Region keyword map ───────────────────────────────────────────────
const REGION_MAP = {
    'west us': 'westus', westus: 'westus',
    'west europe': 'westeurope', europe: 'westeurope',
    'east asia': 'eastasia', asia: 'eastasia',
    india: 'centralindia', 'central india': 'centralindia',
    'south india': 'southindia', uk: 'uksouth', 'uk south': 'uksouth',
    japan: 'japaneast', australia: 'australiaeast', canada: 'canadacentral',
    'east us': 'eastus', eastus: 'eastus',
};

function parseQuery(query) {
    const lower = query.toLowerCase();

    const matchedService = POPULAR_SERVICES.find(s =>
        lower.includes(s.serviceName.toLowerCase()) ||
        lower.includes(s.serviceName.toLowerCase().replace('azure ', ''))
    );

    let region = 'eastus';
    for (const [key, val] of Object.entries(REGION_MAP)) {
        if (lower.includes(key)) { region = val; break; }
    }

    let intent = 'general';
    if (lower.includes('cheap') || lower.includes('lowest') || lower.includes('cheapest')) intent = 'cheapest';
    if (lower.includes('compar')) intent = 'compare';
    if (lower.includes('how much') || lower.includes('cost') || lower.includes('pric')) intent = 'pricing';

    return { matchedService, region, intent, query };
}

// ── AI call ──────────────────────────────────────────────────────────
async function callAI(messages, pricingContext) {
    if (!AI_ENDPOINT || !AI_API_KEY) return null;

    const systemMsg = {
        role: 'system',
        content: `You are an Azure Pricing Expert. Help users understand Azure service pricing clearly and in detail.
When pricing data is provided, give a structured breakdown with:
- What the service/SKU is and when to use it
- The cost implications and what drives the price
- Comparison between options if multiple are shown
- Practical recommendations based on cost/performance

Keep responses concise but informative. Use markdown formatting, bullet points, and bold for prices.
${pricingContext ? `\n\nReal-time pricing data from the Azure API:\n${pricingContext}` : ''}`
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
                messages: [systemMsg, ...messages.slice(-8)],
                max_tokens: 800,
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

// ── Simple markdown renderer ─────────────────────────────────────────
function renderMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^#{1,3}\s(.+)$/gm, '<strong class="md-heading">$1</strong>')
        .replace(/^[-•]\s(.+)$/gm, '<div class="md-bullet">• $1</div>')
        .replace(/\n\n/g, '<br/><br/>')
        .replace(/\n/g, '<br/>');
}

// ── Excel export ─────────────────────────────────────────────────────
async function exportToExcel(pricingData, currency) {
    if (!pricingData || pricingData.length === 0) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('AI Pricing Results');
    ws.columns = [
        { header: 'Service / SKU', key: 'name', width: 35 },
        { header: 'Product', key: 'product', width: 40 },
        { header: 'Region', key: 'region', width: 20 },
        { header: `Price (${currency})`, key: 'price', width: 16 },
        { header: 'Unit', key: 'unit', width: 18 },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0078D4' } };

    pricingData.forEach(p => {
        ws.addRow({ name: p.name, product: p.product, region: p.region, price: p.price, unit: p.unit });
    });
    ws.eachRow({ includeEmpty: false }, (row, i) => {
        if (i > 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } };
    });

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `Azure_Pricing_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── Typing indicator ─────────────────────────────────────────────────
function TypingIndicator() {
    return (
        <div className="ai-msg ai-msg--bot">
            <div className="ai-avatar ai-avatar--bot"><Bot size={16} /></div>
            <div className="ai-bubble ai-bubble--bot">
                <div className="ai-typing">
                    <span /><span /><span />
                </div>
            </div>
        </div>
    );
}

// ── Pricing card ─────────────────────────────────────────────────────
function PricingCard({ item, currency, onAddToEstimate }) {
    return (
        <div className="ai-price-card">
            <div className="ai-price-card__header">
                <div className="ai-price-card__name">{item.name}</div>
                <div className="ai-price-card__price">
                    {formatPrice(item.price, currency)}
                    <span className="ai-price-card__unit">/{item.unit}</span>
                </div>
            </div>
            <div className="ai-price-card__sub">{item.product}</div>
            <div className="ai-price-card__footer">
                <span className="ai-price-card__region">📍 {item.region}</span>
                <button className="ai-add-btn" onClick={() => onAddToEstimate(item)}>
                    <Plus size={12} /> Add to Estimate
                </button>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function AiPage() {
    const { currency, addItem } = useEstimate();
    const hasAI = Boolean(AI_ENDPOINT && AI_API_KEY);

    const [messages, setMessages] = useState([{
        id: 0,
        role: 'bot',
        content: `Hi! I'm your **Azure Pricing Assistant**.\n\nAsk me anything about Azure service costs — I'll fetch real pricing data and explain it clearly. ${hasAI ? 'AI analysis is enabled.' : 'Connect an AI key in `.env` for enhanced explanations.'}`,
        type: 'text',
    }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const msgIdRef = useRef(1);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    function handleAddToEstimate(item) {
        addItem({
            serviceName: item.original?.serviceName || item.product,
            productName: item.original?.productName || item.product,
            skuName: item.original?.skuName || item.name,
            meterName: item.original?.meterName || item.name,
            retailPrice: item.original?.retailPrice || item.price,
            unitOfMeasure: item.original?.unitOfMeasure || item.unit,
            armRegionName: item.original?.armRegionName || item.region,
            location: item.original?.location || item.region,
            currencyCode: item.original?.currencyCode || currency,
        });
    }

    async function handleSend(text) {
        const query = (text || input).trim();
        if (!query || loading) return;
        setInput('');

        const userMsgId = msgIdRef.current++;
        setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: query, type: 'text' }]);
        setLoading(true);

        try {
            const parsed = parseQuery(query);
            let pricingData = null;
            let pricingContext = '';

            if (parsed.matchedService) {
                const data = await fetchServicePricing(parsed.matchedService.serviceName, parsed.region, currency);
                if (data.items.length > 0) {
                    const sorted = [...data.items].sort((a, b) => a.retailPrice - b.retailPrice);
                    pricingData = sorted.slice(0, 10).map(item => ({
                        name: item.skuName || item.meterName || 'Service SKU',
                        product: item.productName || parsed.matchedService.serviceName,
                        price: item.retailPrice,
                        unit: item.unitOfMeasure || 'hour',
                        region: item.location || parsed.region,
                        currency: item.currencyCode || currency,
                        original: item,
                    }));
                    pricingContext = pricingData.slice(0, 5).map(p =>
                        `${p.name}: ${formatPrice(p.price, currency)}/${p.unit} (${p.region})`
                    ).join('\n');
                }
            } else {
                const keywords = query.split(' ').filter(w => w.length > 3).join(' ');
                if (keywords) {
                    const data = await searchPrices(keywords, parsed.region, currency).catch(() => ({ items: [] }));
                    if (data.items.length > 0) {
                        const sorted = [...data.items].sort((a, b) => a.retailPrice - b.retailPrice);
                        pricingData = sorted.slice(0, 10).map(item => ({
                            name: item.skuName || item.meterName || 'Service SKU',
                            product: item.productName || 'Azure Service',
                            price: item.retailPrice,
                            unit: item.unitOfMeasure || 'hour',
                            region: item.location || parsed.region,
                            currency: item.currencyCode || currency,
                            original: item,
                        }));
                        pricingContext = pricingData.slice(0, 5).map(p =>
                            `${p.name}: ${formatPrice(p.price, currency)}/${p.unit} (${p.region})`
                        ).join('\n');
                    }
                }
            }

            // Build AI or template response
            let aiText = null;
            if (hasAI) {
                const aiMessages = messages
                    .filter(m => m.type === 'text')
                    .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content }));
                aiMessages.push({ role: 'user', content: query });
                aiText = await callAI(aiMessages, pricingContext);
            }

            let responseText = '';
            if (aiText) {
                responseText = aiText;
            } else if (pricingData?.length > 0) {
                const svc = parsed.matchedService?.serviceName || 'matching services';
                const regionLabel = parsed.region.replace(/([A-Z])/g, ' $1').trim();
                if (parsed.intent === 'cheapest') {
                    responseText = `Here are the **cheapest ${svc}** options in **${regionLabel}**, sorted by price:`;
                } else {
                    responseText = `Found **${pricingData.length} pricing options** for **${svc}** in **${regionLabel}**. Here are the top results:`;
                }
                responseText += `\n\nYou can add any option to your estimate or **export all results to Excel**.`;
            } else {
                responseText = `I couldn't find specific pricing for that query. Try asking about:\n\n• **Virtual Machines** — e.g. "cheapest VM in India"\n• **Storage** — e.g. "blob storage pricing"\n• **Databases** — e.g. "Azure SQL cost"\n• **Containers** — e.g. "AKS pricing"\n\nOr be more specific about the service you need!`;
            }

            setMessages(prev => [...prev, {
                id: msgIdRef.current++,
                role: 'bot',
                content: responseText,
                type: pricingData ? 'pricing' : 'text',
                pricingData,
                region: parsed.region,
            }]);
        } catch (err) {
            setMessages(prev => [...prev, {
                id: msgIdRef.current++,
                role: 'bot',
                content: `Something went wrong: ${err.message}. Please try again.`,
                type: 'text',
            }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    }

    const handleKeyDown = e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const showSuggestions = messages.length <= 1 && !loading;

    return (
        <div className="ai-page">
            {/* ── Header ──────────────────────────────────────── */}
            <div className="ai-header">
                <div className="ai-header__icon">
                    <Sparkles size={20} />
                </div>
                <div>
                    <h1 className="ai-header__title">Azure Pricing Assistant</h1>
                    <p className="ai-header__sub">Ask about any Azure service — get real pricing data instantly</p>
                </div>
                <div className="ai-header__status">
                    <span className={`ai-status-dot ${hasAI ? 'active' : ''}`} />
                    <span>{hasAI ? 'AI Enhanced' : 'Data Mode'}</span>
                </div>
            </div>

            {/* ── Chat area ───────────────────────────────────── */}
            <div className="ai-chat-area">
                {/* Suggested prompts */}
                {showSuggestions && (
                    <div className="ai-suggestions">
                        <p className="ai-suggestions__label">Try asking:</p>
                        <div className="ai-suggestions__grid">
                            {SUGGESTED_PROMPTS.map((p, i) => (
                                <button
                                    key={i}
                                    className="ai-suggestion-pill"
                                    onClick={() => handleSend(p.text)}
                                >
                                    <span>{p.icon}</span> {p.text}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Messages */}
                {messages.map(msg => (
                    <div
                        key={msg.id}
                        className={`ai-msg ai-msg--${msg.role}`}
                    >
                        <div className={`ai-avatar ai-avatar--${msg.role}`}>
                            {msg.role === 'bot' ? <Bot size={15} /> : <User size={15} />}
                        </div>
                        <div className={`ai-bubble ai-bubble--${msg.role}`}>
                            {/* Text content */}
                            <div
                                className="ai-bubble__text"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                            />

                            {/* Pricing cards */}
                            {msg.pricingData && msg.pricingData.length > 0 && (
                                <div className="ai-pricing-section">
                                    <div className="ai-pricing-grid">
                                        {msg.pricingData.map((item, i) => (
                                            <PricingCard
                                                key={i}
                                                item={item}
                                                currency={currency}
                                                onAddToEstimate={handleAddToEstimate}
                                            />
                                        ))}
                                    </div>
                                    <div className="ai-pricing-actions">
                                        <button
                                            className="ai-excel-btn"
                                            onClick={() => exportToExcel(msg.pricingData, currency)}
                                        >
                                            <FileSpreadsheet size={14} /> Convert to Excel
                                        </button>
                                        <button
                                            className="ai-followup-btn"
                                            onClick={() => {
                                                setInput(`Tell me more about the cheapest option from the previous results`);
                                                inputRef.current?.focus();
                                            }}
                                        >
                                            <ChevronRight size={13} /> Ask more details
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && <TypingIndicator />}
                <div ref={messagesEndRef} />
            </div>

            {/* ── Input box ───────────────────────────────────── */}
            <div className="ai-input-area">
                <div className="ai-input-wrap">
                    <textarea
                        ref={inputRef}
                        className="ai-input"
                        rows={1}
                        placeholder="Ask about Azure pricing… (e.g. cheapest VM in India)"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button
                        className={`ai-send-btn ${loading || !input.trim() ? 'disabled' : ''}`}
                        onClick={() => handleSend()}
                        disabled={loading || !input.trim()}
                    >
                        {loading ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                    </button>
                </div>
                <p className="ai-input-hint">
                    Prices are fetched live from Microsoft Azure · Press <kbd>Enter</kbd> to send
                </p>
            </div>
        </div>
    );
}
