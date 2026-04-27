/**
 * FieldGuidePage — Phase N offline-first sprint (Apr 27 2026)
 *
 * Persistent, BDM-readable reference for the offline-capable workflow:
 * offline visit logging, in-person CLM linkage, remote deck sharing,
 * photo proof, sync errors, and which pages need WiFi.
 *
 * Why a dedicated page (not just PageGuide banners):
 *   - PageGuide is dismissible per session and short-form. Useful as an
 *     in-context reminder, not a reference.
 *   - The full Apr 27 procedure note is too long for a banner.
 *   - BDMs need to revisit it after their first field day, weekly during
 *     rollout, and during onboarding for new hires.
 *
 * Source-of-truth content lives in `docs/BDM-OFFLINE-FIELD-GUIDE.md`.
 * Keep both in sync — this page is the user-facing surface, the doc is
 * the admin / onboarding reference.
 */
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import { Link } from 'react-router-dom';

const styles = `
  .fg-wrap { padding: 24px; max-width: 880px; margin: 0 auto; }
  .fg-wrap h1 { font-size: 26px; color: #1f2937; margin: 0 0 6px; }
  .fg-sub { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
  .fg-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
    padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.04); }
  .fg-card h2 { font-size: 18px; color: #1e3a8a; margin: 0 0 10px;
    display: flex; align-items: center; gap: 8px; }
  .fg-card h3 { font-size: 14px; color: #1f2937; margin: 14px 0 6px; }
  .fg-card p { font-size: 13px; color: #374151; line-height: 1.6; margin: 6px 0; }
  .fg-card ol, .fg-card ul { font-size: 13px; color: #374151; line-height: 1.7;
    padding-left: 22px; margin: 6px 0; }
  .fg-card li { margin: 3px 0; }
  .fg-icon { width: 26px; height: 26px; border-radius: 6px; background: #dbeafe;
    color: #1e40af; display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; }
  .fg-callout { background: #fef3c7; border-left: 4px solid #f59e0b;
    padding: 10px 14px; margin: 10px 0; font-size: 12px; color: #78350f;
    border-radius: 4px; line-height: 1.6; }
  .fg-warn { background: #fef2f2; border-left: 4px solid #dc2626;
    padding: 10px 14px; margin: 10px 0; font-size: 12px; color: #7f1d1d;
    border-radius: 4px; line-height: 1.6; }
  .fg-block { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;
    padding: 12px 16px; margin: 8px 0; font-size: 12px; color: #7c2d12; }
  .fg-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
  .fg-table th, .fg-table td { border: 1px solid #e5e7eb; padding: 8px 10px;
    text-align: left; vertical-align: top; }
  .fg-table th { background: #f3f4f6; font-weight: 600; color: #1f2937; }
  .fg-meta { font-size: 11px; color: #9ca3af; margin-top: 24px;
    text-align: center; padding-top: 12px; border-top: 1px dashed #e5e7eb; }
  @media (max-width: 600px) {
    .fg-wrap { padding: 12px; }
    .fg-card { padding: 14px; }
  }
`;

export default function FieldGuidePage() {
  return (
    <div>
      <style>{styles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="fg-wrap">
            <PageGuide pageKey="field-guide" />
            <h1>BDM Offline Field Guide</h1>
            <p className="fg-sub">
              Reference for offline visit logging + Partnership presentations.
              Last updated April 27, 2026. Bookmark this page and revisit
              before each field day until it&apos;s second nature.
            </p>

            {/* 1. OFFLINE VISIT LOGGING */}
            <section className="fg-card">
              <h2><span className="fg-icon">1</span> Offline Visit Logging</h2>
              <p>You can now log visits <strong>even with no Globe signal</strong> at the clinic.</p>

              <h3>Before you leave the office (or hotspot)</h3>
              <ol>
                <li>Open the BDM Dashboard once while you have signal. This downloads your VIP Client list onto your phone.</li>
                <li>Tap each VIP Client you plan to visit today, even just once, while online. This makes sure their profile is saved locally for offline pickup.</li>
                <li>You can close the app between clinics to save battery — you will stay logged in.</li>
              </ol>

              <h3>At the clinic (no signal? no problem)</h3>
              <ol>
                <li>Tap <Link to="/bdm/visit/new">Log Visit</Link>. The page now opens normally even when offline.</li>
                <li>Take your at least 1 photo proof as usual (1–10 photos). Photos auto-save to your phone immediately — even if your phone reboots before sync, your photos are not lost.</li>
                <li>Pick the products you discussed. Add notes. Tap <strong>Submit Visit</strong>.</li>
                <li>You will see a quick &quot;queued&quot; confirmation. The visit is safely stored on your phone and will sync automatically when you get signal back.</li>
                <li>Move to the next clinic. Repeat. Close the app between visits to save battery if you want.</li>
              </ol>

              <h3>When you get back on WiFi or signal</h3>
              <ol>
                <li>Open the app. Sync runs <strong>automatically</strong> in the background — you don&apos;t need to tap anything.</li>
                <li>You will see a green toast at the top: <strong>&quot;Synced 3 visits (~5.4 MB)&quot;</strong>. That tells you how many visits were sent and roughly how much mobile data was used.</li>
                <li>A copy of that confirmation also lands in your <Link to="/bdm/inbox">Inbox</Link> folder, so you can review later &quot;how much data did I use this week.&quot;</li>
                <li>Your <Link to="/bdm/visits">My Visits</Link> history will now show all the offline visits you logged, with their photos and timestamps preserved exactly.</li>
              </ol>
            </section>

            {/* 2. VISIT + CLM = ONE FLOW */}
            <section className="fg-card">
              <h2><span className="fg-icon">2</span> Visit + Partnership Presentation are now ONE flow</h2>
              <p>When you visit a VIP Client and want to walk them through the partnership deck, you don&apos;t need to log it twice anymore. The visit and the presentation are connected automatically through a shared encounter ID.</p>

              <h3>In-person at the clinic</h3>
              <ol>
                <li>Open <Link to="/bdm/visit/new">New Visit</Link>, pick the VIP Client you&apos;re meeting.</li>
                <li>Take your proof photos (1–10).</li>
                <li>Pick the products you plan to feature in the pitch.</li>
                <li>Tap <strong>Start Presentation</strong> (the button below the products list).
                  <ul>
                    <li>The deck opens full-screen — the VIP Client can hold your tablet and swipe.</li>
                    <li>The doctor&apos;s name + your selected products are already on the slides — no retyping.</li>
                  </ul>
                </li>
                <li>Walk them through the slides. Time per slide is tracked silently in the background.</li>
                <li>When done, tap <strong>End Session</strong>. You&apos;ll be asked: Interest level (1–5), Outcome, Follow-up date if any.</li>
                <li>You&apos;re returned to the Visit page → tap <strong>Submit Visit</strong>.</li>
              </ol>
              <p>The visit, the photos, and the CLM session are now permanently linked. Admin sees them as one encounter in reports.</p>

              <div className="fg-callout">
                <strong>If you skip Start Presentation:</strong> that&apos;s fine. Just submit the visit normally. Only do the presentation when you actually walk them through the deck — fake CLM sessions inflate your stats and admin will notice.
              </div>

              <h3>Remote (sending the deck via Messenger / Viber / WhatsApp / email)</h3>
              <ol>
                <li>Open <Link to="/bdm/comm-log">Communication Log</Link> page.</li>
                <li>Tap <strong>Generate Deck Link</strong>.</li>
                <li>The system creates a public link (e.g. <code>https://app.viosintegrated.net/clm/deck/abc123</code>) and automatically copies it to your clipboard.</li>
                <li>Open Messenger / Viber / WhatsApp → paste the link → send to your VIP Client.</li>
                <li>Log a Communication Log entry as proof you sent it (channel = Messenger/Viber/etc., attach a screenshot).</li>
                <li>Done. The deck and your message are linked automatically.</li>
              </ol>
              <p><strong>What the VIP Client sees:</strong> they tap the link, the deck opens in their browser (no login needed). They can swipe through. We see when they opened it and how many times. They never see your phone number, email, or GPS — only the deck content + your first name.</p>
            </section>

            {/* 3. PHOTO PROOF */}
            <section className="fg-card">
              <h2><span className="fg-icon">3</span> Photo proof — what&apos;s different now</h2>
              <p>Nothing has changed for you, but here&apos;s how it works in case anyone asks:</p>
              <ul>
                <li>Your photos save to your phone the <strong>second</strong> you take them (not when you submit). So even if your phone dies or the app crashes mid-visit, the photos are safe.</li>
                <li>When the visit syncs (automatically, when you reconnect), the photos go up with it. They don&apos;t sync separately or get lost in transit.</li>
                <li>The photo, the visit, and the CLM session are all stamped with the same encounter ID, so when admin reviews proof of work they see the full picture together.</li>
              </ul>
            </section>

            {/* 4. SYNC ERRORS */}
            <section className="fg-card">
              <h2><span className="fg-icon">4</span> If you see a red &quot;Sync errors (N)&quot; badge next to your name</h2>
              <ol>
                <li><strong>Tap it.</strong> A drawer opens listing what failed.</li>
                <li>The usual cause is &quot;Visit photos lost&quot; — your phone cleared its temporary storage (rare, more common on aggressive battery-saver phones).</li>
                <li>Tap <strong>Discard</strong> to clear the error from your dashboard. A copy stays in your Inbox so admin still has the record.</li>
                <li>Then go back to <Link to="/bdm/visit/new">Log Visit</Link> and <strong>re-capture</strong> that visit (new photos, GPS, products). There is no automatic retry because the original photos are gone.</li>
              </ol>
            </section>

            {/* 5. ONLINE-ONLY PAGES */}
            <section className="fg-card">
              <h2><span className="fg-icon">5</span> What still needs WiFi or cellular</h2>
              <p>These pages CANNOT be used offline — they need a server round-trip:</p>
              <ul>
                <li>Expenses</li>
                <li>Approvals</li>
                <li>Per-Diem / SMER</li>
                <li>Car Logbook / Fuel</li>
                <li>Settings / Control Center</li>
                <li>Sales / GRN / Collections / any financial entry</li>
              </ul>
              <div className="fg-block">
                <strong>If you try to open these offline</strong> you&apos;ll see an orange panel saying &quot;This page needs WiFi or cellular.&quot; That&apos;s by design — financial postings must run live to keep the books accurate. Tap <strong>Back to Dashboard</strong> and continue logging visits.
              </div>
            </section>

            {/* 6. DATA SAVING TIPS */}
            <section className="fg-card">
              <h2><span className="fg-icon">6</span> Tips to save Globe data</h2>
              <ul>
                <li>Stay offline at the clinic. Only sync when you&apos;re at home or on WiFi if you&apos;re tight on data.</li>
                <li>The toast <code>(~X MB)</code> is your data audit trail — review it weekly via your Inbox.</li>
                <li>Photos are the biggest data cost. We&apos;ll be adding photo compression in a future update — for now, take only the photos you actually need (1 is the minimum, more if needed).</li>
              </ul>
            </section>

            {/* 7. FAQ */}
            <section className="fg-card">
              <h2><span className="fg-icon">7</span> Common questions</h2>
              <table className="fg-table">
                <thead>
                  <tr><th>Question</th><th>Answer</th></tr>
                </thead>
                <tbody>
                  <tr><td>Can I do CLM without a Visit?</td><td>Yes — open Partnership CLM directly. But if you DID actually visit, do it through New Visit so you get one linked record instead of two.</td></tr>
                  <tr><td>Can I do a Visit without CLM?</td><td>Yes — just don&apos;t tap Start Presentation. Visit logs as a normal proof-of-call.</td></tr>
                  <tr><td>What if my deck times out mid-presentation?</td><td>The session saves whatever you completed. If you didn&apos;t tap End Session, it stays as a partial session and admin can review it.</td></tr>
                  <tr><td>The remote link is public — can anyone see our pricing?</td><td>The deck only shows what&apos;s on your slide content (no internal pricing, no BDM contact). Rate-limited so it can&apos;t be scraped. Only remote-mode sessions appear publicly — in-person sessions are private.</td></tr>
                  <tr><td>Will my visit get rejected for being a duplicate?</td><td>The system enforces 1 visit per VIP Client per week. If you accidentally submit twice (e.g., once offline, once online), the database silently rejects the duplicate.</td></tr>
                  <tr><td>What if I see a glitch?</td><td>Screenshot the screen + the red badge if any. Note the time + your location (signal strength). Send to admin via Comm Log or message.</td></tr>
                </tbody>
              </table>
            </section>

            {/* 8. ROLLOUT */}
            <section className="fg-card">
              <h2><span className="fg-icon">8</span> What to expect during rollout</h2>
              <p>We&apos;re piloting this with 3 BDMs first. If you&apos;re one of the pilots:</p>
              <ul>
                <li>Log normally and send feedback after each clinic day.</li>
                <li>Anything that feels different from this guide → screenshot it and tell admin.</li>
                <li>Pay attention to the <strong>&quot;Synced N visits&quot;</strong> toast. If you go a whole field day with no toast, sync is broken — tell us.</li>
              </ul>
              <p>Once the pilot is clean for 1 week, we&apos;ll roll wide.</p>
            </section>

            <div className="fg-meta">
              Source: <code>docs/BDM-OFFLINE-FIELD-GUIDE.md</code> · Phase N + Offline-First Sprint · April 27, 2026
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
