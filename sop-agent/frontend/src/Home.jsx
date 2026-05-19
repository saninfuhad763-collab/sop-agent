import React from 'react';

export default function Home({ goToLogin, goToRegister, goToDashboard, hasToken }) {
  return (
    <div className="hw-page">
      {/* ── Outer bordered shell (matches the reference's framed container) ── */}
      <div className="hw-shell">

        {/* ── Navigation ── */}
        <header className="hw-nav">
          <div className="hw-brand">
            <span className="hw-brand-icon">◉</span>
            <span className="hw-brand-name">OpsMind AI</span>
          </div>
          <nav className="hw-nav-links">
            <a href="#hero">Home</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="hw-nav-actions">
            {hasToken ? (
              <button className="hw-btn-ghost" onClick={goToDashboard}>Dashboard</button>
            ) : (
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
            <div className="hw-badge">WE'VE LAUNCHED OPSMIND AI 2.0. CHECK IT OUT</div>
            <h1 className="hw-h1">
              The easiest way<br />
              to power up your<br />
              <span className="hw-accent">operations with AI</span>
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
          <div className="hw-card" style={{ backgroundImage: "url('/card_doc.png')" }}>
            <div className="hw-card-overlay"></div>
            <div className="hw-card-body">
              <div className="hw-card-icon">📚</div>
              <h3 className="hw-card-title">Document Control</h3>
              <p className="hw-card-desc">Centralize your SOPs and manuals. Easy PDF upload and secure organization.</p>
            </div>
          </div>

          <div className="hw-card" style={{ backgroundImage: "url('/card_ai.png')" }}>
            <div className="hw-card-overlay"></div>
            <div className="hw-card-body">
              <div className="hw-card-icon">🤖</div>
              <h3 className="hw-card-title">AI Copilot</h3>
              <p className="hw-card-desc">Get instant answers to operational queries with fully cited internal sources.</p>
            </div>
          </div>

          <div className="hw-card" style={{ backgroundImage: "url('/card_sync.png')" }}>
            <div className="hw-card-overlay"></div>
            <div className="hw-card-body">
              <div className="hw-card-icon">⚡</div>
              <h3 className="hw-card-title">Real-time Sync</h3>
              <p className="hw-card-desc">Keep your entire team perfectly aligned with the latest procedures instantly.</p>
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
