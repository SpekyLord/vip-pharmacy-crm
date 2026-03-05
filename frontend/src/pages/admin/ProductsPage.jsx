/**
 * ProductsPage
 *
 * Admin page for CRM product management:
 * - Product list with CRUD
 * - Search and filter by category/specialization
 * - Image upload
 * - Specialization tagging
 */

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import ProductManagement from '../../components/admin/ProductManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import productService from '../../services/productService';

const productsPageStyles = `
  .dashboard-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .dashboard-content {
    display: flex;
  }

  .main-content {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
  }

  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
  }
`;

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    specialization: '',
  });

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: pagination.page,
        limit: pagination.limit,
        includeInactive: 'true',
      };

      if (filters.search) params.search = filters.search;
      if (filters.category) params.category = filters.category;
      if (filters.specialization) params.specialization = filters.specialization;

      const response = await productService.getAll(params);
      setProducts(response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.pagination?.total || 0,
        pages: response.pagination?.pages || 0,
      }));
    } catch {
      setError('Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSaveProduct = async (formData, isEdit) => {
    try {
      if (isEdit) {
        await productService.update(formData.get('_id'), formData);
        toast.success('Product updated successfully');
      } else {
        await productService.create(formData);
        toast.success('Product created successfully');
      }
      fetchProducts();
      return true;
    } catch (err) {
      const errors = err.response?.data?.errors;
      if (errors && errors.length > 0) {
        const errorMessages = errors.map((e) => `${e.field}: ${e.message}`).join(', ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else {
        toast.error(err.response?.data?.message || 'Failed to save product');
      }
      return false;
    }
  };

  const handleDeleteProduct = async (productId) => {
    try {
      await productService.delete(productId);
      toast.success('Product deactivated successfully');
      fetchProducts();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete product');
      return false;
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  if (loading && products.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{productsPageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>Product Management</h1>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <ProductManagement
            products={products}
            filters={filters}
            pagination={pagination}
            loading={loading}
            onSave={handleSaveProduct}
            onDelete={handleDeleteProduct}
            onFilterChange={handleFilterChange}
            onPageChange={handlePageChange}
          />
        </main>
      </div>
    </div>
  );
};

export default ProductsPage;
