import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';

const pageStyles = `
  :root {
    --ocr-bg: #f4f7fb;
    --ocr-panel: #ffffff;
    --ocr-border: #dbe4f0;
    --ocr-text: #132238;
    --ocr-muted: #607188;
    --ocr-accent: #0b6bcb;
  }

  body.dark-mode {
    --ocr-bg: #0f172a;
    --ocr-panel: #111c31;
    --ocr-border: #20304f;
    --ocr-text: #f8fafc;
    --ocr-muted: #9fb0ca;
    --ocr-accent: #7ec8ff;
  }

  .admin-page.ocr-page {
    background: var(--ocr-bg);
  }

  .ocr-main {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .ocr-panel {
    border: 1px solid var(--ocr-border);
    border-radius: 24px;
    background:
      radial-gradient(circle at top left, rgba(11, 107, 203, 0.14), transparent 34%),
      var(--ocr-panel);
    padding: 28px;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
  }

  .ocr-panel h1 {
    margin: 0 0 12px;
    color: var(--ocr-text);
    font-size: clamp(2rem, 4vw, 2.7rem);
    line-height: 1.05;
  }

  .ocr-panel p {
    margin: 0;
    max-width: 760px;
    color: var(--ocr-muted);
    font-size: 15px;
    line-height: 1.7;
  }

  .ocr-checklist {
    margin: 20px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 12px;
  }

  .ocr-checklist li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    color: var(--ocr-text);
    font-size: 14px;
  }

  .ocr-checklist li::before {
    content: '01';
    min-width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: rgba(11, 107, 203, 0.12);
    color: var(--ocr-accent);
    font-size: 12px;
    font-weight: 700;
  }

  .ocr-checklist li:nth-child(2)::before { content: '02'; }
  .ocr-checklist li:nth-child(3)::before { content: '03'; }

  .ocr-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 22px;
  }

  .ocr-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 18px;
    border-radius: 14px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 700;
    border: 1px solid var(--ocr-border);
    color: var(--ocr-text);
    background: var(--ocr-panel);
  }

  @media (max-width: 768px) {
    .ocr-main {
      padding: 16px;
    }

    .ocr-panel {
      padding: 20px;
      border-radius: 18px;
    }
  }
`;

const OcrTest = () => {
  return (
    <div className="admin-page ocr-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-content">
        <Sidebar />
        <main className="admin-main ocr-main">
          <section className="ocr-panel">
            <h1>OCR Test</h1>
            <p>
              This placeholder page reserves the OCR demo entry point for the ERP rollout. The full
              camera capture, upload, parsing, and confidence workflow will arrive in Phase 1.
            </p>

            <ol className="ocr-checklist">
              <li>Select a VIP document type.</li>
              <li>Capture or upload a photo.</li>
              <li>Review the extracted fields before confirming.</li>
            </ol>

            <div className="ocr-actions">
              <Link to="/erp" className="ocr-link">
                Back to ERP Dashboard
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default OcrTest;
