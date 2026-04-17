/**
 * ProductSpecPage
 *
 * BDM page to browse specializations and manage which products belong to each.
 * Shows a list of active specializations as tappable cards.
 * Tapping opens SpecializationProductsModal to toggle products.
 */

import { useState, useEffect, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import SpecializationProductsModal from '../../components/common/SpecializationProductsModal';
import specializationService from '../../services/specializationService';
import { Package, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import PageGuide from '../../components/common/PageGuide';

const ProductSpecPage = () => {
  const [specializations, setSpecializations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSpec, setSelectedSpec] = useState(null);

  const fetchSpecializations = async () => {
    try {
      setLoading(true);
      const res = await specializationService.getAll({ active: true });
      setSpecializations(res.data || []);
    } catch {
      toast.error('Failed to load specializations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpecializations();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return specializations;
    return specializations.filter((s) => s.name.toLowerCase().includes(q));
  }, [specializations, search]);

  return (
    <div className="dashboard-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <PageGuide pageKey="product-spec" />

          <div className="psp-header">
            <h1 className="psp-title">
              <Package size={24} />
              Products by Specialty
            </h1>
            <p className="psp-subtitle">Assign products to each specialization</p>
          </div>

          <div className="psp-search-wrap">
            <Search size={16} className="psp-search-icon" />
            <input
              className="psp-search"
              type="text"
              placeholder="Search specializations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="psp-loading">Loading specializations...</div>
          ) : filtered.length === 0 ? (
            <div className="psp-empty">
              {search ? 'No specializations match your search.' : 'No specializations available.'}
            </div>
          ) : (
            <div className="psp-grid">
              {filtered.map((spec) => (
                <div
                  key={spec._id}
                  className="psp-card"
                  onClick={() => setSelectedSpec(spec)}
                >
                  <div className="psp-card-name">{spec.name}</div>
                  <div className="psp-card-action">
                    <Package size={16} />
                    Manage Products
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedSpec && (
            <SpecializationProductsModal
              specialization={selectedSpec}
              onClose={() => setSelectedSpec(null)}
              onSaved={() => toast.success('Product assignments updated')}
            />
          )}
        </main>
      </div>
    </div>
  );
};

const styles = `
  .psp-header {
    margin-bottom: 20px;
  }
  .psp-title {
    display: flex; align-items: center; gap: 10px;
    font-size: 22px; font-weight: 700; color: #111827;
    margin: 0 0 4px;
  }
  .psp-subtitle {
    font-size: 14px; color: #6b7280; margin: 0;
  }

  .psp-search-wrap {
    position: relative;
    max-width: 400px;
    margin-bottom: 20px;
  }
  .psp-search-icon {
    position: absolute;
    left: 12px; top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
    pointer-events: none;
  }
  .psp-search {
    width: 100%;
    padding: 10px 12px 10px 36px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    box-sizing: border-box;
    background: #fff;
  }
  .psp-search:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59,130,246,.1);
  }

  .psp-loading, .psp-empty {
    text-align: center;
    padding: 48px 16px;
    color: #6b7280;
    font-size: 14px;
  }

  .psp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  .psp-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all .15s;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .psp-card:hover {
    border-color: #3b82f6;
    box-shadow: 0 2px 8px rgba(59,130,246,.12);
  }
  .psp-card:active {
    transform: scale(.98);
  }
  .psp-card-name {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
  }
  .psp-card-action {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #3b82f6;
    font-weight: 500;
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .psp-title { color: #f1f5f9; }
  body.dark-mode .psp-subtitle { color: #94a3b8; }
  body.dark-mode .psp-search {
    background: #1e293b; border-color: #334155; color: #e2e8f0;
  }
  body.dark-mode .psp-search:focus { border-color: #3b82f6; }
  body.dark-mode .psp-loading, body.dark-mode .psp-empty { color: #64748b; }
  body.dark-mode .psp-card {
    background: #1e293b; border-color: #334155;
  }
  body.dark-mode .psp-card:hover {
    border-color: #3b82f6;
    box-shadow: 0 2px 8px rgba(59,130,246,.2);
  }
  body.dark-mode .psp-card-name { color: #f1f5f9; }
  body.dark-mode .psp-card-action { color: #60a5fa; }

  @media (max-width: 480px) {
    .psp-grid {
      grid-template-columns: 1fr;
    }
    .psp-card {
      padding: 14px;
      min-height: 48px;
    }
    .psp-search-wrap {
      max-width: 100%;
    }
  }
`;

export default ProductSpecPage;
