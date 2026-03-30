import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Plus, ShoppingCart, Package, Save, BookOpen, AlertCircle, Check, X } from 'lucide-react';
import { SERVICE_FAMILIES, POPULAR_SERVICES, ICON_MAP } from '../data/serviceCatalog';
import { useEstimate } from '../context/EstimateContext';
import { useAuth } from '../context/AuthContext';
import ServiceConfigModal from '../components/ServiceConfigModal';
import EstimatePanel from '../components/EstimatePanel';
import QuotationsDrawer from '../components/QuotationsDrawer';
import '../index.css';

export default function CalculatorPage() {
    const [selectedFamily, setSelectedFamily] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [configService, setConfigService] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const { items, totalMonthlyCost, currency, clearAll } = useEstimate();
    const { user, token } = useAuth();
    const [showMobileEstimate, setShowMobileEstimate] = useState(false);
    const [quotDrawerOpen, setQuotDrawerOpen] = useState(false);

    // Resizer State
    const [sidebarWidth, setSidebarWidth] = useState(360);
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef(null);

    // Modals
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showNewConfirm, setShowNewConfirm] = useState(false);
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

    const handleNewEstimate = () => {
        if (items.length > 0) {
            setShowNewConfirm(true);
        } else {
            clearAll();
        }
    };

    // --- Resizer Logic ---
    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsResizing(true);
    };

    const handleMouseMove = useCallback((e) => {
        if (!isResizing) return;
        // Calculate new width: viewport width - mouse X position
        const newWidth = window.innerWidth - e.clientX;
        // Constrain width between 300px and 600px
        if (newWidth > 300 && newWidth < 800) {
            setSidebarWidth(newWidth);
        }
    }, [isResizing]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    const confirmNewEstimate = () => {
        clearAll();
        setShowNewConfirm(false);
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
        setEditingItem(null);
        setConfigService(service);
    }, []);

    const handleEditItem = useCallback((item) => {
        // Find the matching base service so the modal knows what it is configuring
        let baseService = POPULAR_SERVICES.find(s => s.serviceName === item.serviceName);
        if (!baseService) {
            baseService = { serviceName: item.serviceName, description: 'Re-configure service' };
        }

        setEditingItem(item);
        setConfigService(baseService);
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
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                            className="header-action-btn"
                            onClick={handleNewEstimate}
                            title="New Estimate"
                        >
                            <Plus size={15} /> <span className="hide-mobile">New Estimate</span>
                        </button>
                        {user && (
                            <button
                                className="header-action-btn primary"
                                onClick={() => setQuotDrawerOpen(true)}
                                title="My Quotations"
                            >
                                <BookOpen size={15} /> <span className="hide-mobile">Quotations</span>
                            </button>
                        )}
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
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddService(service);
                                            }}
                                        >
                                            <Plus size={14} /> Add to Estimate
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

            {/* Resizable Sidebar Wrapper */}
            <div
                className={`estimate-sidebar-wrapper ${showMobileEstimate ? 'mobile-open' : ''} ${isResizing ? 'resizing' : ''}`}
                style={{ width: showMobileEstimate ? '100%' : sidebarWidth }}
                ref={sidebarRef}
            >
                {/* Drag Handle */}
                {!showMobileEstimate && (
                    <div
                        className="sidebar-resizer"
                        onMouseDown={handleMouseDown}
                    />
                )}

                <div
                    className="mobile-estimate-backdrop"
                    onClick={() => setShowMobileEstimate(false)}
                />
                <div style={{ width: '100%', height: '100%', background: 'var(--bg-primary)' }}>
                    <EstimatePanel
                        onClose={() => setShowMobileEstimate(false)}
                        quotDrawerOpen={quotDrawerOpen}
                        setQuotDrawerOpen={setQuotDrawerOpen}
                        onEditItem={handleEditItem}
                    />
                </div>
            </div>

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
                    editItem={editingItem}
                    onClose={() => {
                        setConfigService(null);
                        setEditingItem(null);
                    }}
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

            {/* New Estimate Confirm Modal */}
            {showNewConfirm && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: 420 }}>
                        <div className="modal-danger-icon">
                            <AlertCircle size={32} color="#ef4444" />
                        </div>
                        <h3>Clear current estimate?</h3>
                        <p>This will clear your active estimate ({items.length} item{items.length !== 1 ? 's' : ''}) and start fresh. Any unsaved changes will be lost.</p>
                        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                            <button className="btn-danger" onClick={confirmNewEstimate}>
                                Clear &amp; Start New
                            </button>
                            <button className="btn-secondary" onClick={() => setShowNewConfirm(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            <QuotationsDrawer open={quotDrawerOpen} onClose={() => setQuotDrawerOpen(false)} />
        </div>
    );
}
