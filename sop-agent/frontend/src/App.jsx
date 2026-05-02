import { useEffect, useState } from 'react';

const API = 'http://localhost:5000';

export default function App() {
  const [docs, setDocs] = useState([]);
  const [status, setStatus] = useState('Ready');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);

  const loadDocs = async () => {
    const res = await fetch(`${API}/admin/documents`);
    const data = await res.json();
    setDocs(data);
  };

  useEffect(() => { loadDocs(); }, []);

  const upload = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/admin/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) return setStatus(data.error || 'Upload failed');
    setStatus(`Indexed ${data.chunks} chunks`);
    loadDocs();
  };

  const removeDoc = async (id) => {
    await fetch(`${API}/admin/documents/${id}`, { method: 'DELETE' });
    loadDocs();
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
      <div className="phone-grid">
        <section className="phone panel-left">
          <header>Dashboard</header>
          <div className="profile-card">
            <h3>OpsMind Admin</h3>
            <p>Upload and manage SOPs</p>
            <input type="file" accept="application/pdf" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
            <p className="status">{status}</p>
            <ul>
              {docs.map((doc) => (
                <li key={doc.id}>
                  {doc.fileName}
                  <button onClick={() => removeDoc(doc.id)}>Delete</button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="phone panel-middle">
          <header>Copilot</header>
          <div className="chat-box">
            {messages.map((m, i) => (
              <div className={`msg ${m.role}`} key={i}>
                <div>{m.text}</div>
                {m.citations && <small>Sources: {m.citations}</small>}
              </div>
            ))}
          </div>
          <div className="ask-bar">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How do I process refund?" />
            <button onClick={ask}>Ask</button>
          </div>
        </section>

        <section className="phone panel-right">
          <header>Recent SOPs</header>
          <div className="list-card">
            {docs.map((doc) => (
              <div className="doc-row" key={doc.id}>
                <div>
                  <strong>{doc.fileName}</strong>
                  <p>{doc.pages || '?'} pages</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}