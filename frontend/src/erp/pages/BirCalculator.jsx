import { useState } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpApi from '../hooks/useErpApi';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .bir-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .bir-main { flex: 1; min-width: 0; padding: 20px; max-width: 900px; margin: 0 auto; }
  .bir-header { margin-bottom: 20px; }
  .bir-header h2 { font-size: 20px; font-weight: 700; margin: 0; color: var(--erp-text); }
  .bir-header p { font-size: 13px; color: var(--erp-muted); margin: 4px 0 0; }
  .bir-input-card { background: var(--erp-panel); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: 16px; }
  .bir-input-card h3 { font-size: 14px; font-weight: 600; margin: 0 0 12px; color: var(--erp-text); }
  .bir-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .form-group input { padding: 10px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 15px; font-weight: 600; background: var(--erp-panel); color: var(--erp-text); box-sizing: border-box; }
  .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
  .btn-primary { background: var(--erp-accent, #2563eb); color: #fff; width: 100%; margin-top: 12px; }
  .bir-results { display: grid; gap: 12px; }
  .bir-card { background: var(--erp-panel); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .bir-card h4 { font-size: 13px; font-weight: 600; color: var(--erp-muted); margin: 0 0 10px; text-transform: uppercase; }
  .bir-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .bir-row.total { border-top: 2px solid var(--erp-border); padding-top: 8px; margin-top: 4px; font-weight: 700; font-size: 14px; }
  .bir-label { color: var(--erp-muted); }
  .bir-value { font-weight: 600; color: var(--erp-text); }
  .bir-value.negative { color: #dc2626; }
  .bir-net-card { background: linear-gradient(135deg, #1e40af, #2563eb); border-radius: 12px; padding: 20px; text-align: center; color: white; }
  .bir-net-card h4 { color: rgba(255,255,255,.7); font-size: 12px; margin: 0 0 4px; text-transform: uppercase; }
  .bir-net-card .amount { font-size: 28px; font-weight: 800; }
  .bir-empty { text-align: center; padding: 40px; color: var(--erp-muted); font-size: 14px; }
  @media(max-width: 768px) {
    .bir-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .bir-grid { grid-template-columns: 1fr 1fr; }
  }
  @media(max-width: 375px) {
    .bir-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .bir-grid { grid-template-columns: 1fr; }
    .form-group input { font-size: 16px; }
  }
`;

const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function BirCalculator() {
  const api = useErpApi();
  const [salary, setSalary] = useState('');
  const [rice, setRice] = useState('');
  const [clothing, setClothing] = useState('');
  const [medical, setMedical] = useState('');
  const [laundry, setLaundry] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCompute = async () => {
    if (!salary) return;
    setLoading(true);
    try {
      const res = await api.post('/government-rates/compute-breakdown', {
        monthly_salary: parseFloat(salary) || 0,
        rice_allowance: parseFloat(rice) || 0,
        clothing_allowance: parseFloat(clothing) || 0,
        medical_allowance: parseFloat(medical) || 0,
        laundry_allowance: parseFloat(laundry) || 0,
      });
      setResult(res?.data || null);
    } catch (err) { showError(err, 'BIR calculation failed'); }
    setLoading(false);
  };

  return (
    <div className="bir-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="bir-main admin-main">
          <WorkflowGuide pageKey="bir-calculator" />
          <div className="bir-header">
            <h2>BIR Tax Calculator</h2>
            <p>Compute mandatory contributions and withholding tax based on current government rates</p>
          </div>

          <div className="bir-input-card">
            <h3>Monthly Compensation</h3>
            <div className="bir-grid">
              <div className="form-group">
                <label>Monthly Gross Salary</label>
                <input type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="e.g. 25000" />
              </div>
              <div className="form-group">
                <label>Rice Allowance</label>
                <input type="number" value={rice} onChange={e => setRice(e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Clothing Allowance</label>
                <input type="number" value={clothing} onChange={e => setClothing(e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Medical Allowance</label>
                <input type="number" value={medical} onChange={e => setMedical(e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Laundry Allowance</label>
                <input type="number" value={laundry} onChange={e => setLaundry(e.target.value)} placeholder="0" />
              </div>
            </div>
            <button className="btn btn-primary" onClick={handleCompute} disabled={loading || !salary}>
              {loading ? 'Computing...' : 'Compute Breakdown'}
            </button>
          </div>

          {result ? (
            <div className="bir-results">
              {/* Net Pay Card */}
              <div className="bir-net-card">
                <h4>Estimated Monthly Net Pay</h4>
                <div className="amount">{fmt(result.net_pay)}</div>
              </div>

              {/* SSS */}
              <div className="bir-card">
                <h4>SSS</h4>
                <div className="bir-row"><span className="bir-label">Employee Share</span><span className="bir-value negative">{fmt(result.sss?.ee)}</span></div>
                <div className="bir-row"><span className="bir-label">Employer Share</span><span className="bir-value">{fmt(result.sss?.er)}</span></div>
                <div className="bir-row"><span className="bir-label">EC (Employer)</span><span className="bir-value">{fmt(result.sss?.ec)}</span></div>
              </div>

              {/* PhilHealth */}
              <div className="bir-card">
                <h4>PhilHealth</h4>
                <div className="bir-row"><span className="bir-label">Employee Share</span><span className="bir-value negative">{fmt(result.philhealth?.ee)}</span></div>
                <div className="bir-row"><span className="bir-label">Employer Share</span><span className="bir-value">{fmt(result.philhealth?.er)}</span></div>
              </div>

              {/* PagIBIG */}
              <div className="bir-card">
                <h4>Pag-IBIG</h4>
                <div className="bir-row"><span className="bir-label">Employee Share</span><span className="bir-value negative">{fmt(result.pagibig?.ee)}</span></div>
                <div className="bir-row"><span className="bir-label">Employer Share</span><span className="bir-value">{fmt(result.pagibig?.er)}</span></div>
              </div>

              {/* Total Mandatory */}
              <div className="bir-card">
                <h4>Mandatory Deductions (Employee)</h4>
                <div className="bir-row total"><span className="bir-label">Total EE Deductions</span><span className="bir-value negative">{fmt(result.total_mandatory_ee)}</span></div>
              </div>

              {/* De Minimis */}
              {result.de_minimis?.breakdown?.length > 0 && (
                <div className="bir-card">
                  <h4>De Minimis Benefits</h4>
                  {result.de_minimis.breakdown.map((b, i) => (
                    <div key={i} className="bir-row">
                      <span className="bir-label">{b.label}</span>
                      <span className="bir-value">
                        {fmt(b.amount)} (exempt: {fmt(b.exempt)}{b.excess > 0 ? `, taxable: ${fmt(b.excess)}` : ''})
                      </span>
                    </div>
                  ))}
                  <div className="bir-row total"><span className="bir-label">Total Exempt / Taxable</span><span className="bir-value">{fmt(result.de_minimis.exempt_total)} / {fmt(result.de_minimis.taxable_excess)}</span></div>
                </div>
              )}

              {/* Withholding Tax */}
              <div className="bir-card">
                <h4>Withholding Tax (TRAIN Law)</h4>
                <div className="bir-row"><span className="bir-label">Annual Taxable Income</span><span className="bir-value">{fmt(result.annual_taxable)}</span></div>
                <div className="bir-row"><span className="bir-label">Annual Tax</span><span className="bir-value">{fmt(result.withholding_tax?.annual_tax)}</span></div>
                <div className="bir-row total"><span className="bir-label">Monthly Withholding Tax</span><span className="bir-value negative">{fmt(result.withholding_tax?.monthly_tax)}</span></div>
              </div>
            </div>
          ) : (
            <div className="bir-empty">Enter a monthly salary and click Compute to see the breakdown</div>
          )}
        </main>
      </div>
    </div>
  );
}
