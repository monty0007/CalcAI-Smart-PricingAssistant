import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Download, Plus, RefreshCw, FileSpreadsheet, ChevronRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchServicePricing, formatPrice, searchPrices, fetchVmList } from '../services/azurePricingApi';
import { useEstimate } from '../context/EstimateContext';
import { POPULAR_SERVICES } from '../data/serviceCatalog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'github-markdown-css/github-markdown.css';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

// ── Env config ───────────────────────────────────────────────────────
const AI_ENDPOINT = import.meta.env.VITE_OPENAI_ENDPOINT;
const AI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const AI_MODEL = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';

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
        content: `You are a strict Azure Pricing Assistant. You must ONLY answer questions related to Azure services, cloud computing, and pricing. If the user asks about anything else, politely decline and say you can only help with Azure pricing.

CRITICAL RULES FOR PRICING:
1. You MUST ONLY use the real-time pricing data provided below to answer pricing queries.
2. DO NOT use your pre-trained knowledge or internet data to guess prices.
3. If the provided pricing data does not contain the answer to a pricing question, you must say: "I don't have the exact pricing for that in my current database context. Please try searching for a more specific service."

When pricing data is provided, you MUST output the data as a clean Markdown table.
The table must include these exact columns:
| Service / SKU | Product | Region | Price | Unit |

Do not write long paragraphs or conversational filler. Simply provide the table and a one-sentence summary or recommendation if necessary.
${pricingContext ? `\n\n=== REAL-TIME PRICING DATA FROM DATABASE ===\n${pricingContext}\n==============================================` : ''}`
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
    const [isAdded, setIsAdded] = useState(false);

    const handleAdd = () => {
        if (isAdded) return;
        onAddToEstimate(item);
        setIsAdded(true);
        toast.success(`Added ${item.name} to estimate`);
        setTimeout(() => setIsAdded(false), 2000);
    };

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
                <button
                    className={`ai-add-btn ${isAdded ? 'added' : ''}`}
                    onClick={handleAdd}
                    disabled={isAdded}
                >
                    {isAdded ? '✓ Added' : <><Plus size={12} /> Add to Estimate</>}
                </button>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function AiPage() {
    const { currency, addItem } = useEstimate();
    const navigate = useNavigate();
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
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }

        const userMsgId = msgIdRef.current++;
        setMessages(prev => [...prev.slice(-9), { id: userMsgId, role: 'user', content: query, type: 'text' }]);
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
                // Extract keywords, removing common stop words
                const stopWords = ['can', 'you', 'list', 'some', 'for', 'me', 'the', 'a', 'an', 'is', 'what', 'how', 'much', 'does', 'cost', 'price', 'pricing', 'of', 'in', 'show', 'tell', 'about'];
                const keywords = query.split(' ')
                    .filter(w => {
                        const word = w.toLowerCase().replace(/[^a-z0-9_]/g, '');
                        return word.length >= 2 && !stopWords.includes(word);
                    }).join(' ');

                const lowerQuery = query.toLowerCase();
                let data = { items: [] };

                // Fast path for specific VM queries
                const isVmQuery = lowerQuery.includes('standard_') || lowerQuery.includes('basic_') || lowerQuery.includes('vms') || lowerQuery.includes('vm ') || lowerQuery.match(/\b[a-z]+\d+[a-z]*\s*v\d+\b/);

                if (isVmQuery) {
                    // Try to find an exact standard/basic term, or just use the generated keywords
                    const vmTerm = query.split(' ').find(w => w.toLowerCase().startsWith('standard_') || w.toLowerCase().startsWith('basic_')) || keywords;

                    if (vmTerm) {
                        const vmData = await fetchVmList({ search: vmTerm, region: parsed.region, currency, limit: 10 }).catch(() => ({ items: [] }));
                        if (vmData.items?.length > 0) {
                            data.items = vmData.items.map(vm => ({
                                skuName: vm.skuName,
                                productName: 'Virtual Machines',
                                retailPrice: vm.linuxPrice > 0 ? vm.linuxPrice : (vm.windowsPrice || 0),
                                unitOfMeasure: '1 Hour',
                                location: vm.bestRegion || parsed.region,
                                currencyCode: currency,
                                original: vm
                            }));
                        }
                    }

                    // If it was a VM query but no specific SKU was found, fetch generic popular VMs as context
                    if (data.items.length === 0) {
                        const genericVmData = await fetchVmList({ search: '', region: parsed.region, currency, limit: 10 }).catch(() => ({ items: [] }));
                        if (genericVmData.items?.length > 0) {
                            data.items = genericVmData.items.map(vm => ({
                                skuName: vm.skuName,
                                productName: 'Virtual Machines',
                                retailPrice: vm.linuxPrice > 0 ? vm.linuxPrice : (vm.windowsPrice || 0),
                                unitOfMeasure: '1 Hour',
                                location: vm.bestRegion || parsed.region,
                                currencyCode: currency,
                                original: vm
                            }));
                        }
                    }
                }

                // Fallback to full-text search if not a VM query, or if still empty
                if (data.items.length === 0 && keywords.trim().length >= 2 && keywords !== 'vms' && keywords !== 'hi' && keywords !== 'hello') {
                    data = await searchPrices(keywords, parsed.region, currency).catch(() => ({ items: [] }));
                }

                if (data.items.length > 0) {
                    const sorted = [...data.items].sort((a, b) => a.retailPrice - b.retailPrice);
                    pricingData = sorted.slice(0, 10).map(item => ({
                        name: item.skuName || item.meterName || 'Service SKU',
                        product: item.productName || 'Azure Service',
                        price: item.retailPrice,
                        unit: item.unitOfMeasure || 'hour',
                        region: item.location || parsed.region,
                        currency: item.currencyCode || currency,
                        original: item.original || item,
                    }));
                    pricingContext = pricingData.slice(0, 5).map(p =>
                        `${p.name}: ${formatPrice(p.price, currency)}/${p.unit} (${p.region})`
                    ).join('\n');
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

            setMessages(prev => [...prev.slice(-9), {
                id: msgIdRef.current++,
                role: 'bot',
                content: responseText,
                type: pricingData ? 'pricing' : 'text',
                pricingData,
                region: parsed.region,
            }]);
        } catch (err) {
            setMessages(prev => [...prev.slice(-9), {
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
            {/* ── Left Sidebar (History) ───────────────────────── */}
            <div className="ai-sidebar">
                <div className="ai-sidebar-header">
                    <button className="ai-back-btn" onClick={() => navigate(-1)} title="Back to Dashboard">
                        <ArrowLeft size={18} />
                    </button>
                    <h2>Chat History</h2>
                </div>
                <div className="ai-sidebar-content">
                    <div className="ai-history-label">Today</div>
                    <button className="ai-history-btn">Azure VM Comparison</button>
                    <button className="ai-history-btn">Cheapest Database Options</button>
                    <div className="ai-history-label" style={{ marginTop: '20px' }}>Previous 7 Days</div>
                    <button className="ai-history-btn">Blob Storage vs Data Lake</button>
                    <button className="ai-history-btn">AKS Node Sizing</button>
                </div>
            </div>

            {/* ── Main Chat Area ──────────────────────────────── */}
            <div className="ai-main">
                {/* ── Header ──────────────────────────────────────── */}
                <div className="ai-header-wrapper">
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
                                <div className="ai-bubble__text markdown-body">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>

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
                            style={{ resize: 'none', overflowY: 'auto', minHeight: '44px' }}
                            rows={1}
                            placeholder="Ask about Azure pricing… (e.g. cheapest VM in India)"
                            value={input}
                            onChange={e => {
                                setInput(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                            }}
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
        </div>
    );
}
