/**
 * CommLogPage — BDM Communication Log Page
 *
 * Two tabs:
 *   1. Log Screenshot — Upload screenshot proof of external messaging
 *   2. Send Message — Send directly via Viber/Messenger/WhatsApp/Email (Phase 2)
 *
 * Below: list of BDM's own communication logs with filters.
 */

import { useState, useEffect } from 'react';
// Phase O — read ?doctorId= query param so the screenshot-redirect from
// VisitLogger lands the BDM with the doctor already preselected. Without
// this the BDM has to re-pick the doctor after Phase O kicks them out of
// the visit upload — a UX regression we don't want.
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import CommLogForm from '../../components/employee/CommLogForm';
import CommLogList from '../../components/employee/CommLogList';
import MessageComposer from '../../components/employee/MessageComposer';
// Phase N — Generate CLM deck link integration
import doctorService from '../../services/doctorService';
import clmService from '../../services/clmService';

const pageStyles = `
  .clp-tabs { display: flex; gap: 0; border-radius: 10px; overflow: hidden; border: 1px solid #d1d5db; margin-bottom: 16px; }
  .clp-tab { flex: 1; padding: 12px; border: none; background: #f9fafb; color: #64748b; font-size: 14px; font-weight: 600; cursor: pointer; min-height: 48px; transition: all 0.15s; }
  .clp-tab.active { background: #2563eb; color: #fff; }
  .clp-form-toggle { margin-bottom: 12px; }
  .clp-form-btn { padding: 10px 20px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; min-height: 44px; }
  .clp-form-btn:hover { background: #1d4ed8; }
  .clp-section-title { font-size: 16px; font-weight: 700; color: #1e293b; margin: 20px 0 12px; }
  body.dark-mode .clp-tab { background: #0b1220; color: #94a3b8; border-color: #334155; }
  body.dark-mode .clp-tab.active { background: #2563eb; color: #fff; }
  body.dark-mode .clp-section-title { color: #e2e8f0; }
`;

const CommLogPage = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('screenshot'); // screenshot | send
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Phase O — preselected doctor sourced from ?doctorId= (screenshot redirect from VisitLogger)
  const [preselectedDoctor, setPreselectedDoctor] = useState(null);

  // Phase O — On mount, if redirected here from a screenshot-detected visit
  // attempt, fetch the doctor + auto-open the form with the doctor pinned.
  // Closes the "BDM lost context" UX gap on the screenshot redirect path.
  useEffect(() => {
    const doctorId = searchParams.get('doctorId');
    if (!doctorId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await doctorService.getById(doctorId);
        if (cancelled) return;
        const doctor = res?.data;
        if (doctor) {
          setPreselectedDoctor(doctor);
          setShowForm(true);
          // Brief breadcrumb so the BDM understands why they're here. Tone:
          // matter-of-fact, not blaming — the BDM may not have known their
          // photo looked like a screenshot.
          toast.success(`Logging Comm interaction with ${doctor.firstName} ${doctor.lastName}.`, { duration: 4000 });
        }
      } catch (err) {
        console.error('[CommLogPage] preselectedDoctor fetch failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  // Phase N — Generate CLM deck link state
  const [showDeckGen, setShowDeckGen] = useState(false);
  const [deckDoctors, setDeckDoctors] = useState([]);
  const [deckDoctorId, setDeckDoctorId] = useState('');
  const [deckGenLoading, setDeckGenLoading] = useState(false);
  const [generatedDeckUrl, setGeneratedDeckUrl] = useState(null);
  const [generatedDeckSessionId, setGeneratedDeckSessionId] = useState(null);

  // Lazily fetch the BDM's assigned VIP Clients when the deck-gen UI opens.
  useEffect(() => {
    if (!showDeckGen || deckDoctors.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await doctorService.getAll({ limit: 500 });
        if (!cancelled) setDeckDoctors(res?.data || []);
      } catch (err) {
        console.error('[CommLogPage] Failed to load doctors for deck-gen:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [showDeckGen, deckDoctors.length]);

  const handleGenerateDeck = async () => {
    if (!deckDoctorId) {
      toast.error('Please pick a VIP Client first.');
      return;
    }
    setDeckGenLoading(true);
    try {
      // Phase N — Create a remote-mode CLMSession. The same endpoint as the
      // in-person flow accepts mode='remote'; backend skips GPS, sets mode
      // accordingly, and returns the populated session record.
      const idempotencyKey = `clm_remote_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const res = await clmService.startSession(
        deckDoctorId,
        {}, // no GPS for remote
        [], // products optional; BDM can add later via the CLM admin page if needed
        idempotencyKey,
        'remote',
      );
      const session = res?.data;
      if (!session?._id) {
        throw new Error('Could not create remote session.');
      }
      const url = `${window.location.origin}/clm/deck/${session._id}`;
      setGeneratedDeckUrl(url);
      setGeneratedDeckSessionId(session._id);
      try {
        await navigator.clipboard?.writeText(url);
        toast.success('Deck link copied to clipboard. Share it via Viber/Messenger/WhatsApp.', { duration: 6000 });
      } catch {
        toast('Link generated. Tap "Copy Link" below if your browser blocked auto-copy.', { icon: '📝' });
      }
    } catch (err) {
      console.error('[CommLogPage] Deck-gen failed:', err);
      toast.error(err?.response?.data?.message || 'Could not generate deck link.');
    } finally {
      setDeckGenLoading(false);
    }
  };

  const handleSuccess = () => {
    setShowForm(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '20px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
          <style>{pageStyles}</style>
          <PageGuide pageKey="communication-log" />

          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: '#1e293b' }}>
            Communication Log
          </h1>

          {/* Phase N — Generate CLM Deck Link panel. Creates a remote-mode
              CLMSession + copies a shareable public URL to clipboard. The
              CommLog form below auto-tags the next manual log with the
              session ID so analytics can join the deck open back to the
              channel it was sent through. */}
          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 14 }}>Remote Partnership Pitch</div>
                <div style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
                  Generate a shareable link the VIP Client can open from anywhere.
                </div>
              </div>
              <button
                onClick={() => setShowDeckGen((s) => !s)}
                style={{
                  padding: '8px 14px',
                  background: showDeckGen ? '#94a3b8' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {showDeckGen ? 'Hide' : 'Generate Deck Link'}
              </button>
            </div>

            {showDeckGen && (
              <div style={{ marginTop: 12 }}>
                <select
                  value={deckDoctorId}
                  onChange={(e) => setDeckDoctorId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: 13,
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                >
                  <option value="">— Pick a VIP Client —</option>
                  {deckDoctors.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.firstName} {d.lastName}{d.specialization ? ` — ${d.specialization}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleGenerateDeck}
                  disabled={deckGenLoading || !deckDoctorId}
                  style={{
                    padding: '8px 14px',
                    background: deckGenLoading ? '#94a3b8' : '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: deckGenLoading ? 'wait' : 'pointer',
                  }}
                >
                  {deckGenLoading ? 'Generating…' : '➜ Generate + Copy Link'}
                </button>

                {generatedDeckUrl && (
                  <div style={{
                    marginTop: 10,
                    padding: 10,
                    background: '#fff',
                    border: '1px dashed #94a3b8',
                    borderRadius: 8,
                    wordBreak: 'break-all',
                    fontSize: 12,
                  }}>
                    <div style={{ color: '#475569', marginBottom: 4 }}>Shareable link:</div>
                    <code style={{ color: '#0f172a' }}>{generatedDeckUrl}</code>
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(generatedDeckUrl).then(
                            () => toast.success('Link copied.'),
                            () => toast.error('Copy failed — long-press to select and copy manually.'),
                          );
                        }}
                        style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc', cursor: 'pointer' }}
                      >
                        Copy Link
                      </button>
                      <span style={{ alignSelf: 'center', color: '#64748b', fontSize: 11 }}>
                        Tip: paste into your next CommLog entry; it&apos;ll attach this session ID automatically.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="clp-tabs">
            <button
              className={`clp-tab${activeTab === 'screenshot' ? ' active' : ''}`}
              onClick={() => setActiveTab('screenshot')}
            >
              Log Screenshot
            </button>
            <button
              className={`clp-tab${activeTab === 'send' ? ' active' : ''}`}
              onClick={() => setActiveTab('send')}
            >
              Send Message
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'screenshot' && (
            <>
              {!showForm ? (
                <div className="clp-form-toggle">
                  <button className="clp-form-btn" onClick={() => setShowForm(true)}>
                    + Log Interaction
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>New Communication Log</span>
                    <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 18 }}>&times;</button>
                  </div>
                  {/* Phase N — pass the just-generated CLM session ID so the
                      next manual log carries clm_session_id for join analytics.
                      The form clears it on successful submit; if BDM dismisses
                      without submitting, the session lives on as a standalone
                      remote pitch. */}
                  <CommLogForm
                    onSuccess={() => {
                      setGeneratedDeckSessionId(null);
                      setPreselectedDoctor(null); // Phase O — clear after submit
                      handleSuccess();
                    }}
                    clmSessionId={generatedDeckSessionId}
                    preselectedDoctor={preselectedDoctor}
                  />
                </div>
              )}
            </>
          )}

          {activeTab === 'send' && (
            <MessageComposer onSuccess={handleSuccess} />
          )}

          {/* Log list */}
          <div className="clp-section-title">My Interactions</div>
          <CommLogList mode="my" refreshKey={refreshKey} />
        </main>
      </div>
    </div>
  );
};

export default CommLogPage;
