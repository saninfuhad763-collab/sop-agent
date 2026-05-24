import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function App({ goToHome, goToPricing, goToBilling, userPlan, handleLogout }) {
  const token = localStorage.getItem('token');
  const isPro = userPlan === 'pro' || userPlan === 'enterprise';
  const isEnterprise = userPlan === 'enterprise';

  const [activeTab, setActiveTab] = useState('workspace');
  const [docs, setDocs] = useState([]);
  const [status, setStatus] = useState('Ready');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('chat_messages');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitModalMessage, setLimitModalMessage] = useState('');
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const isInitialMount = useRef(true); // skip auto-scroll on first render (restored from storage)

  // Team tab states
  const [teamMembers, setTeamMembers] = useState([]);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteStatus, setInviteStatus] = useState('');

  // Analytics tab states
  const [analytics, setAnalytics] = useState({
    docCount: 0,
    chunkCount: 0,
    totalQueries: 0,
    unansweredCount: 0,
    trends: [
      { day: 'Mon', count: 0 },
      { day: 'Tue', count: 0 },
      { day: 'Wed', count: 0 },
      { day: 'Thu', count: 0 },
      { day: 'Fri', count: 0 },
      { day: 'Sat', count: 0 },
      { day: 'Sun', count: 0 }
    ],
    gaps: []
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Integrations tab states
  const [syncStatus, setSyncStatus] = useState(''); // '', 'connecting', 'scanning', 'downloading', 'indexing', 'success', 'error'
  const [folderLink, setFolderLink] = useState('');
  const [integrations, setIntegrations] = useState([
    { id: 'gdrive', name: 'Google Drive', connected: false, desc: 'Sync SOP PDFs from a Google Drive folder.' },
    { id: 'notion', name: 'Notion', connected: false, desc: 'Sync workspace pages from a private Notion db.' },
    { id: 'confluence', name: 'Confluence', connected: false, desc: 'Ingest company wikis from Atlassian Confluence.' },
    { id: 'onedrive', name: 'OneDrive', connected: false, desc: 'Connect and scan Microsoft OneDrive directories.' }
  ]);

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

  const loadTeamMembers = async () => {
    try {
      const res = await fetch(`${API}/api/team/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setTeamMembers(data.list || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${API}/api/analytics/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setAnalytics(data);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
    if (isPro) {
      loadTeamMembers();
    }
    if (isEnterprise) {
      loadAnalytics();
    }
  }, [isPro, isEnterprise]);

  // Persist chat messages to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem('chat_messages', JSON.stringify(messages));
    } catch {
      // storage quota exceeded — silently ignore
    }
  }, [messages]);

  useEffect(() => {
    if (isInitialMount.current) {
      // First render — messages restored from sessionStorage, don't scroll
      isInitialMount.current = false;
      return;
    }
    if (chatEndRef.current && messages.length > 0) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'team' && isPro) {
      loadTeamMembers();
    } else if (activeTab === 'analytics' && isEnterprise) {
      loadAnalytics();
    }
  }, [activeTab, userPlan, isPro, isEnterprise]);

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
          if (payload.error === "LIMIT_REACHED") {
            copy[idx].text = "Daily query limit reached (10 queries/day max on Free tier). Upgrade to Pro for unlimited queries!";
            setLimitModalMessage("Daily query limit reached (10 queries/day max on Free tier). Upgrade to Pro for unlimited queries!");
            setShowLimitModal(true);
          } else if (payload.error === "NO_DOCS") {
            copy[idx].text = "No SOP documents found in this workspace. Please upload a PDF standard operating procedure first before querying the Copilot.";
          } else {
            copy[idx].text = payload.error;
          }
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
          copy[idx].text = "Connection lost or stream interrupted. Please check your network and retry.";
        }
        return copy;
      });
      es.close();
    };
  };

  const handleInviteTeam = async (e) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviteStatus('Inviting...');

    try {
      const res = await fetch(`${API}/api/team/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          role: inviteRole
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setInviteStatus(data.error || 'Failed to invite');
        if (res.status === 403) {
          setLimitModalMessage(data.error || 'Seat limit reached for Pro. Upgrade to Enterprise for unlimited seats!');
          setShowLimitModal(true);
        }
        return;
      }

      setInviteStatus('Success! Temporary password generated: "123456"');
      setInviteName('');
      setInviteEmail('');
      loadTeamMembers();
    } catch (err) {
      setInviteStatus('Network error');
    }
  };

  const triggerFolderSync = async () => {
    if (!folderLink.trim()) return;
    setSyncStatus('connecting');

    // Fire the real API call immediately so download runs in parallel with UI stages
    const syncPromise = fetch(`${API}/api/integrations/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ folderLink })
    });

    await new Promise(r => setTimeout(r, 800));
    setSyncStatus('scanning');
    await new Promise(r => setTimeout(r, 900));
    setSyncStatus('downloading');

    // Wait for real backend response (PDF download + parse + index)
    let data;
    try {
      const res = await syncPromise;
      data = await res.json();
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(''), 5000);
      return;
    }

    setSyncStatus('indexing');
    await new Promise(r => setTimeout(r, 600));

    if (data.success) {
      setSyncStatus('success');
      loadDocs();
      setTimeout(() => {
        setSyncStatus('');
        setFolderLink('');
      }, 4000);
    } else {
      setSyncStatus('error');
      console.error('Sync error:', data.error);
      setTimeout(() => setSyncStatus(''), 5000);
    }
  };


  const confirmLogout = () => {
    if (handleLogout) {
      handleLogout();
    } else {
      localStorage.removeItem('token');
      window.location.reload();
    }
  };

  const renderLockedFeature = (featureTitle, featureDesc) => {
    return (
      <div className="locked-tab-overlay">
        <div className="lock-orb">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3b82f6' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2>{featureTitle}</h2>
        <p>{featureDesc}</p>
        <button className="upgrade-lock-btn" onClick={goToPricing}>
          ⚡ Upgrade to Pro / Enterprise
        </button>
      </div>
    );
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
            <button className="nav-btn-link" onClick={goToHome}>
              Home
            </button>

            <button className="nav-btn-link" onClick={goToBilling}>
              Billing
            </button>

            <button className="nav-btn-upgrade" onClick={goToPricing}>
              ⚡ Upgrade Now
            </button>

            <button className="nav-btn-logout" onClick={() => setShowLogoutModal(true)}>
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

        {/* Horizontal Navigation Tabs */}
        <div className="dashboard-tabs">
          <button 
            className={`tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveTab('workspace')}
          >
            💻 Workspace & Copilot
          </button>
          <button 
            className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            👥 Team Members {!isPro && (
              <span className="tab-lock-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </span>
            )}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            📊 Search Analytics {!isEnterprise && (
              <span className="tab-lock-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </span>
            )}
          </button>
          <button 
            className={`tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('integrations')}
          >
            🔌 Integrations {!isEnterprise && (
              <span className="tab-lock-badge">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </span>
            )}
          </button>
        </div>

        {/* Tab-driven Content Rendering */}
        {activeTab === 'workspace' && (
          <motion.section 
            className="main-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
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
                <div ref={chatEndRef} />
              </div>

              <form 
                className="ask-bar" 
                onSubmit={(e) => { 
                  e.preventDefault(); 
                  ask(); 
                }}
              >
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="How do I process refund?"
                />

                <button
                  type="submit"
                  className="primary-btn"
                >
                  Ask
                </button>
              </form>
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
          </motion.section>
        )}

        {activeTab === 'team' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {!isPro ? (
              renderLockedFeature("Team Collaboration", "Empower up to 10 colleagues (Pro) or unlimited team members (Enterprise) to securely share, query, and manage your operational standard operating procedures simultaneously with custom workspace authorization keys.")
            ) : (
              <div className="team-grid">
                <div className="team-list-card">
                  <h4>Active Seats ({teamMembers.length} active)</h4>
                  <table className="team-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamMembers.map((member, i) => (
                        <tr key={i}>
                          <td><strong>{member.name}</strong></td>
                          <td>{member.email}</td>
                          <td><span className={`role-badge ${member.role}`}>{member.role}</span></td>
                          <td>
                            <span className="inv-status-badge" style={{ background: member.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: member.status === 'active' ? '#10b981' : '#f59e0b' }}>
                              {member.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="invite-card">
                  <h4>Invite Team Member</h4>
                  <form onSubmit={handleInviteTeam} className="hw-contact-form">
                    <div className="hw-form-group">
                      <label>Full Name</label>
                      <input 
                        value={inviteName} 
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="Sarah Connor" 
                        required
                      />
                    </div>
                    <div className="hw-form-group">
                      <label>Email Address</label>
                      <input 
                        type="email"
                        value={inviteEmail} 
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="sarah@company.com" 
                        required
                      />
                    </div>
                    <div className="hw-form-group">
                      <label>Workspace Authorization Role</label>
                      <select 
                        value={inviteRole} 
                        onChange={(e) => setInviteRole(e.target.value)}
                        style={{
                          padding: '14px 16px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(80, 120, 240, 0.2)',
                          borderRadius: '10px',
                          color: '#f8fafc',
                          fontSize: '14.5px',
                          outline: 'none'
                        }}
                      >
                        <option value="editor" style={{ background: '#020617' }}>Editor (Full Document Control)</option>
                        <option value="viewer" style={{ background: '#020617' }}>Viewer (Read and Query Only)</option>
                        <option value="admin" style={{ background: '#020617' }}>Administrator (Full Access)</option>
                      </select>
                    </div>
                    <button type="submit" className="primary-btn hw-btn-submit">
                      Send Secure Invite
                    </button>
                    {inviteStatus && <p style={{ fontSize: '13px', color: '#60a5fa', margin: '4px 0 0 0', textAlign: 'center' }}>{inviteStatus}</p>}
                  </form>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'analytics' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {!isEnterprise ? (
              renderLockedFeature("Advanced Search Analytics", "Access comprehensive RAG pipeline audits. Discover exact operational questions teammates are querying, track real-time knowledge base coverage, and view highlighted compliance gaps where the model reports missing info.")
            ) : (
              <div>
                <div>
                  <div className="analytics-grid">
                      <div className="metric-card">
                        <div className="metric-label">Workspace Documents</div>
                        <div className="metric-value highlight">{analytics.docCount}</div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-label">Indexed Vector Chunks</div>
                        <div className="metric-value">{analytics.chunkCount}</div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-label">Total SOP Queries</div>
                        <div className="metric-value success">{analytics.totalQueries}</div>
                      </div>
                      <div className="metric-card">
                        <div className="metric-label">Knowledge Gaps (Unanswered)</div>
                        <div className="metric-value warning">{analytics.unansweredCount}</div>
                      </div>
                    </div>

                    <div className="chart-section">
                      <div className="chart-card">
                        <h4>Query Volume Trends (Last 7 Days)</h4>
                        <div className="trend-bars">
                          {analytics.trends.map((t, idx) => (
                            <div className="trend-bar-wrapper" key={idx}>
                              <span className="trend-count">{t.count}</span>
                              <div className="trend-bar-track">
                                <div className="trend-bar-fill" style={{ height: `${t.count > 0 ? Math.min(100, (t.count / 10) * 100) : 5}%` }}></div>
                              </div>
                              <span className="trend-day">{t.day}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="gaps-card">
                        <h4>Detected Knowledge Gaps / SOP Misses</h4>
                        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                          {analytics.gaps.length === 0 ? (
                            <p style={{ fontSize: '13px', color: '#7b8ea8', textAlign: 'center', marginTop: '40px' }}>
                              🎉 Perfect Coverage! No unanswered queries found.
                            </p>
                          ) : (
                            analytics.gaps.map((g, idx) => (
                              <div className="gap-item" key={idx}>
                                <div>
                                  <div className="gap-question">"{g.question}"</div>
                                  <small style={{ fontSize: '11px', color: '#7b8ea8' }}>Queried by {g.userEmail.split('@')[0]}</small>
                                </div>
                                <span className="gap-meta">Gap Detected</span>
                              </div>
                            ))
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'integrations' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {!isEnterprise ? (
              renderLockedFeature("Automated Integrations", "Instantly ingest, chunk, and index SOP documents from Google Drive, Notion, Confluence, or OneDrive folder links directly into your operational AI context.")
            ) : (
              <div className="integrations-wrapper">
                <div className="sync-trigger-card">
                  <h5>📁 Google Drive & Cloud Folders Sync Pipeline</h5>
                  <p>Provide a public folder link containing operational SOP documents. Our pipeline will automatically connect, scan, download, and vector-index them instantly.</p>
                  <div className="sync-input-row">
                    <input 
                      value={folderLink} 
                      onChange={(e) => setFolderLink(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/your-sop-files" 
                      disabled={!!syncStatus}
                    />
                    <button 
                      className="sync-btn"
                      onClick={triggerFolderSync}
                      disabled={!!syncStatus || !folderLink.trim()}
                    >
                      {syncStatus ? 'Syncing...' : 'Initiate Automated Sync'}
                    </button>
                  </div>

                  {syncStatus && (
                    <div className="pipeline-status-container">
                      <div className="pipeline-steps">
                        <div className={`pipeline-step ${syncStatus === 'connecting' ? 'active' : (['scanning', 'downloading', 'indexing', 'success'].includes(syncStatus) ? 'done' : '')}`}>
                          <div className="step-bubble">1</div>
                          <span className="step-label">Connecting</span>
                        </div>
                        <div className={`pipeline-step ${syncStatus === 'scanning' ? 'active' : (['downloading', 'indexing', 'success'].includes(syncStatus) ? 'done' : '')}`}>
                          <div className="step-bubble">2</div>
                          <span className="step-label">Scanning</span>
                        </div>
                        <div className={`pipeline-step ${syncStatus === 'downloading' ? 'active' : (['indexing', 'success'].includes(syncStatus) ? 'done' : '')}`}>
                          <div className="step-bubble">3</div>
                          <span className="step-label">Downloading</span>
                        </div>
                        <div className={`pipeline-step ${syncStatus === 'indexing' ? 'active' : (syncStatus === 'success' ? 'done' : '')}`}>
                          <div className="step-bubble">4</div>
                          <span className="step-label">Indexing</span>
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'center', fontSize: '13px', color: '#60a5fa', fontWeight: '600', marginTop: '12px' }}>
                        {syncStatus === 'connecting' && '🔗 Establishing secure connection slots to cloud folder...'}
                        {syncStatus === 'scanning' && '🔍 Scanning directories and auditing file compatibility...'}
                        {syncStatus === 'downloading' && '⚡ Synchronizing & pulling PDF streams...'}
                        {syncStatus === 'indexing' && '🗂️ Generating embeddings and writing vectors to knowledge base...'}
                        {syncStatus === 'success' && '🎉 Sync Successful! Ingested & fully indexed standard operational guidelines into workspace!'}
                        {syncStatus === 'error' && '❌ Sync pipeline failed. Please check folder permissions and retry.'}
                      </div>
                    </div>
                  )}
                </div>

                <div className="integrations-grid">
                  {integrations.map((item, idx) => (
                    <div className="integration-card" key={idx}>
                      <div className="integration-icon">
                        {item.id === 'gdrive' && '🤖'}
                        {item.id === 'notion' && '📓'}
                        {item.id === 'confluence' && '📘'}
                        {item.id === 'onedrive' && '☁️'}
                      </div>
                      <div className="integration-info">
                        <h5>{item.name}</h5>
                        <p>{item.desc}</p>
                        <span className="inv-status-badge" style={{ background: item.id === 'gdrive' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)', color: item.id === 'gdrive' ? '#10b981' : '#6b84ae' }}>
                          {item.id === 'gdrive' ? 'Pipeline Active' : 'Slot Available'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
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