import React from 'react';

export default function Home({ goToLogin, goToRegister, goToDashboard, hasToken }) {
  return (
    <div className="home-wrapper">
      <header className="home-nav">
        <div className="brand">OpsMind AI</div>
        <nav>
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="nav-actions">
          {hasToken ? (
            <button className="primary-btn" onClick={goToDashboard}>
              Dashboard
            </button>
          ) : (
            <>
              <button className="ghost-btn" onClick={goToLogin}>Log In</button>
              <button className="primary-btn" onClick={goToRegister}>Get Started</button>
            </>
          )}
        </div>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <div className="hero-content">
            <p className="eyebrow">The Future of Operations</p>
            <h1 className="home-title">
              Your Operations,<br />
              <span className="highlight-text">Supercharged by AI</span>
            </h1>
            <p className="home-subtitle">
              Upload SOP documents, query complex processes in real-time, and manage 
              your team's knowledge base with an intuitive, single-panel experience.
            </p>
            <div className="hero-cta">
              {hasToken ? (
                <button className="primary-btn large-btn" onClick={goToDashboard}>
                  Enter Dashboard
                </button>
              ) : (
                <button className="primary-btn large-btn" onClick={goToRegister}>
                  Start Automating Now
                </button>
              )}
            </div>
          </div>
          
          <div className="hero-visual">
            <div className="hero-visual-inner">
               <div className="mockup-header">
                 <div className="dots"><span></span><span></span><span></span></div>
               </div>
               <div className="mockup-body">
                  <div className="mockup-chat">
                     <div className="mockup-msg user">How do I process a refund?</div>
                     <div className="mockup-msg bot">Step 1: Open the order. Step 2: Click Refund...</div>
                  </div>
               </div>
            </div>
          </div>
        </section>

        <section id="features" className="home-features">
          <div className="feature-card">
            <div className="feature-icon">📚</div>
            <h3>Document Control</h3>
            <p>Centralize your SOPs and manuals. Easy PDF upload and secure organization.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3>AI Copilot</h3>
            <p>Get instant answers to operational queries with fully cited internal sources.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Real-time Sync</h3>
            <p>Keep your entire team perfectly aligned with the latest procedures instantly.</p>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <p>&copy; {new Date().getFullYear()} OpsMind AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
