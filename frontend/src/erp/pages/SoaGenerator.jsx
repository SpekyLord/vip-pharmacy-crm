import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useCollections from '../hooks/useCollections';
import useHospitals from '../hooks/useHospitals';
import { showError } from '../utils/errorToast';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .soa-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .soa-main { flex: 1; min-width: 0; padding: 20px; max-width: 800px; margin: 0 auto; }
  .soa-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 20px; }
  .section { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; font-size: 11px; color: var(--erp-muted); font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
  .form-group select { width: 100%; padding: 10px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 14px; }
  .btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .msg { padding: 12px; border-radius: 8px; font-size: 13px; margin-top: 12px; }
  .msg-ok { background: #dcfce7; color: #166534; }
  .msg-err { background: #fef2f2; color: #991b1b; }
`;

export default function SoaGenerator() {
  const coll = useCollections();
  const { hospitals } = useHospitals();
  const [hospitalId, setHospitalId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleGenerate = async () => {
    if (!hospitalId) return;
    setGenerating(true); setMsg(null);
    try {
      const res = await coll.generateSoa(hospitalId);
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const hospital = hospitals.find(h => h._id === hospitalId);
      const filename = `SOA_${(hospital?.hospital_name || 'Hospital').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setMsg({ type: 'ok', text: `SOA generated for ${hospital?.hospital_name || 'hospital'}` });
    } catch (err) {
      showError(err, 'SOA generation failed');
    } finally { setGenerating(false); }
  };

  return (
    <div className="admin-page erp-page soa-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="soa-main">
          <div className="soa-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1>Statement of Account Generator</h1>
            <Link to="/erp/reports" className="erp-back-btn">
              Back to Reports
            </Link>
          </div>
          <WorkflowGuide pageKey="collections" />
          <div className="section">
            <div className="form-group">
              <label>Select Hospital</label>
              <SelectField value={hospitalId} onChange={e => setHospitalId(e.target.value)}>
                <option value="">Select hospital...</option>
                {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name_display || h.hospital_name}</option>)}
              </SelectField>
            </div>
            <button className="btn btn-success" onClick={handleGenerate} disabled={!hospitalId || generating}>
              {generating ? 'Generating...' : 'Generate SOA (Excel)'}
            </button>
            {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
