/**
 * VisitLogger Component
 *
 * Form for logging doctor visits with:
 * - Doctor selection
 * - Visit type and purpose
 * - Products discussed
 * - Notes and feedback
 * - Photo capture option
 * - GPS location capture
 */

import { useState } from 'react';

const VisitLogger = ({ doctor = null, products = [], onSubmit, loading = false }) => {
  const [formData, setFormData] = useState({
    visitType: 'regular',
    purpose: '',
    productsDiscussed: [],
    feedback: '',
    notes: '',
    nextVisitDate: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProductToggle = (productId) => {
    setFormData((prev) => ({
      ...prev,
      productsDiscussed: prev.productsDiscussed.includes(productId)
        ? prev.productsDiscussed.filter((id) => id !== productId)
        : [...prev.productsDiscussed, productId],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit?.({ ...formData, doctor: doctor?._id });
  };

  return (
    <form onSubmit={handleSubmit} className="visit-logger">
      <h3>Log Visit for {doctor?.name || 'Selected Doctor'}</h3>

      <div className="form-group">
        <label htmlFor="visitType">Visit Type</label>
        <select
          id="visitType"
          name="visitType"
          value={formData.visitType}
          onChange={handleChange}
        >
          <option value="regular">Regular</option>
          <option value="follow-up">Follow-up</option>
          <option value="emergency">Emergency</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="purpose">Purpose</label>
        <input
          type="text"
          id="purpose"
          name="purpose"
          value={formData.purpose}
          onChange={handleChange}
          placeholder="Enter visit purpose"
          required
        />
      </div>

      <div className="form-group">
        <label>Products Discussed</label>
        <div className="product-checkboxes">
          {products.map((product) => (
            <label key={product._id} className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.productsDiscussed.includes(product._id)}
                onChange={() => handleProductToggle(product._id)}
              />
              {product.name}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="feedback">Doctor Feedback</label>
        <textarea
          id="feedback"
          name="feedback"
          value={formData.feedback}
          onChange={handleChange}
          placeholder="Enter doctor's feedback"
          rows={3}
        />
      </div>

      <div className="form-group">
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="Additional notes"
          rows={3}
        />
      </div>

      <div className="form-group">
        <label htmlFor="nextVisitDate">Next Visit Date</label>
        <input
          type="date"
          id="nextVisitDate"
          name="nextVisitDate"
          value={formData.nextVisitDate}
          onChange={handleChange}
        />
      </div>

      <button type="submit" disabled={loading} className="btn btn-primary">
        {loading ? 'Logging Visit...' : 'Log Visit'}
      </button>
    </form>
  );
};

export default VisitLogger;
