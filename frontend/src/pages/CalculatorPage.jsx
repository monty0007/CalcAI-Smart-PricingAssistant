import { useState, useMemo, useCallback } from 'react';
import { Search, Plus, ShoppingCart, Package, Save } from 'lucide-react';
import { SERVICE_FAMILIES, POPULAR_SERVICES, ICON_MAP } from '../data/serviceCatalog';
import { useEstimate } from '../context/EstimateContext';
import { useAuth } from '../context/AuthContext';
import ServiceConfigModal from '../components/ServiceConfigModal';
import EstimatePanel from '../components/EstimatePanel';

export default function CalculatorPage() {
    const [selectedFamily, setSelectedFamily] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [configService, setConfigService] = useState(null);
    const { items, totalMonthlyCost, currency } = useEstimate();
    const { user, token } = useAuth();
    const [showMobileEstimate, setShowMobileEstimate] = useState(false);

    // Save Modal State
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [estimateName, setEstimateName] = useState('');

    const handleSaveEstimate = async () => {
        if (!user) {
            alert("Please login to save estimates.");
            return;
        }
        if (!estimateName.trim()) return;

        try {
            const res = await fetch('http://localhost:3001/api/estimates', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: estimateName,
                    items,
                    totalCost: totalMonthlyCost,
                    currency
                })
            });
            if (!res.ok) throw new Error("Failed to save");
            alert("Estimate saved successfully!");
            setShowSaveModal(false);
            setEstimateName('');
        } catch (err) {
            alert(err.message);
        }
    };

    const filteredServices = useMemo(() => {
        let services = POPULAR_SERVICES;

        if (selectedFamily) {
            services = services.filter(s => s.serviceFamily === selectedFamily);
        } else if (!searchQuery.trim()) {
            // Show only popular services by default when viewing "All"
            services = services.filter(s => s.popular);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            services = services.filter(
                s =>
                    s.serviceName.toLowerCase().includes(q) ||
                    s.description.toLowerCase().includes(q) ||
                    s.serviceFamily.toLowerCase().includes(q)
            );
        }

        return services;
    }, [selectedFamily, searchQuery]);

    const familyCounts = useMemo(() => {
        const counts = {};
        POPULAR_SERVICES.forEach(s => {
            counts[s.serviceFamily] = (counts[s.serviceFamily] || 0) + 1;
        });
        return counts;
    }, []);

    const handleAddService = useCallback((service) => {
        setConfigService(service);
    }, []);

    return (
        <div className="main-layout">
            {/* Category Sidebar */}
            <aside className="category-sidebar">
                <div className="sidebar-title">Service Categories</div>
                <div
                    className={`category-item ${!selectedFamily ? 'active' : ''}`}
                    onClick={() => setSelectedFamily(null)}
                >
                    <div className="cat-icon">
                        <Package size={16} />
                    </div>
                    Featured
                    <span className="cat-count">{POPULAR_SERVICES.filter(s => s.popular).length}</span>
                </div>

                {SERVICE_FAMILIES.filter(f => familyCounts[f.id]).map(family => {
                    const Icon = ICON_MAP[family.icon];
                    return (
                        <div
                            key={family.id}
                            className={`category-item ${selectedFamily === family.id ? 'active' : ''}`}
                            onClick={() => setSelectedFamily(family.id)}
                        >
                            <div className="cat-icon">
                                {Icon && <Icon size={16} />}
                            </div>
                            {family.name}
                            <span className="cat-count">{familyCounts[family.id] || 0}</span>
                        </div>
                    );
                })}
            </aside>

            {/* Main Content */}
            <main className="content-area">
                <div className="search-container">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search Azure services... (e.g., Virtual Machines, SQL, Storage)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="services-header">
                    <h2>{selectedFamily || (searchQuery ? 'Search Results' : 'Featured Services')}</h2>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <button
                            className="btn-secondary"
                            onClick={() => setShowSaveModal(true)}
                            disabled={items.length === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: '0.85rem' }}
                        >
                            <Save size={16} /> Save Estimate
                        </button>
                        <span className="count">{filteredServices.length} services</span>
                    </div>
                </div>

                {filteredServices.length > 0 ? (
                    <div className="service-grid">
                        {filteredServices.map((service, idx) => {
                            const family = SERVICE_FAMILIES.find(f => f.id === service.serviceFamily);
                            const Icon = family ? ICON_MAP[family.icon] : Package;
                            return (
                                <div
                                    key={`${service.serviceName}-${idx}`}
                                    className="service-card"
                                    onClick={() => handleAddService(service)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="service-card-header">
                                        <div className="service-card-icon">
                                            {Icon && <Icon size={20} />}
                                        </div>
                                        {service.popular && <span className="popular-badge">★ Popular</span>}
                                    </div>
                                    <div className="service-card-name">{service.serviceName}</div>
                                    <div className="service-card-desc">{service.description}</div>
                                    <div className="service-card-footer">
                                        <span className="service-card-family">{service.serviceFamily}</span>
                                        <button
                                            className="add-btn"
                                            onClick={() => handleAddService(service)}
                                        >
                                            <Plus size={14} />
                                            Add to Estimate
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-state">
                        <Search size={48} strokeWidth={1} />
                        <h3>No services found</h3>
                        <p>Try adjusting your search or browse a different category.</p>
                    </div>
                )}
            </main>

            {/* Estimate Panel */}
            <EstimatePanel />

            {/* Mobile FAB */}
            <button
                className="mobile-estimate-btn"
                onClick={() => setShowMobileEstimate(!showMobileEstimate)}
            >
                <ShoppingCart size={18} />
                {items.length > 0 && `${items.length} items`}
            </button>

            {/* Config Modal */}
            {configService && (
                <ServiceConfigModal
                    service={configService}
                    onClose={() => setConfigService(null)}
                />
            )}

            {/* Save Modal */}
            {showSaveModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: 400 }}>
                        <h3 style={{ marginTop: 0 }}>Save Estimate</h3>
                        <p>Give your estimate a name to access it later.</p>
                        <input
                            type="text"
                            className="search-input"
                            placeholder="My Awesome Project"
                            value={estimateName}
                            onChange={(e) => setEstimateName(e.target.value)}
                            style={{ width: '100%', marginBottom: 16 }}
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={() => setShowSaveModal(false)}>Cancel</button>
                            <button className="btn-primary" onClick={handleSaveEstimate}>Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
