import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Download, Plus, RefreshCw, FileSpreadsheet, ChevronRight, ArrowLeft, Trash2, X } from 'lucide-react';
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
const AI_ENDPOINT = import.meta.env.VITE_OPENAI_ENDPOINT;
const AI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const AI_MODEL = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';
const LOG_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api') + '/logs';

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

// ── AI call ──────────────────────────────────────────────────────────
async function callAI(messages, pricingContext, currency, depth = 0, _toolResult = null, signal = null) {
    if (!AI_ENDPOINT || !AI_API_KEY) return { text: null, toolResult: null };
    if (depth > 2) return { text: "I'm sorry, I encountered too many tool operations to process this effectively.", toolResult: _toolResult };

    const systemMsg = {
        role: 'system',
        content: `You are an expert Azure Pricing Assistant powered by a live Azure pricing database.

## ━━ PRIME DIRECTIVES (NEVER BREAK THESE) ━━

1. **NEVER guess, infer, or estimate ANY price.** All prices MUST come from the calculate_estimate tool only.
2. **NEVER skip the tool.** Even for simple questions like "how much is a D2s v5?" — call the tool first.
3. Call calculate_estimate ONCE with ALL items in a single \`items[]\` array. Never split into multiple calls.
4. If the tool returns "no match" for an item, say so clearly. Never substitute a number.
5. After the tool returns, respond with a Markdown pricing table.
6. For greetings, general questions, or non-pricing topics — respond naturally without calling the tool.
7. **NEVER write JSON arguments directly into your text response.** You MUST use the tool_calls array to invoke \`calculate_estimate\`.

## ━━ MANDATORY ITEM CONVERSION ━━

Convert ALL user input to structured items BEFORE calling the tool. No exceptions.

### Example:
User says: "D8s v5 Windows Central India"
You produce:
\`\`\`json
{
  "type": "vm",
  "sku": "D8s v5",
  "os": "windows",
  "region": "centralindia",
  "quantity": 1
}
\`\`\`

## ━━ ITEM TYPES ━━

### type: "vm" — Virtual Machines
The backend pricing engine selects ONLY the PAYG compute meter (meterName must contain 'Hours').
It automatically excludes: Spot, Low Priority, Promo, Dedicated Host meters.
- sku: e.g. "D8s v5", "D4s_v3", "B2ms"
- os: "windows" or "linux" (default "linux")
  - Linux → excludes Windows product rows
  - Windows → selects Windows product rows (PAYG) + calculates Windows surcharge on reservations
- reservation: "1 Year", "3 Year", or "" for PAYG
- region: Azure region slug e.g. "centralindia", "eastus"
- quantity: default 1
- Windows reservations: backend handles surcharge automatically, do NOT add a separate OS item

### type: "managed_disk" — Managed Disks
The backend pricing engine selects ONLY the base disk capacity meter.
It NEVER uses: Disk Mount, Snapshot, Burst, or Transaction meters.
Only valid disk tiers: E* (Standard SSD), S* (Standard HDD), P* (Premium SSD)
- diskType: "E10", "E15", "E20", "E30", "S4", "S10", "P10", "P20" etc.
- diskTier: "Standard SSD", "Premium SSD", or "Standard HDD"
- diskRedundancy: "LRS" or "ZRS" only. Default "LRS". NEVER use "GRS" or "GZRS".
- region: Azure region slug
- quantity: number of disks (default 1)
- transactions: monthly disk transactions for explicit I/O billing (default 0)
- Disks are ALWAYS separate items from VMs — never combine

### type: "bandwidth" — Data Transfer / Bandwidth
The backend selects ONLY outbound transfer meters. Inbound and peering meters are excluded.
- transferType: "internet" or "inter-region"
- sourceRegion: region where traffic originates
- destinationRegion: only for inter-region
- dataTransferGB: GB of outbound data
- Bandwidth is ALWAYS a separate item

### type: "ip_address" — Public IP Addresses
- ipType: "Static" or "Dynamic" (default "Static")
- region: Azure region slug
- quantity: default 1

### type: "defender" — Microsoft Defender for Cloud
- serverCount: number of servers (default 1)

### type: "monitor" — Azure Monitor / Log Analytics
- dataIngestionGB: daily ingestion GB (default 0.2)

## ━━ WORKLOAD FORMAT ━━

When user pastes a workload (4-line format):
Line 1: Service Category → determines \`type\`
Line 2: Service Type → refines \`type\`
Line 3: Custom Name → use as \`name\`
Line 4: Description → parse config fields

Map: "Virtual Machines"→vm, "Managed Disks"→managed_disk, "Bandwidth"→bandwidth, "IP Addresses"→ip_address, "Microsoft Defender"→defender, "Azure Monitor"→monitor

## ━━ OUTPUT FORMAT ━━

After the tool returns data, use this Markdown table:

| Service | Description | Monthly Cost (${currency}) |
|---------|-------------|---------------------------|
| ... | ... | ... |

**Grand Total: X.XX ${currency}/month**

One-line infrastructure summary.

${pricingContext ? `=== LIVE PRICING DATA ===\n${pricingContext}\n========================` : ''}
Default region: centralindia. Extract region from user message if mentioned.
Currency: ${currency}. Tool already converts — NEVER reconvert.`
    };

    try {
        const payload = {
            model: AI_MODEL,
            messages: [systemMsg, ...messages],
            max_tokens: 2500,
            temperature: 0.3,
            tools: [
                {
                    type: "function",
                    function: {
                        name: "calculate_estimate",
                        description: `Calculate monthly Azure costs. Decompose the user query into typed items and call this ONCE with ALL items. Each item MUST have a "type" field.`,
                        parameters: {
                            type: "object",
                            properties: {
                                items: {
                                    type: "array",
                                    description: "One typed item per service component. Disks and bandwidth are always separate items from VMs.",
                                    items: {
                                        type: "object",
                                        properties: {
                                            type: { type: "string", enum: ["vm", "managed_disk", "bandwidth", "ip_address", "defender", "monitor"], description: "The item type — backend routes on this field" },
                                            name: { type: "string", description: "User-friendly label e.g. 'App Server - Compute'" },
                                            sku: { type: "string", description: "VM SKU e.g. 'D8s v5', 'B2ms'" },
                                            os: { type: "string", enum: ["linux", "windows"], description: "OS type for VMs" },
                                            reservation: { type: "string", description: "'1 Year', '3 Year', or '' for PAYG" },
                                            quantity: { type: "number", description: "Number of instances/disks/IPs (default 1)" },
                                            region: { type: "string", description: "Azure region slug e.g. centralindia, eastus" },
                                            diskType: { type: "string", description: "Disk SKU: E10, E15, E20, E30, S4, P10 etc." },
                                            diskTier: { type: "string", description: "'Standard SSD', 'Premium SSD', 'Standard HDD'" },
                                            diskRedundancy: { type: "string", description: "'LRS', 'ZRS', 'GRS'" },
                                            transactions: { type: "number", description: "Monthly disk transactions (billed per 10k)" },
                                            dataTransferGB: { type: "number", description: "GB of outbound data transfer" },
                                            transferType: { type: "string", description: "'internet' or 'inter-region'" },
                                            sourceRegion: { type: "string", description: "Region where traffic originates" },
                                            destinationRegion: { type: "string", description: "Destination region for inter-region transfers" },
                                            ipType: { type: "string", description: "'Static' or 'Dynamic'" },
                                            serverCount: { type: "number", description: "Number of Defender-protected servers" },
                                            dataIngestionGB: { type: "number", description: "Daily data ingestion for Azure Monitor" }
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
            // Force tool use for pricing queries at depth 0 — prevents hallucination
            tool_choice: depth === 0 && isPricingQuery(messages)
                ? { type: 'function', function: { name: 'calculate_estimate' } }
                : 'auto'
        };

        fetch(LOG_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'REQUEST TO OPENAI', data: payload })
        }).catch(() => { });

        const isAzure = AI_ENDPOINT.includes('azure.com');
        const headers = {
            'Content-Type': 'application/json',
        };
        if (isAzure) {
            headers['api-key'] = AI_API_KEY;
        } else {
            headers['Authorization'] = `Bearer ${AI_API_KEY}`;
        }

        const res = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal
        });
        if (!res.ok) {
            console.error("AI API Error:", res.status, await res.text());
            return null;
        }

        const data = await res.json();

        // Log response to backend terminal
        fetch(LOG_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'RESPONSE FROM OPENAI', data })
        }).catch(() => { });

        const responseMessage = data.choices?.[0]?.message;
        if (!responseMessage) return null;

        if (responseMessage.tool_calls) {
            const toolCall = responseMessage.tool_calls[0];
            if (toolCall.function.name === 'calculate_estimate') {
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    const backendResult = await calculateEstimate(args.items, currency);

                    messages.push(responseMessage);
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: JSON.stringify(backendResult)
                    });

                    return await callAI(messages, pricingContext, currency, depth + 1, backendResult, signal);
                } catch (e) {
                    console.error("Tool execution error", e);
                    messages.push(responseMessage);
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        content: JSON.stringify({ error: "Failed to map parameters natively" })
                    });
                    return await callAI(messages, pricingContext, currency, depth + 1, _toolResult, signal);
                }
            }
        }

        // If model returned plain text, return it.
        if (responseMessage.content) {
            return { text: responseMessage.content, toolResult: _toolResult };
        }

        return { text: null, toolResult: _toolResult };
    } catch (err) {
        if (err.name === 'AbortError') {
            return { text: null, toolResult: null, aborted: true };
        }
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

// ── Title generation ──────────────────────────────────────────────────
async function generateChatTitle(query) {
    let fallback = query.slice(0, 30) + (query.length > 30 ? '...' : '');
    const lower = query.trim().toLowerCase();
    if (lower === 'hi' || lower === 'hello' || lower === 'hey') {
        return 'New Chat';
    }

    if (!AI_ENDPOINT || !AI_API_KEY) return fallback;
    try {
        const res = await fetch(AI_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [
                    { role: 'system', content: 'Generate a brief, concise title (2-4 words) for this Azure pricing conversation based on the user prompt. DO NOT use quotes or conversational filler. If the user only says "hi" or a greeting, return "New Chat".' },
                    { role: 'user', content: query }
                ],
                max_tokens: 15,
                temperature: 0.3
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const title = data.choices?.[0]?.message?.content?.trim();
            if (title) return title.replace(/^["']|["']$/g, '');
        }
    } catch (err) { console.error('Title generation failed:', err); }
    return fallback;
}

// ── Main page ─────────────────────────────────────────────────────────
export default function AiPage() {
    const { currency, addItem } = useEstimate();
    const { user, token, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const hasAI = Boolean(AI_ENDPOINT && AI_API_KEY);

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
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }

        // Cancel any existing request (though loading check above usually prevents this)
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const userMsgId = msgIdRef.current++;
        let currentMsgs = [...messages.slice(-50), { id: userMsgId, role: 'user', content: query, type: 'text' }];
        setMessages(currentMsgs);
        setLoading(true);

        try {
            const parsed = parseQuery(query);
            let pricingData = null;
            let pricingContext = '';

            if (parsed.matchedService) {
                const data = await fetchServicePricing(parsed.matchedService.serviceName, parsed.region, currency);
                if (data.items.length > 0) {
                    const sorted = [...data.items].sort((a, b) => a.retailPrice - b.retailPrice);
                    pricingData = sorted.slice(0, 4).map(item => ({
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
                        const vmData = await fetchVmList({ search: vmTerm, region: parsed.region, currency, limit: 4 }).catch(() => ({ items: [] }));
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
                        const genericVmData = await fetchVmList({ search: '', region: parsed.region, currency, limit: 4 }).catch(() => ({ items: [] }));
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
                    pricingData = sorted.slice(0, 4).map(item => ({
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
            let aiToolResult = null;
            if (hasAI) {
                // Include full conversation history. Loaded chats may not have a 'type'
                // field, so we must not filter by type. Only exclude the initial greeting (id===0).
                const aiMessages = currentMsgs
                    .filter(m => m.id !== 0 && (m.role === 'user' || m.role === 'bot'))
                    .slice(-60)
                    .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content }));
                const aiResult = await callAI(aiMessages, pricingContext, currency, 0, null, abortControllerRef.current.signal);
                if (aiResult?.aborted) {
                    // If aborted, just stop here and remove the user message
                    setMessages(prev => prev.filter(m => m.id !== userMsgId));
                    return;
                }
                aiText = aiResult?.text ?? null;
                aiToolResult = aiResult?.toolResult ?? null;
            }

            // If AI used the tool, build pricing cards from the verified tool result breakdown.
            // Backend returns each item as: { name, cost, note }
            // Otherwise fall back to the pre-fetched pricingData (keyword search results).
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

            const botMsg = {
                id: msgIdRef.current++,
                role: 'bot',
                content: responseText,
                type: pricingData ? 'pricing' : 'text',
                pricingData,
                region: parsed.region,
            };
            currentMsgs = [...currentMsgs, botMsg];
            setMessages(currentMsgs);

            // Save to DB / LocalStorage
            try {
                if (currentChatId) {
                    const currentChat = chatList.find(c => String(c.id) === String(currentChatId));
                    let newTitle = null;
                    if (currentChat && currentChat.title === 'New Chat' && query.length > 5 && !query.toLowerCase().startsWith('hi')) {
                        const generatedTitle = await generateChatTitle(query);
                        if (generatedTitle !== 'New Chat') {
                            newTitle = generatedTitle;
                        }
                    }
                    await updateChat(currentChatId, newTitle, currentMsgs, token);
                    if (newTitle) {
                        await loadChatList();
                    }
                } else {
                    const title = await generateChatTitle(query);
                    const newChat = await createChat(title, currentMsgs, token);
                    setCurrentChatId(newChat.id);
                    await loadChatList();
                }
            } catch (err) { console.error('Failed to save chat', err); }

        } catch (err) {
            if (err.name === 'AbortError') {
                // If the fetch itself was aborted, remove the user message
                setMessages(prev => prev.filter(m => m.id !== userMsgId));
                return;
            }
            const botMsg = {
                id: msgIdRef.current++,
                role: 'bot',
                content: `Something went wrong: ${err.message}. Please try again.`,
                type: 'text',
            };
            currentMsgs = [...currentMsgs, botMsg];
            setMessages(currentMsgs);
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