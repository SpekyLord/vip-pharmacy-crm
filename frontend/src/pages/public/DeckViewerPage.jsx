/**
 * DeckViewerPage — Phase N
 *
 * Public, anonymous viewer for the BDM-shared partnership deck. No JWT,
 * no cookies, no PII beyond first names. Driven by GET /api/clm/deck/:id
 * which only returns sessions in mode='remote' — in-person sessions are
 * never reachable via this route.
 *
 * Renders CLMPresenter in previewMode=true so:
 *   - No onEnd / onQrDisplayed mutations fire (the route is read-only).
 *   - Slide events are not recorded server-side (anonymous viewers don't
 *     have an authenticated session to attribute to).
 *   - The "End Session" button doesn't appear; viewers close by tapping
 *     the X (which triggers route navigation away, no state mutation).
 *
 * QR on the connect slide still works — it's just a Messenger deep-link,
 * not a server-side action.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import CLMPresenter from '../../components/employee/CLMPresenter';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import clmService from '../../services/clmService';

const DeckViewerPage = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deck, setDeck] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setError('No deck ID provided.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await clmService.fetchPublicDeck(id);
        if (cancelled) return;
        if (!res?.success) {
          setError('This presentation could not be loaded.');
        } else {
          setDeck(res.data);
        }
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 404) {
          setError('This presentation link is not valid or has been removed.');
        } else if (status === 429) {
          setError('Too many requests right now. Please try again in a minute.');
        } else {
          setError('Could not load the presentation. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a' }}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
        background: '#0f172a',
        color: '#e2e8f0',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Presentation Unavailable</h1>
        <p style={{ fontSize: 14, opacity: 0.85, maxWidth: 480 }}>
          {error || 'We could not load this presentation.'}
        </p>
      </div>
    );
  }

  // Synthetic doctor object for CLMPresenter — only first name is exposed
  // to avoid leaking PII to the public route.
  const doctorShim = { firstName: deck.doctorFirstName || 'there', lastName: '' };

  // Synthetic session object so CLMPresenter has a stable _id reference.
  // previewMode=true ensures none of the session mutation paths fire.
  const sessionShim = {
    _id: deck._id,
    messengerRef: deck.messengerRef,
  };

  return (
    <CLMPresenter
      session={sessionShim}
      doctor={doctorShim}
      products={deck.productsPresented || []}
      branding={deck.branding}
      previewMode
    />
  );
};

export default DeckViewerPage;
