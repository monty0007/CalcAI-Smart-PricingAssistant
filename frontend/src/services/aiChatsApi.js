const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const LOCAL_STORAGE_KEY = 'ai_chats_local';

/**
 * Helper to get local chats
 */
function getLocalChats() {
    try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

/**
 * Helper to save local chats
 */
function saveLocalChats(chats) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(chats));
}

/**
 * GET /api/chats
 */
export async function fetchChats(token) {
    if (!token) {
        // Fallback to localStorage
        const localChats = getLocalChats();
        // Return summary format
        return localChats.map(c => ({
            id: c.id,
            title: c.title,
            created_at: c.created_at,
            updated_at: c.updated_at,
            message_count: c.messages?.length || 0
        })).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }

    const res = await fetch(`${API_URL}/chats`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch chats');
    return res.json();
}

/**
 * GET /api/chats/:id
 */
export async function fetchChat(id, token) {
    if (!token) {
        const localChats = getLocalChats();
        const chat = localChats.find(c => String(c.id) === String(id));
        if (!chat) throw new Error('Chat not found locally');
        return chat;
    }

    const res = await fetch(`${API_URL}/chats/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch chat');
    return res.json();
}

/**
 * POST /api/chats
 */
export async function createChat(title, messages, token) {
    if (!token) {
        const newChat = {
            id: 'local_' + Date.now(),
            title,
            messages,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const localChats = getLocalChats();
        localChats.push(newChat);
        saveLocalChats(localChats);
        return newChat;
    }

    const res = await fetch(`${API_URL}/chats`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, messages })
    });
    if (!res.ok) throw new Error('Failed to create chat');
    return res.json();
}

/**
 * PUT /api/chats/:id
 */
export async function updateChat(id, title, messages, token) {
    if (!token) {
        const localChats = getLocalChats();
        const chatIndex = localChats.findIndex(c => String(c.id) === String(id));
        if (chatIndex === -1) throw new Error('Chat not found locally');

        const chat = localChats[chatIndex];
        if (title !== null) chat.title = title;
        if (messages !== null) chat.messages = messages;
        chat.updated_at = new Date().toISOString();

        localChats[chatIndex] = chat;
        saveLocalChats(localChats);
        return chat;
    }

    const body = {};
    if (title !== null) body.title = title;
    if (messages !== null) body.messages = messages;

    const res = await fetch(`${API_URL}/chats/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Failed to update chat');
    return res.json();
}

/**
 * DELETE /api/chats/:id
 */
export async function deleteChat(id, token) {
    if (!token) {
        let localChats = getLocalChats();
        localChats = localChats.filter(c => String(c.id) !== String(id));
        saveLocalChats(localChats);
        return;
    }

    const res = await fetch(`${API_URL}/chats/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to delete chat');
    return res.json();
}
