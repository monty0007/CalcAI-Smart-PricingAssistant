import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Download, Plus, RefreshCw, FileSpreadsheet, ChevronRight, ArrowLeft, Trash2, X, Loader2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchServicePricing, formatPrice, searchPrices, fetchVmList, calculateEstimate } from '../services/azurePricingApi';
import { fetchChats, fetchChat, createChat, updateChat, deleteChat } from '../services/aiChatsApi';
import { useEstimate } from '../context/EstimateContext';
import { useAuth } from '../context/AuthContext';
import { POPULAR_SERVICES } from '../data/serviceCatalog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'github-markdown-css/github-markdown.css';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

// ── Env config ───────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
// AI routes through the backend proxy — key never reaches the browser
const AI_PROXY_URL = `${API_BASE}/ai/chat`;
const LOG_URL = `${API_BASE}/logs`;
// Model name is overridden server-side by the deployment env var; this is just a placeholder.
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

// ── Generate contextual follow-up suggestion chips ────────────────────
function generateFollowUps(query, pricingData, parsed) {
    if (!pricingData?.length) return null;
    const lower = query.toLowerCase();
    const suggestions = [];

    // Region comparison
    if (parsed.region !== 'eastus') {
        suggestions.push(`How does East US pricing compare?`);
    } else if (parsed.region !== 'centralindia') {
        suggestions.push(`How does Central India pricing compare?`);
    }

    // Reservation pricing
    if (!lower.includes('reserved') && !lower.includes('reservation') && !lower.includes('1 year') && !lower.includes('3 year')) {
        suggestions.push(`Show 1-year reserved pricing`);
    }

    // Budget alternatives
    if (!lower.includes('cheap') && !lower.includes('budget') && !lower.includes('cheapest')) {
        suggestions.push(`What's the cheapest alternative?`);
    }

    // Monthly breakdown
    if (!lower.includes('breakdown') && !lower.includes('detail')) {
        suggestions.push(`Give a more detailed cost breakdown`);
    }

    // Service-specific follow-ups
    if (lower.includes('vm') || lower.includes('virtual machine') || lower.includes('standard_')) {
        if (!lower.includes('windows')) suggestions.push(`What about Windows pricing?`);
        if (!lower.includes('spot')) suggestions.push(`Show Spot instance pricing`);
    } else if (lower.includes('storage') || lower.includes('blob')) {
        if (!lower.includes('cool') && !lower.includes('archive')) suggestions.push(`Compare Hot vs Cool vs Archive tiers`);
    } else if (lower.includes('aks') || lower.includes('kubernetes')) {
        suggestions.push(`What node size is best for this workload?`);
    }

    return suggestions.slice(0, 3);
}

// ── Detect purely conversational (non-pricing) messages ─────────────
// Only matches PURE greetings/farewells/thanks — nothing that could be a pricing query.
function isConversationalQuery(query) {
    const lower = query.toLowerCase().trim();
    if (lower.length < 35 && /^(hi+|hey+|hello+|howdy|sup|hiya|yo+|good\s?(morning|afternoon|evening|day)|thanks?|thank you|bye|goodbye|see ya|ok|okay|lol|haha|yep|nope|who are you|your name|how (are|r) (you|u))\b/i.test(lower)) return true;
    return false;
}

// ── No-AI fallback: fetch pricing cards directly ─────────────────────
async function fetchFallbackPricing(query, parsed, currency) {
    const lower = query.toLowerCase();
    const stopWords = new Set(['can','you','list','for','me','the','a','an','is','what','how','much','does','cost','price','pricing','of','in','show','tell','about','give','want']);
    const keywords = query.split(/\s+/)
        .filter(w => { const wl = w.toLowerCase().replace(/[^a-z0-9]/g,''); return wl.length >= 2 && !stopWords.has(wl); })
        .join(' ');

    let items = [];

    if (parsed.matchedService) {
        const data = await fetchServicePricing(parsed.matchedService.serviceName, parsed.region, currency).catch(() => ({ items: [] }));
        items = data.items || [];
    }

    if (items.length === 0 && keywords.length >= 3) {
        const data = await searchPrices(keywords, parsed.region, currency).catch(() => ({ items: [] }));
        items = data.items || [];
    }

    if (items.length === 0) return null;

    const sorted = [...items].sort((a, b) => a.retailPrice - b.retailPrice);
    return sorted.slice(0, 6).map(item => ({
        name: item.skuName || item.meterName || 'Service SKU',
        product: item.productName || parsed.matchedService?.serviceName || 'Azure Service',
        price: item.retailPrice,
        unit: item.unitOfMeasure || 'hour',
        region: item.location || parsed.region,
        currency: item.currencyCode || currency,
        original: item,
    }));
}

// ── Detect if message is a pricing-related query ────────────────────
function isPricingQuery(messages) {
    // Look at the last user message
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return false;
    const text = (typeof lastUser.content === 'string' ? lastUser.content : '').toLowerCase();
    const pricingKeywords = [
        'vm', 'virtual machine', 'price', 'pricing', 'cost', 'how much', 'estimate',
        'disk', 'bandwidth', 'storage', 'compute', 'instance', 'server', 'database',
        'monthly', 'annual', 'yearly', 'per hour', 'per month', 'inr', 'usd', 'eur',
        'windows', 'linux', 'd2s', 'd4s', 'd8s', 'd16s', 'b2ms', 'b4ms', 'f4', 'f8', 'e4', 'e8',
        'e2s', 'e4s', 'e8s', 'standard_d', 'standard_f', 'standard_e', 'standard_b',
        'central india', 'east us', 'west us', 'centralindia', 'eastus', 'westus',
        'southindia', 'westeurope', 'eastasia', 'reserved', 'reservation', 'payg',
        'managed disk', 'ssd', 'hdd', 'premium', 'lrs', 'zrs', 'sku', 'tier'
    ];
    return pricingKeywords.some(kw => text.includes(kw));
}

// ── AI call — streaming SSE ──────────────────────────────────────────
async function callAI(messages, pricingContext, currency, depth = 0, _toolResult = null, signal = null, onChunk = null, onThinking = null) {
    if (depth > 3) return { text: "I'm sorry, I encountered too many tool operations to process this effectively.", toolResult: _toolResult };

    // ── Structured system prompt with extraction rules + few-shot ────
    const systemMsg = {
        role: 'system',
        content: `You are an expert Azure Pricing Assistant powered by a live Azure pricing database.

## ━━ PRIME DIRECTIVES ━━
1. **NEVER guess or estimate any price.** All prices MUST come from \`calculate_estimate\` only.
2. **NEVER skip the tool for pricing queries.** Even "How much is a D2s v5?" needs the tool.
3. Call \`calculate_estimate\` ONCE with ALL items in a single array. Never split calls.
4. If the tool returns "no match", state clearly you couldn't find pricing — never substitute numbers.
5. After the tool returns, respond with a Markdown table and a grand total.
6. For greetings, general questions — respond naturally, no tool needed.
7. If a parameter is ambiguous (region, SKU), make your best guess and note it; do NOT ask the user first.

## ━━ PARAMETER EXTRACTION RULES ━━
Extract these from every pricing query before calling the tool:
- **SKU**: The VM size. "D8s v5" → sku: "D8s v5". Strip "Standard_" prefix. "B2 Medium" → sku: "B2ms".
- **Region**: "Central India" → "centralindia". "East US" → "eastus". "West Europe" → "westeurope". "India" alone → "centralindia". Default to "centralindia" if not mentioned.
- **OS**: "Windows server", "Windows VM" → os: "windows". Otherwise → os: "linux".
- **Quantity**: "3 VMs", "×2", "two instances" → quantity: 3/2/2. Default: 1.
- **Hours**: "8 hours/day" → 8×30=240 hours/month. "always on" → 730. Default: 730.
- **Reservation**: "1-year reserved", "1yr RI" → reservation: "1 Year". "3-year" → "3 Year". Default: "".

## ━━ FEW-SHOT EXAMPLES ━━

User: "1 D8s v5 Windows server in Central India with 5 GB data transfer"
Items:
\`\`\`json
[
  {"type":"vm","sku":"D8s v5","os":"windows","region":"centralindia","quantity":1,"name":"D8s v5 Windows"},
  {"type":"bandwidth","sourceRegion":"centralindia","transferType":"internet","dataTransferGB":5,"name":"5 GB Outbound"}
]
\`\`\`

User: "Compare D4s v3 vs E4s v3 in East US (Linux, PAYG)"
Items:
\`\`\`json
[
  {"type":"vm","sku":"D4s v3","os":"linux","region":"eastus","quantity":1,"name":"D4s v3 Linux"},
  {"type":"vm","sku":"E4s v3","os":"linux","region":"eastus","quantity":1,"name":"E4s v3 Linux"}
]
\`\`\`

User: "AKS cluster with 3 D4s_v3 nodes in East US"
Items:
\`\`\`json
[
  {"type":"aks","tier":"standard","nodeVmSku":"D4s v3","nodeCount":3,"region":"eastus","name":"AKS Cluster"}
]
\`\`\`

User: "Redis Cache C1 Standard tier in West Europe"
Items:
\`\`\`json
[
  {"type":"redis","cacheTier":"C1","cacheType":"standard","region":"westeurope","quantity":1,"name":"Redis C1 Standard"}
]
\`\`\`

User: "Azure Functions with 5 million executions per month"
Items:
\`\`\`json
[
  {"type":"functions","executionsMillions":5,"gbSeconds":400000,"name":"Azure Functions"}
]
\`\`\`

## ━━ ITEM TYPES — USE EXACTLY THESE STRINGS ━━
CRITICAL: the "type" field MUST be one of these exact strings. Do NOT use variants like "virtual-machines", "blob-storage", "azure-sql", "kubernetes", etc.
- **"vm"** ← Virtual Machines (NOT "virtual-machines", NOT "compute")
- **"managed_disk"** ← Managed Disks (NOT "disk", NOT "managed-disk")
- **"bandwidth"** ← Data transfer / egress (NOT "egress")
- **"aks"** ← Kubernetes / AKS (NOT "kubernetes")
- **"redis"** ← Redis Cache (NOT "cache", NOT "redis-cache")
- **"api_management"** ← API Management (NOT "apim")
- **"load_balancer"** ← Load Balancer (NOT "lb")
- **"app_service"** ← App Service (NOT "webapp", NOT "app-service")
- **"sql_database"** ← SQL Database (NOT "azure-sql", NOT "sql-database")
- **"cosmos_db"** ← Cosmos DB (NOT "cosmos", NOT "cosmosdb")
- **"functions"** ← Azure Functions (NOT "function", NOT "azure-functions")
- **"storage"** ← Blob/File Storage (NOT "blob-storage", NOT "object-storage")
- **"ip_address"** ← Public IP
- **"defender"** ← Microsoft Defender
- **"monitor"** ← Azure Monitor

## ━━ OUTPUT FORMAT ━━
After tool returns data:
| Service | Configuration | Monthly Cost (${currency}) |
|---------|--------------|--------------------------|
| ...     | ...          | ...                      |
**Grand Total: X.XX ${currency}/month** *(includes all items above)*

One-line infrastructure summary. If any item shows "no match", say: "⚠️ Pricing not found for [name] — try a different SKU or region."

${pricingContext ? `## ━━ LIVE PRICING CONTEXT ━━\n${pricingContext}\n` : ''}Default region: centralindia. Currency: ${currency}. Tool already converts — NEVER reconvert.`
    };

    const useStream = typeof onChunk === 'function';

    try {
        const payload = {
            model: AI_MODEL,
            messages: [systemMsg, ...messages],
            max_completion_tokens: 2500,
            temperature: 0.2,
            stream: useStream && depth > 0, // stream only on the final text response
            tools: [
                {
                    type: "function",
                    function: {
                        name: "calculate_estimate",
                        description: `Calculate monthly Azure costs. Decompose the query into typed items and call ONCE with ALL items.`,
                        parameters: {
                            type: "object",
                            properties: {
                                items: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            type: { type: "string", enum: ["vm","managed_disk","bandwidth","aks","redis","api_management","load_balancer","app_service","sql_database","cosmos_db","functions","storage","ip_address","defender","monitor"] },
                                            name: { type: "string" },
                                            sku: { type: "string" },
                                            os: { type: "string", enum: ["linux","windows"] },
                                            reservation: { type: "string" },
                                            quantity: { type: "number" },
                                            region: { type: "string" },
                                            diskType: { type: "string" },
                                            diskTier: { type: "string" },
                                            diskRedundancy: { type: "string" },
                                            transactions: { type: "number" },
                                            dataTransferGB: { type: "number" },
                                            transferType: { type: "string" },
                                            sourceRegion: { type: "string" },
                                            destinationRegion: { type: "string" },
                                            ipType: { type: "string" },
                                            serverCount: { type: "number" },
                                            dataIngestionGB: { type: "number" },
                                            tier: { type: "string" },
                                            nodeVmSku: { type: "string" },
                                            nodeCount: { type: "number" },
                                            cacheTier: { type: "string" },
                                            cacheType: { type: "string" },
                                            ruleCount: { type: "number" },
                                            capacityGB: { type: "number" },
                                            accessTier: { type: "string" },
                                            redundancy: { type: "string" },
                                            ruPerSecond: { type: "number" },
                                            storageGB: { type: "number" },
                                            executionsMillions: { type: "number" },
                                            gbSeconds: { type: "number" },
                                        },
                                        required: ["type"]
                                    }
                                }
                            },
                            required: ["items"]
                        }
                    }
                }
            ],
            tool_choice: depth === 0 && isPricingQuery(messages)
                ? { type: 'function', function: { name: 'calculate_estimate' } }
                : 'auto'
        };

        const res = await fetch(AI_PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error('AI Proxy Error:', res.status, errText);
            // Surface the actual error to the user instead of silent null
            let detail = '';
            try { detail = JSON.parse(errText)?.error?.message || errText; } catch { detail = errText; }
            return { text: `⚠️ AI error (${res.status}): ${detail}`, toolResult: _toolResult };
        }

        // ── Streaming path (final text response) ─────────────────────
        if (payload.stream && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let done = false;

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') { done = true; break; }
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) {
                                fullText += delta;
                                onChunk(fullText);
                            }
                        } catch { /* skip malformed SSE */ }
                    }
                }
            }
            return { text: fullText, toolResult: _toolResult };
        }

        // ── Non-streaming path (tool call or depth 0) ─────────────────
        const data = await res.json();
        const responseMessage = data.choices?.[0]?.message;
        if (!responseMessage) return { text: null, toolResult: _toolResult };

        if (responseMessage.tool_calls?.length > 0) {
            const toolCall = responseMessage.tool_calls[0];
            if (toolCall.function.name === 'calculate_estimate') {
                try {
                    const args = JSON.parse(toolCall.function.arguments);

                    // Show named thinking step
                    if (onThinking) {
                        const serviceNames = (args.items || []).map(i =>
                            i.name || (i.type === 'vm' ? `${i.sku || 'VM'} ${i.os || ''}`.trim() : i.type)
                        );
                        onThinking(`Fetching live pricing for: ${serviceNames.slice(0, 3).join(', ')}${serviceNames.length > 3 ? ` + ${serviceNames.length - 3} more` : ''}…`);
                    }

                    const backendResult = await calculateEstimate(args.items, currency);

                    if (onThinking) onThinking('Building your cost breakdown…');

                    messages.push(responseMessage);
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: JSON.stringify(backendResult)
                    });

                    return await callAI(messages, pricingContext, currency, depth + 1, backendResult, signal, onChunk, null);
                } catch (e) {
                    console.error("Tool execution error", e);
                    messages.push(responseMessage);
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: JSON.stringify({ error: "Failed to execute tool" })
                    });
                    return await callAI(messages, pricingContext, currency, depth + 1, _toolResult, signal, onChunk, null);
                }
            }
        }

        if (responseMessage.content) {
            if (onChunk) onChunk(responseMessage.content);
            return { text: responseMessage.content, toolResult: _toolResult };
        }

        return { text: null, toolResult: _toolResult };
    } catch (err) {
        if (err.name === 'AbortError') return { text: null, toolResult: null, aborted: true };
        return { text: null, toolResult: null };
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
function TypingIndicator({ thinkingMsg }) {
    return (
        <div className="ai-msg ai-msg--bot">
            <div className="ai-avatar ai-avatar--bot"><Bot size={16} /></div>
            <div className="ai-bubble ai-bubble--bot">
                {thinkingMsg ? (
                    <div className="ai-thinking-status">
                        <Loader2 size={13} className="ai-thinking-spin" />
                        <span>{thinkingMsg}</span>
                    </div>
                ) : (
                    <div className="ai-typing"><span /><span /><span /></div>
                )}
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

// ── Title generation ──────────────────────────────────────────────────
async function generateChatTitle(query) {
    const lower = query.trim().toLowerCase();
    if (lower === 'hi' || lower === 'hello' || lower === 'hey') return 'New Chat';

    // Fallback: capitalise first letter of each word
    const toTitleCase = str => str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    let fallback = toTitleCase(query.slice(0, 30) + (query.length > 30 ? '...' : ''));

    try {
        const res = await fetch(AI_PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: 'Generate a short title (2–4 words, Title Case) for this Azure pricing chat. No quotes, no filler words. Examples: "D8s v5 East US", "AKS Cluster Pricing", "Redis vs SQL Costs". Return "New Chat" only for greetings.' },
                    { role: 'user', content: query }
                ],
                max_completion_tokens: 20,
                temperature: 0.3
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const raw = data.choices?.[0]?.message?.content?.trim();
            if (raw) {
                // Strip surrounding quotes and apply Title Case
                const clean = raw.replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
                return toTitleCase(clean);
            }
        }
    } catch (err) { console.error('Title generation failed:', err); }
    return fallback;
}

// ── Main page ─────────────────────────────────────────────────────────
export default function AiPage() {
    const { currency, addItem } = useEstimate();
    const { user, token, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    // AI availability is checked from the backend (key never exposed to browser)
    const [hasAI, setHasAI] = useState(false);
    useEffect(() => {
        fetch(`${API_BASE}/ai/status`)
            .then(r => r.json())
            .then(d => setHasAI(Boolean(d.configured)))
            .catch(() => setHasAI(false));
    }, []);

    const [chatList, setChatList] = useState([]);
    const [currentChatId, setCurrentChatId] = useState(null);
    const [showSidebar, setShowSidebar] = useState(false);
    const [chatToDelete, setChatToDelete] = useState(null);

    const initialMessage = {
        id: 0,
        role: 'bot',
        content: `Hi! I'm your **Azure Pricing Assistant**.\n\nAsk me anything about Azure service costs — I'll fetch real pricing data and explain it clearly. ${hasAI ? 'AI analysis is enabled.' : 'Connect an AI key in `.env` for enhanced explanations.'}`,
        type: 'text',
    };

    const [messages, setMessages] = useState([{ ...initialMessage }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const msgIdRef = useRef(1);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    useEffect(() => {
        if (!authLoading) {
            loadChatList();
        }
    }, [token, authLoading]);

    async function loadChatList() {
        try {
            const list = await fetchChats(token);
            setChatList(list || []);
        } catch (e) {
            console.error(e);
        }
    }

    function handleNewChat() {
        setCurrentChatId(null);
        setMessages([{ ...initialMessage }]);
        msgIdRef.current = 1;
    }

    async function handleLoadChat(id) {
        try {
            const chatObj = await fetchChat(id, token);
            setCurrentChatId(chatObj.id);
            const loadedMsgs = chatObj.messages || [];
            setMessages(loadedMsgs);
            if (loadedMsgs.length > 0) {
                const maxId = Math.max(...loadedMsgs.map(m => Number(m.id) || 0));
                msgIdRef.current = isNaN(maxId) ? loadedMsgs.length + 1 : maxId + 1;
            } else {
                msgIdRef.current = 1;
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to load chat');
        }
    }

    async function handleDeleteChat(id, e) {
        e.preventDefault();
        e.stopPropagation();
        setChatToDelete(id);
    }

    async function confirmDelete() {
        if (!chatToDelete) return;

        try {
            await deleteChat(chatToDelete, token);
            setChatList(prev => prev.filter(c => String(c.id) !== String(chatToDelete)));
            if (String(currentChatId) === String(chatToDelete)) {
                handleNewChat();
            }
            toast.success('Chat deleted');
        } catch (e) {
            console.error(e);
            toast.error('Failed to delete chat: ' + e.message);
        } finally {
            setChatToDelete(null);
        }
    }

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
        if (!user) { navigate('/login'); return; }
        const query = (text || input).trim();
        if (!query || loading) return;
        setInput('');
        if (inputRef.current) inputRef.current.style.height = 'auto';

        // If AI wasn't detected on mount (e.g. backend was starting up), retry now.
        // Use a local variable so the re-check takes effect for this invocation.
        let aiEnabled = hasAI;
        if (!aiEnabled) {
            try {
                const statusData = await fetch(`${API_BASE}/ai/status`).then(r => r.json());
                if (statusData.configured) { setHasAI(true); aiEnabled = true; }
            } catch { /* keep aiEnabled as false */ }
        }

        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        const userMsgId = msgIdRef.current++;
        const streamBotId = msgIdRef.current++;
        let currentMsgs = [...messages.slice(-50), { id: userMsgId, role: 'user', content: query, type: 'text' }];
        setMessages(currentMsgs);
        setLoading(true);

        // Insert a streaming placeholder bot message
        const streamPlaceholder = { id: streamBotId, role: 'bot', content: '', type: 'text', pricingData: null, region: 'centralindia', thinking: 'Analyzing your query…' };
        currentMsgs = [...currentMsgs, streamPlaceholder];
        setMessages([...currentMsgs]);

        try {
            const parsed = parseQuery(query);
            let pricingContext = '';

            // Build lightweight pricing context for the prompt
            if (parsed.matchedService && !isPricingQuery([{ role: 'user', content: query }])) {
                const data = await fetchServicePricing(parsed.matchedService.serviceName, parsed.region, currency);
                if (data.items.length > 0) {
                    const sorted = [...data.items].sort((a, b) => a.retailPrice - b.retailPrice);
                    pricingContext = sorted.slice(0, 4).map(p =>
                        `${p.skuName || p.meterName}: ${formatPrice(p.retailPrice, currency)}/${p.unitOfMeasure} (${p.location})`
                    ).join('\n');
                }
            }

            let aiText = null;
            let aiToolResult = null;

            if (aiEnabled) {
                const aiMessages = currentMsgs
                    .filter(m => m.id !== 0 && m.id !== streamBotId && (m.role === 'user' || m.role === 'bot'))
                    .slice(-60)
                    .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content }));

                // Update streaming placeholder with new text in real-time
                const onChunk = (newText) => {
                    setMessages(prev => prev.map(m =>
                        m.id === streamBotId ? { ...m, content: newText, thinking: null } : m
                    ));
                };

                const onThinking = (msg) => {
                    setMessages(prev => prev.map(m =>
                        m.id === streamBotId ? { ...m, thinking: msg } : m
                    ));
                };

                const aiResult = await callAI(aiMessages, pricingContext, currency, 0, null, abortControllerRef.current?.signal, onChunk, onThinking);

                if (aiResult?.aborted) {
                    setMessages(prev => prev.filter(m => m.id !== userMsgId && m.id !== streamBotId));
                    return;
                }
                aiText = aiResult?.text ?? null;
                aiToolResult = aiResult?.toolResult ?? null;
            } else {
                // No AI key — update thinking status
                setMessages(prev => prev.map(m =>
                    m.id === streamBotId ? { ...m, thinking: isConversationalQuery(query) ? null : 'Searching pricing data…' } : m
                ));
            }


            // Build pricing cards from tool result
            let pricingData = null;
            if (aiToolResult?.breakdown?.length > 0) {
                pricingData = aiToolResult.breakdown
                    .filter(item => item.cost > 0)
                    .map(item => ({
                        name: item.name || 'Service',
                        product: item.note || 'Azure Service',
                        price: item.cost,
                        unit: 'month',
                        region: parsed.region,
                        currency,
                    }));
            }

            // No-AI fallback: try to fetch pricing data directly
            if (!aiEnabled && !pricingData && !isConversationalQuery(query)) {
                pricingData = await fetchFallbackPricing(query, parsed, currency);
            }

            // Generate follow-up suggestions based on query context
            const followUps = generateFollowUps(query, pricingData, parsed);

            let responseText = aiText || '';
            if (!responseText) {
                if (!aiEnabled && isConversationalQuery(query)) {
                    // Only show the canned greeting when AI is NOT available.
                    // When AI IS available, callAI handles greetings naturally.
                    const greetings = ['Hi! 👋', 'Hello!', 'Hey there!'];
                    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
                    responseText = `${greeting} I'm your **Azure Pricing Assistant**.\n\nI can help you estimate costs for any Azure service. Try asking:\n- "Cheapest VM in Central India"\n- "AKS cluster with 3 D4s v3 nodes in East US"\n- "Redis C1 Standard + 1TB blob storage Hot LRS"\n- "D8s v5 Windows server 1-year reserved"`;
                } else if (!aiEnabled && !pricingData) {
                    responseText = `I wasn't able to find pricing for that query. Try being more specific:\n- Include a service name: *"blob storage"*, *"virtual machine"*, *"SQL Database"*\n- Add a region: *"East US"*, *"Central India"*\n- Specify a SKU or tier: *"D4s v3"*, *"P1v3"*, *"Standard S1"*`;
                } else if (aiEnabled && !pricingData) {
                    responseText = `I couldn't find pricing for that query. Try being more specific with the service and region:\n- "D8s v5 Linux East US"\n- "cheapest VM in India"\n- "AKS with 3 D4s v3 nodes East US"\n- "blob storage 1TB Hot LRS"`;
                } else if (pricingData?.length > 0) {
                    responseText = `Found **${pricingData.length}** pricing result${pricingData.length !== 1 ? 's' : ''} matching your query:`;
                }
            }

            const finalBotMsg = {
                id: streamBotId,
                role: 'bot',
                content: responseText,
                type: pricingData ? 'pricing' : 'text',
                pricingData,
                region: parsed.region,
                thinking: null,
                followUps,
            };
            currentMsgs = currentMsgs.map(m => m.id === streamBotId ? finalBotMsg : m);
            setMessages([...currentMsgs]);

            // Save to DB
            try {
                if (currentChatId) {
                    const currentChat = chatList.find(c => String(c.id) === String(currentChatId));
                    let newTitle = null;
                    if (currentChat && currentChat.title === 'New Chat' && query.length > 5 && !query.toLowerCase().startsWith('hi')) {
                        const generatedTitle = await generateChatTitle(query);
                        if (generatedTitle !== 'New Chat') newTitle = generatedTitle;
                    }
                    await updateChat(currentChatId, newTitle, currentMsgs, token);
                    if (newTitle) await loadChatList();
                } else {
                    const title = await generateChatTitle(query);
                    const newChat = await createChat(title, currentMsgs, token);
                    setCurrentChatId(newChat.id);
                    await loadChatList();
                }
            } catch (err) { console.error('Failed to save chat', err); }

        } catch (err) {
            if (err.name === 'AbortError') {
                setMessages(prev => prev.filter(m => m.id !== userMsgId && m.id !== streamBotId));
                return;
            }
            setMessages(prev => prev.map(m => m.id === streamBotId ? {
                ...m, content: `Something went wrong: ${err.message}. Please try again.`, thinking: null
            } : m));
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
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
            <div className={`ai-sidebar ${showSidebar ? 'mobile-open' : ''}`}>
                <div className="ai-sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="ai-back-btn" onClick={() => navigate(-1)} title="Back to Dashboard" style={{ margin: 0 }}>
                        <ArrowLeft size={18} />
                    </button>
                    <h2 style={{ flex: 1, margin: 0, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Chat History</h2>
                </div>
                <div className="ai-sidebar-content">
                    <button className="btn btn-primary" style={{ width: '100%', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }} onClick={handleNewChat} title="New Chat">
                        <Plus size={16} /> New Chat
                    </button>
                    {chatList.length === 0 ? (
                        <div style={{ padding: '10px 15px', color: 'var(--text-light)', fontSize: '0.9rem' }}>No recent chats.</div>
                    ) : (
                        chatList.map(chat => (
                            <div key={chat.id} className={`ai-history-btn ${String(currentChatId) === String(chat.id) ? 'active' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }} onClick={() => handleLoadChat(chat.id)}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{chat.title}</span>
                                <button className="ai-history-delete-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }} onClick={(e) => handleDeleteChat(chat.id, e)} title="Delete chat">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Mobile Sidebar overlay backdrop */}
            {showSidebar && (
                <div
                    className="mobile-estimate-backdrop"
                    style={{ zIndex: 90 }}
                    onClick={() => setShowSidebar(false)}
                />
            )}

            {/* ── Main Chat Area ──────────────────────────────── */}
            <div className="ai-main">
                {/* ── Header ──────────────────────────────────────── */}
                <div className="ai-header-wrapper">
                    <div className="ai-header">

                        <div className="ai-header__icon" style={{ cursor: 'pointer' }} onClick={() => setShowSidebar(!showSidebar)}>
                            <Sparkles size={20} />
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
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
                                {/* Thinking indicator (streaming state) */}
                                {msg.role === 'bot' && msg.thinking && (
                                    <div className="ai-thinking-status">
                                        <Loader2 size={13} className="ai-thinking-spin" />
                                        <span>{msg.thinking}</span>
                                    </div>
                                )}

                                {/* Text content */}
                                {msg.content && (
                                    <div className="ai-bubble__text markdown-body">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                )}

                                {/* Empty streaming placeholder pulse */}
                                {msg.role === 'bot' && !msg.content && !msg.thinking && (
                                    <div className="ai-typing"><span /><span /><span /></div>
                                )}

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
                                        </div>
                                    </div>
                                )}

                                {/* Follow-up suggestion chips */}
                                {msg.role === 'bot' && msg.followUps?.length > 0 && (
                                    <div className="ai-followup-chips">
                                        {msg.followUps.map((fu, i) => (
                                            <button
                                                key={i}
                                                className="ai-followup-chip"
                                                onClick={() => handleSend(fu)}
                                            >
                                                <Zap size={11} /> {fu}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {loading && !messages.some(m => m.thinking !== undefined && m.thinking !== null) && <TypingIndicator />}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Input box ───────────────────────────────────── */}
                <div className="ai-input-area">
                    {!user ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 16px' }}>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', textAlign: 'center' }}>
                                Sign in to start chatting with the AI assistant
                            </p>
                            <button
                                onClick={() => navigate('/login')}
                                style={{
                                    padding: '8px 28px', borderRadius: 8, border: 'none',
                                    background: 'var(--accent)', color: 'white', fontWeight: 600,
                                    fontSize: '0.88rem', cursor: 'pointer',
                                }}
                            >
                                Log in to continue
                            </button>
                        </div>
                    ) : (
                        <>
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
                        {loading ? (
                            <button
                                className="ai-stop-btn"
                                onClick={() => {
                                    if (abortControllerRef.current) abortControllerRef.current.abort();
                                }}
                                title="Stop generating"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                            </button>
                        ) : (
                            <button
                                className={`ai-send-btn ${!input.trim() ? 'disabled' : ''}`}
                                onClick={() => handleSend()}
                                disabled={!input.trim()}
                            >
                                <Send size={16} />
                            </button>
                        )}
                    </div>
                    <p className="ai-input-hint">
                        Prices are fetched live from Microsoft Azure · Press <kbd>Enter</kbd> to send
                    </p>
                        </>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {chatToDelete && (
                <div className="ai-modal-backdrop" onClick={() => setChatToDelete(null)}>
                    <div className="ai-modal" onClick={e => e.stopPropagation()}>
                        <div className="ai-modal-header">
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>Delete Chat</h3>
                            <button className="ai-modal-close" onClick={() => setChatToDelete(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="ai-modal-body">
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                Are you sure you want to delete this chat? This action cannot be undone.
                            </p>
                        </div>
                        <div className="ai-modal-footer">
                            <button className="btn btn-secondary" onClick={() => setChatToDelete(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}