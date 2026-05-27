import React, { useState } from 'react';

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Home({ goToLogin, goToRegister, goToDashboard, hasToken }) {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const userPlan = localStorage.getItem('userPlan');
  const isPro = userPlan === 'pro' || userPlan === 'enterprise';
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;
    setSubmitting(true);
    
    try {
      const res = await fetch(`${API}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        setSubmitted(true);
        setFormData({ name: '', email: '', message: '' });
        setTimeout(() => setSubmitted(false), 5000);
      }
    } catch (err) {
      console.error("Contact submission failed", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hw-page">
      {/* ── Navigation (Sticky outside of shell) ── */}
      <header className="hw-nav">
        <div className="brand" onClick={goToDashboard} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          OpsMind AI
          {isPro && <span className="pro-badge">PRO</span>}
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

      {/* ── Outer bordered shell (matches the reference's framed container) ── */}
      <div className="hw-shell">

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

      {/* ── Contact Section ── */}
      <section className="hw-contact" id="contact">
        <div className="hw-contact-header">
          <div className="hw-badge">Get in Touch</div>
          <h2>Contact <span className="hw-accent">Our Team</span></h2>
          <p className="hw-contact-subtitle">
            Have questions about OpsMind AI? We're here to help you scale and optimize your operations.
          </p>
        </div>

        <div className="hw-contact-grid">
          {/* Info cards (Left Column) */}
          <div className="hw-contact-info">
            <div className="hw-info-card">
              <div className="hw-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </div>
              <div className="hw-info-content">
                <h4>Email Us</h4>
                <p>support@opsmind.ai</p>
                <span>Response within 24 hours</span>
              </div>
            </div>

            <div className="hw-info-card">
              <div className="hw-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              </div>
              <div className="hw-info-content">
                <h4>Our Headquarters</h4>
                <p>100 Pine Street, Suite 1250</p>
                <span>San Francisco, CA 94111</span>
              </div>
            </div>

            <div className="hw-info-card">
              <div className="hw-info-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              </div>
              <div className="hw-info-content">
                <h4>Call Support</h4>
                <p>+1 (800) 555-OPSMIND</p>
                <span>Mon-Fri from 9am - 6pm PST</span>
              </div>
            </div>
          </div>

          {/* Contact Form (Right Column) */}
          <div className="hw-contact-form-container">
            <div className="hw-form-glow"></div>
            {submitted ? (
              <div className="hw-contact-success">
                <div className="hw-success-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                </div>
                <h3>Message Sent Successfully!</h3>
                <p>Thank you for reaching out. A team member will get back to you shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="hw-contact-form">
                <div className="hw-form-group">
                  <label htmlFor="contact-name">Full Name</label>
                  <input
                    type="text"
                    id="contact-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="hw-form-group">
                  <label htmlFor="contact-email">Email Address</label>
                  <input
                    type="email"
                    id="contact-email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@example.com"
                    required
                  />
                </div>

                <div className="hw-form-group">
                  <label htmlFor="contact-message">Your Message</label>
                  <textarea
                    id="contact-message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="How can we help you simplify your operations?"
                    rows="5"
                    required
                  ></textarea>
                </div>

                <button type="submit" className="hw-btn-primary hw-btn-submit" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="hw-footer">
        © {new Date().getFullYear()} OpsMind AI. All rights reserved.
      </footer>
    </div>
  );
}
