const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function authFetch(url, token, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });
}

export async function getMySubscription(token) {
    const res = await authFetch(`${API_URL}/subscriptions/me`, token);
    if (!res.ok) throw new Error('Failed to fetch subscription');
    return res.json();
}

export async function createCheckoutSession(token, tier) {
    const res = await authFetch(`${API_URL}/subscriptions/checkout`, token, {
        method: 'POST',
        body: JSON.stringify({ tier }),
    });
    if (!res.ok) throw new Error('Failed to create checkout session');
    return res.json(); // { url }
}

export async function createPortalSession(token) {
    const res = await authFetch(`${API_URL}/subscriptions/portal`, token, {
        method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to open billing portal');
    return res.json(); // { url }
}

// ── Admin ────────────────────────────────────────────────────────────────────
export async function adminGetStats(token) {
    const res = await authFetch(`${API_URL}/admin/stats`, token);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
}

export async function adminGetUsers(token, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await authFetch(`${API_URL}/admin/users?${qs}`, token);
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
}

export async function adminUpdateUserTier(token, userId, tier) {
    const res = await authFetch(`${API_URL}/admin/users/${userId}/tier`, token, {
        method: 'PATCH',
        body: JSON.stringify({ tier }),
    });
    if (!res.ok) throw new Error('Failed to update user tier');
    return res.json();
}

export async function adminDeleteUser(token, userId) {
    const res = await authFetch(`${API_URL}/admin/users/${userId}`, token, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete user');
    return res.json();
}

export async function adminGetTickets(token, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await authFetch(`${API_URL}/admin/support?${qs}`, token);
    if (!res.ok) throw new Error('Failed to fetch tickets');
    return res.json();
}

export async function adminUpdateTicket(token, ticketId, data) {
    const res = await authFetch(`${API_URL}/admin/support/${ticketId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update ticket');
    return res.json();
}

// ── Support ──────────────────────────────────────────────────────────────────
export async function submitSupportTicket(data) {
    const res = await fetch(`${API_URL}/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to submit ticket');
    return json;
}

export async function getMyTickets(token) {
    const res = await authFetch(`${API_URL}/support/my-tickets`, token);
    if (!res.ok) throw new Error('Failed to fetch tickets');
    return res.json();
}
