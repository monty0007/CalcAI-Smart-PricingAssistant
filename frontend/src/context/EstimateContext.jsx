import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { fetchServicePricing } from '../services/azurePricingApi';
import { useAuth } from './AuthContext';

const EstimateContext = createContext(null);

const defaultState = {
    items: [],
    currency: 'INR',
    region: 'centralindia',
    refreshing: false,
};

function init() {
    try {
        const savedItems = localStorage.getItem('azure_estimate_items');
        return {
            items: savedItems ? JSON.parse(savedItems) : [],
            currency: localStorage.getItem('azure_estimate_currency') || 'INR',
            region: localStorage.getItem('azure_estimate_region') || 'centralindia',
            refreshing: false,
        };
    } catch {
        return defaultState;
    }
}

function estimateReducer(state, action) {
    switch (action.type) {
        case 'ADD_ITEM': {
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            return {
                ...state,
                items: [...state.items, {
                    ...action.payload,
                    id,
                    quantity: action.payload.quantity || 1,
                    hoursPerMonth: action.payload.hoursPerMonth || 730,
                }],
            };
        }
        case 'REMOVE_ITEM':
            return {
                ...state,
                items: state.items.filter(item => item.id !== action.payload),
            };
        case 'UPDATE_ITEM':
            return {
                ...state,
                items: state.items.map(item =>
                    item.id === action.payload.id ? { ...item, ...action.payload.updates } : item
                ),
            };
        case 'SET_CURRENCY':
            return { ...state, currency: action.payload };
        case 'SET_REGION':
            return { ...state, region: action.payload };
        case 'CLEAR_ALL':
            return { ...state, items: [] };
        case 'BULK_UPDATE_PRICES':
            return {
                ...state,
                items: state.items.map(item => {
                    const updated = action.payload.find(u => u.id === item.id);
                    return updated ? { ...item, retailPrice: updated.retailPrice, currencyCode: updated.currencyCode } : item;
                }),
            };
        case 'SET_REFRESHING':
            return { ...state, refreshing: action.payload };
        case 'REPLACE_ITEMS':
            return { ...state, items: action.payload };
        default:
            return state;
    }
}

export function EstimateProvider({ children }) {
    const [state, dispatch] = useReducer(estimateReducer, defaultState, init);

    // Save state to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem('azure_estimate_items', JSON.stringify(state.items));
            localStorage.setItem('azure_estimate_currency', state.currency);
            localStorage.setItem('azure_estimate_region', state.region);
        } catch (err) {
            console.error("Failed to save to localStorage:", err);
        }
    }, [state.items, state.currency, state.region]);
    const { user, token } = useAuth();

    // Load user preferences on login
    useEffect(() => {
        if (user) {
            if (user.preferred_currency && user.preferred_currency !== state.currency) {
                dispatch({ type: 'SET_CURRENCY', payload: user.preferred_currency });
            }
            if (user.preferred_region && user.preferred_region !== state.region) {
                dispatch({ type: 'SET_REGION', payload: user.preferred_region });
            }
        }
    }, [user?.id]); // Only run when user changes (login/logout/id change)

    const updatePreferences = useCallback(async (updates) => {
        if (!user || !token) return;
        try {
            await fetch('http://localhost:3001/api/auth/preferences', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(updates)
            });
        } catch (err) {
            console.error("Failed to save preferences:", err);
        }
    }, [user, token]);

    const addItem = useCallback((item) => {
        dispatch({ type: 'ADD_ITEM', payload: item });
    }, []);

    const removeItem = useCallback((id) => {
        dispatch({ type: 'REMOVE_ITEM', payload: id });
    }, []);

    const updateItem = useCallback((id, updates) => {
        dispatch({ type: 'UPDATE_ITEM', payload: { id, updates } });
    }, []);

    const setCurrency = useCallback(async (newCurrency, currentItems) => {
        dispatch({ type: 'SET_CURRENCY', payload: newCurrency });
        updatePreferences({ currency: newCurrency });

        // Re-fetch prices for all items in the new currency
        if (currentItems && currentItems.length > 0) {
            dispatch({ type: 'SET_REFRESHING', payload: true });

            try {
                // Group items by serviceName+region to minimize API calls
                const groups = {};
                currentItems.forEach(item => {
                    const key = `${item.serviceName}__${item.armRegionName || 'eastus'}`;
                    if (!groups[key]) {
                        groups[key] = { serviceName: item.serviceName, region: item.armRegionName || 'eastus', items: [] };
                    }
                    groups[key].items.push(item);
                });

                const updates = [];

                await Promise.all(
                    Object.values(groups).map(async (group) => {
                        try {
                            const data = await fetchServicePricing(group.serviceName, group.region, newCurrency);
                            // Match each item by skuName/meterName to find the new price
                            group.items.forEach(item => {
                                const match = data.items.find(
                                    p => (p.skuName === item.skuName && p.productName === item.productName) ||
                                        (p.meterName === item.meterName && p.productName === item.productName)
                                );
                                if (match) {
                                    updates.push({
                                        id: item.id,
                                        retailPrice: match.retailPrice,
                                        currencyCode: newCurrency,
                                    });
                                }
                            });
                        } catch {
                            // If a fetch fails, keep original price
                        }
                    })
                );

                if (updates.length > 0) {
                    dispatch({ type: 'BULK_UPDATE_PRICES', payload: updates });
                }
            } finally {
                dispatch({ type: 'SET_REFRESHING', payload: false });
            }
        }
    }, [updatePreferences]);

    const setRegion = useCallback((region) => {
        dispatch({ type: 'SET_REGION', payload: region });
        updatePreferences({ region });
    }, [updatePreferences]);

    const clearAll = useCallback(() => {
        dispatch({ type: 'CLEAR_ALL' });
    }, []);

    const replaceItems = useCallback((newItems) => {
        dispatch({ type: 'REPLACE_ITEMS', payload: newItems });
    }, []);

    const totalMonthlyCost = state.items.reduce((sum, item) => {
        const price = item.retailPrice || 0;
        const qty = item.quantity || 1;
        const hours = item.hoursPerMonth || 730;
        const unit = (item.unitOfMeasure || '').toLowerCase();

        if (unit.includes('hour')) return sum + price * qty * hours;
        if (unit.includes('month')) return sum + price * qty;
        if (unit.includes('day')) return sum + price * qty * 30;
        if (unit.includes('gb')) return sum + price * qty;
        if (unit.includes('year')) return sum + (price * qty) / 12;
        return sum + price * qty;
    }, 0);

    return (
        <EstimateContext.Provider
            value={{
                ...state,
                addItem,
                removeItem,
                updateItem,
                setCurrency,
                setRegion,
                clearAll,
                replaceItems,
                totalMonthlyCost,
            }}
        >
            {children}
        </EstimateContext.Provider>
    );
}

export function useEstimate() {
    const context = useContext(EstimateContext);
    if (!context) {
        throw new Error('useEstimate must be used within an EstimateProvider');
    }
    return context;
}
