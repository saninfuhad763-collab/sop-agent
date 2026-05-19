import React from 'react';

export default function Home({ goToLogin, goToRegister, goToDashboard, hasToken }) {
  return (
    <div className="hw-page">
      {/* ── Outer bordered shell (matches the reference's framed container) ── */}
      <div className="hw-shell">

        {/* ── Navigation ── */}
        <header className="hw-nav">
          <div className="brand" onClick={goToDashboard} style={{ cursor: 'pointer' }}>
            OpsMind AI
          </div>
          <nav className="hw-nav-links">
            <a href="#" onClick={(e) => { e.preventDefault(); goToDashboard(); }}>Dashboard</a>
            <a href="#features">Features</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="hw-nav-actions">
            {!hasToken && (
              <>
                <button className="hw-btn-ghost" onClick={goToLogin}>Sign in</button>
                <button className="hw-btn-primary" onClick={goToRegister}>Get started</button>
              </>
            )}
          </div>
        </header>

        {/* ── Hero ── */}
        <section className="hw-hero" id="hero">
          {/* Left copy */}
          <div className="hw-hero-copy">
            <h1 className="hw-h1">
              The easiest way<br />
              To power up<br />
              <span className="hw-accent">
                Your operations<br />
                Using powerful AI
              </span>
            </h1>
            <p className="hw-lead">
              Upload SOP documents, query complex processes in real-time, and
              manage your team's knowledge base with an intuitive, single-panel
              experience.
            </p>
            <div className="hw-cta-row">
              {hasToken ? (
                <button className="hw-btn-primary hw-btn-lg" onClick={goToDashboard}>
                  Enter Dashboard
                </button>
              ) : (
                <button className="hw-btn-primary hw-btn-lg" onClick={goToRegister}>
                  Get started
                </button>
              )}
            </div>
          </div>

          {/* Right mockup */}
          <div className="hw-mockup-wrap">
            <div className="hw-mockup-glow"></div>
            <div className="hw-mockup">
              {/* Title bar */}
              <div className="hw-mockup-bar">
                <span className="hw-dot hw-dot-r"></span>
                <span className="hw-dot hw-dot-y"></span>
                <span className="hw-dot hw-dot-g"></span>
                <div className="hw-mockup-url">opsmind.ai/dashboard</div>
                <div className="hw-mockup-icons">⊟ ⊞ ✕</div>
              </div>
              {/* Body */}
              <div className="hw-mockup-body">
                {/* Sidebar */}
                <div className="hw-mock-sidebar">
                  <div className="hw-mock-item active">📄 Documents</div>
                  <div className="hw-mock-item">🤖 AI Copilot</div>
                  <div className="hw-mock-item">⚡ Sync Status</div>
                  <div className="hw-mock-item">⚙ Settings</div>
                </div>
                {/* Chat pane */}
                <div className="hw-mock-chat">
                  <div className="hw-mock-msg hw-mock-msg-q">
                    <div className="hw-mock-label">User</div>
                    How do I process a customer refund?
                  </div>
                  <div className="hw-mock-msg hw-mock-msg-a">
                    <div className="hw-mock-label">AI Copilot</div>
                    Step 1: Open the order details panel.<br />
                    Step 2: Click "Initiate Refund".<br />
                    Step 3: Select reason and confirm.
                  </div>
                  <div className="hw-mock-msg hw-mock-msg-cite">
                    <div className="hw-mock-label">📄 Cited from: Refund_Policy_v3.pdf</div>
                    Refund processed in 3–5 business days.
                  </div>
                  <div className="hw-mock-input-row">
                    <div className="hw-mock-input">Ask anything about your SOPs…</div>
                    <button className="hw-mock-send">➤</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trusted strip ── */}
        <div className="hw-trusted">
          <p className="hw-trusted-label">Trusted by the best operations teams around the world</p>
          <div className="hw-trusted-row">
            <span>⟳ agency</span>
            <span>☁ operations</span>
            <span>◆ enterprise</span>
            <span>↗ startup</span>
            <span>⊕ logistics</span>
            <span>⌘ institute</span>
            <span>⊞ organization</span>
          </div>
        </div>

        {/* ── Feature cards — fills bottom of shell ── */}
        <section className="hw-cards" id="features">
          <div className="hw-feature-card">
            <div className="hw-fc-img" style={{ backgroundImage: "url('/feature_1.png')" }}></div>
            <div className="hw-fc-body">
              <h3 className="hw-fc-title">Upload <span className="hw-fc-blue">&</span> Centralize<br />Your SOPs</h3>
              <p className="hw-fc-desc">Upload SOP documents, policies, and processes in any format. All your knowledge, in one place.</p>
              <div className="hw-fc-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </div>
            </div>
          </div>
          <div className="hw-feature-card">
            <div className="hw-fc-img" style={{ backgroundImage: "url('/feature_2.png')" }}></div>
            <div className="hw-fc-body">
              <h3 className="hw-fc-title">AI Copilot for<br />Instant Answers</h3>
              <p className="hw-fc-desc">Ask questions in natural language and get accurate answers instantly from your SOPs.</p>
              <div className="hw-fc-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><circle cx="8" cy="10" r="1"></circle><circle cx="12" cy="10" r="1"></circle><circle cx="16" cy="10" r="1"></circle></svg>
              </div>
            </div>
          </div>
          <div className="hw-feature-card">
            <div className="hw-fc-img" style={{ backgroundImage: "url('/feature_3.png')" }}></div>
            <div className="hw-fc-body">
              <h3 className="hw-fc-title">Smart Search <span className="hw-fc-blue">&</span><br />Knowledge Discovery</h3>
              <p className="hw-fc-desc">Find what you need, faster. AI understands context and surfaces the most relevant information.</p>
              <div className="hw-fc-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
            </div>
          </div>
          <div className="hw-feature-card">
            <div className="hw-fc-img" style={{ backgroundImage: "url('/feature_4.png')" }}></div>
            <div className="hw-fc-body">
              <h3 className="hw-fc-title">Secure, Compliant<br /><span className="hw-fc-blue">&</span> Enterprise Ready</h3>
              <p className="hw-fc-desc">Enterprise-grade security, role-based access, and compliance built in to keep your data safe.</p>
              <div className="hw-fc-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              </div>
            </div>
          </div>
        </section>

      </div>{/* /hw-shell */}

      {/* ── About (below fold) ── */}
      <section className="hw-about" id="about">
        <h2>About <span className="hw-accent">OpsMind AI</span></h2>
        <p>
          OpsMind AI is designed to be the ultimate companion for your operations
          team. By simply uploading your standard operating procedures, policies,
          and manuals, our AI engine understands and retrieves exact answers in real-time.
        </p>
        <p>
          Stop wasting time digging through scattered documents. Centralize your
          knowledge base and empower your employees with a chat-driven interface
          that knows your company's processes inside and out.
        </p>
      </section>

      <footer className="hw-footer" id="contact">
        © {new Date().getFullYear()} OpsMind AI. All rights reserved.
      </footer>
    </div>
  );
}
