import { useEffect, useRef, useState } from 'react';

const API = 'http://localhost:5000';

export default function App({ goToHome, goToPricing, goToBilling, userPlan, handleLogout }) {
  const token = localStorage.getItem('token');
  const isPro = userPlan === 'pro' || userPlan === 'enterprise';

  const [docs, setDocs] = useState([]);
  const [status, setStatus] = useState('Ready');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitModalMessage, setLimitModalMessage] = useState('');
  const fileInputRef = useRef(null);

  // useEffect(() => {
  //   if (!token) {
  //     window.location.reload();
  //   }
  // }, [token]);

  const loadDocs = async () => {
    try {
      const res = await fetch(`${API}/admin/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || 'Failed to load documents');
        return;
      }

      setDocs(data);
    } catch (err) {
      setStatus('Server error');
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const upload = async (file) => {
    setStatus('Uploading PDF...');

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch(`${API}/admin/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || 'Upload failed');
        if (res.status === 403) {
          setLimitModalMessage(data.error || 'SOP Upload limit reached (5 documents max on Free tier). Upgrade to Pro for unlimited uploads!');
          setShowLimitModal(true);
        }
        return;
      }

      setStatus(`Indexed ${data.chunks} chunks from ${data.pages} page(s)`);

      loadDocs();
    } catch (err) {
      setStatus('Upload failed');
    }
  };

  const removeDoc = async (id) => {
    try {
      await fetch(`${API}/admin/documents/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      loadDocs();
    } catch (err) {
      setStatus('Delete failed');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf =
      file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

    if (!isPdf) {
      setStatus('Please choose a valid PDF file.');
      e.target.value = '';
      return;
    }

    upload(file);

    e.target.value = '';
  };

  const ask = () => {
    if (!question.trim()) return;

    const q = question;

    setMessages((m) => [
      ...m,
      { role: 'user', text: q },
      { role: 'bot', text: '', citations: '' },
    ]);

    setQuestion('');

    const es = new EventSource(
      `${API}/chat/stream?question=${encodeURIComponent(
        q
      )}&token=${token}`
    );

    es.onmessage = (evt) => {
      const payload = JSON.parse(evt.data);

      setMessages((curr) => {
        const copy = [...curr];

        const idx = copy.length - 1;

        if (payload.token) {
          copy[idx].text += payload.token;
        }

        if (payload.done) {
          copy[idx].citations = payload.citations;
        }

        if (payload.error) {
          copy[idx].text = payload.error;
        }

        return copy;
      });

      if (payload.done || payload.error) {
        es.close();
      }
    };

    es.onerror = (err) => {
      setMessages((curr) => {
        const copy = [...curr];
        const idx = copy.length - 1;
        if (!copy[idx].text) {
          copy[idx].text = "Daily query limit reached (10 queries/day max on Free tier). Upgrade to Pro for unlimited queries!";
        }
        return copy;
      });
      setLimitModalMessage("Daily query limit reached (10 queries/day max on Free tier). Upgrade to Pro for unlimited queries!");
      setShowLimitModal(true);
      es.close();
    };
  };

  const confirmLogout = () => {
    if (handleLogout) {
      handleLogout();
    } else {
      localStorage.removeItem('token');
      window.location.reload();
    }
  };

  return (
    <div className="page">
      <div className="hero-shell">

        <header className="top-nav">
          <div className="brand" onClick={goToHome} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            OpsMind AI
            {isPro && <span className="pro-badge">PRO</span>}
          </div>



          <div className="nav-actions">
            <button
              className="ghost-btn"
              onClick={goToHome}
            >
              Home
            </button>

            <button
              className="ghost-btn"
              onClick={goToBilling}
            >
              Billing
            </button>

            <button
              className="upgrade-btn"
              onClick={goToPricing}
            >
              ⚡ Upgrade Now
            </button>

            <button className="primary-btn" onClick={() => setShowLogoutModal(true)}>
              Logout
            </button>
          </div>
        </header>

        <section className="hero-copy">
          <p className="eyebrow">SOP automation platform</p>

          <h1>
            All you need to integrate AI with your operations
          </h1>

          <p>
            Upload SOP documents, ask questions in real time,
            and manage knowledge in a clean single-panel
            experience.
          </p>
        </section>

        <section className="main-panel">

          <article className="panel-block upload-block">
            <div>
              <h3>Document Control</h3>

              <p>
                Upload and maintain SOP files in one place.
              </p>
            </div>

            <input
              ref={fileInputRef}
              className="file-input-hidden"
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
            />

            <button
              className="upload-pill"
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
            >
              Upload PDF
            </button>

            <p className="status">{status}</p>

            <ul className="doc-list">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <span>{doc.fileName}</span>

                  <button
                    className="danger-btn"
                    onClick={() => removeDoc(doc.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </article>
          <article className="panel-block chat-block">
            <div>
              <h3>Ops Copilot</h3>

              <p>
                Ask process questions and stream answers
                with citations.
              </p>
            </div>

            <div className="chat-box">
              {messages.map((m, i) => (
                <div className={`msg ${m.role}`} key={i}>
                  <div>{m.text}</div>

                  {m.citations && (
                    <small>Sources: {m.citations}</small>
                  )}
                </div>
              ))}
            </div>

            <div className="ask-bar">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="How do I process refund?"
              />

              <button
                className="primary-btn"
                onClick={ask}
              >
                Ask
              </button>
            </div>
          </article>
          <article className="panel-block recent-block">
            <h3>Recent SOPs</h3>

            <div className="list-card">
              {docs.map((doc) => (
                <div className="doc-row" key={doc.id}>
                  <strong>{doc.fileName}</strong>

                  <p>{doc.pages || '?'} pages</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>

      {/* ── Logout Confirmation Modal ── */}
      {showLogoutModal && (
        <div className="modal-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">🔓</div>
            <h3 className="modal-title">Sign out?</h3>
            <p className="modal-desc">You'll need to log back in to access your dashboard and documents.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowLogoutModal(false)}>
                Cancel
              </button>
              <button className="modal-confirm" onClick={confirmLogout}>
                Yes, sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Subscription Limit Modal ── */}
      {showLimitModal && (
        <div className="modal-overlay" onClick={() => setShowLimitModal(false)}>
          <div className="modal-card limit-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>⚡</div>
            <h3 className="modal-title">Upgrade to Pro!</h3>
            <p className="modal-desc">
              {limitModalMessage}
            </p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowLimitModal(false)}>
                Maybe Later
              </button>
              <button className="modal-confirm" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', color: '#fff', border: 'none' }} onClick={() => {
                setShowLimitModal(false);
                goToPricing();
              }}>
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}