import { useEffect, useRef, useState } from 'react';

const API = 'http://localhost:5000';

export default function App() {
  const [docs, setDocs] = useState([]);
  const [status, setStatus] = useState('Ready');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const fileInputRef = useRef(null);

  const loadDocs = async () => {
    const res = await fetch(`${API}/admin/documents`);
    const data = await res.json();
    setDocs(data);
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const upload = async (file) => {
    setStatus('Uploading PDF...');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/admin/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || 'Upload failed');
      return;
    }

    setStatus(`Indexed ${data.chunks} chunks from ${data.pages} page(s)`);
    loadDocs();
  };

  const removeDoc = async (id) => {
    await fetch(`${API}/admin/documents/${id}`, { method: 'DELETE' });
    loadDocs();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
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
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'bot', text: '', citations: '' }]);
    setQuestion('');

    const es = new EventSource(`${API}/chat/stream?question=${encodeURIComponent(q)}`);
    es.onmessage = (evt) => {
      const payload = JSON.parse(evt.data);
      setMessages((curr) => {
        const copy = [...curr];
        const idx = copy.length - 1;

        if (payload.token) copy[idx].text += payload.token;
        if (payload.done) copy[idx].citations = payload.citations;
        if (payload.error) copy[idx].text = payload.error;

        return copy;
      });

      if (payload.done || payload.error) es.close();
    };
  };

  return (
    <div className="page">
      <div className="hero-shell">
        <header className="top-nav">
          <div className="brand">OpsMind AI</div>
          <nav>
            <a href="#">Home</a>
            <a href="#">About</a>
            <a href="#">Pages</a>
            <a href="#">Contact</a>
          </nav>
          <button className="ghost-btn">Get started</button>
        </header>

        <section className="hero-copy">
          <p className="eyebrow">SOP automation platform</p>
          <h1>All you need to integrate AI with your operations</h1>
          <p>
            Upload SOP documents, ask questions in real time, and manage knowledge in a clean single-panel experience.
          </p>
        </section>

        <section className="main-panel">
          <article className="panel-block upload-block">
            <div>
              <h3>Document Control</h3>
              <p>Upload and maintain SOP files in one place.</p>
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
                  fileInputRef.current.value = "";
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
                  <button className="danger-btn" onClick={() => removeDoc(doc.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel-block chat-block">
            <div>
              <h3>Ops Copilot</h3>
              <p>Ask process questions and stream answers with citations.</p>
            </div>
            <div className="chat-box">
              {messages.map((m, i) => (
                <div className={`msg ${m.role}`} key={i}>
                  <div>{m.text}</div>
                  {m.citations && <small>Sources: {m.citations}</small>}
                </div>
              ))}
            </div>
            <div className="ask-bar">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="How do I process refund?"
              />
              <button className="primary-btn" onClick={ask}>
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
    </div>
  );
}