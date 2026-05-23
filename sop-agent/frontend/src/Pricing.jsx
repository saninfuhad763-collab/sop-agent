import { useState } from 'react';
import { motion } from 'framer-motion';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    description: 'Perfect for getting started with AI-powered SOP management.',
    badge: null,
    features: [
      { text: '5 SOP document uploads', included: true },
      { text: 'Basic AI Copilot queries', included: true },
      { text: '10 queries per day', included: true },
      { text: 'Standard response speed', included: true },
      { text: 'Priority support', included: false },
      { text: 'Team collaboration', included: false },
      { text: 'Advanced analytics', included: false },
      { text: 'Custom integrations', included: false },
    ],
    cta: 'Current Plan',
    ctaDisabled: true,
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 29, yearly: 23 },
    description: 'Unlock the full power of OpsMind AI for your team.',
    badge: 'Most Popular',
    features: [
      { text: 'Unlimited SOP uploads', included: true },
      { text: 'Advanced AI Copilot', included: true },
      { text: 'Unlimited queries', included: true },
      { text: 'Priority response speed', included: true },
      { text: 'Priority support', included: true },
      { text: 'Team collaboration (up to 10)', included: true },
      { text: 'Advanced analytics', included: false },
      { text: 'Custom integrations', included: false },
    ],
    cta: 'Upgrade Now',
    ctaDisabled: false,
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: { monthly: 99, yearly: 79 },
    description: 'For large organizations with complex compliance needs.',
    badge: null,
    features: [
      { text: 'Unlimited SOP uploads', included: true },
      { text: 'Advanced AI Copilot', included: true },
      { text: 'Unlimited queries', included: true },
      { text: 'Fastest response speed', included: true },
      { text: '24/7 dedicated support', included: true },
      { text: 'Unlimited team members', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Custom integrations', included: true },
    ],
    cta: 'Upgrade Now',
    ctaDisabled: false,
    highlight: false,
  },
];

const perks = [
  { icon: '⚡', title: 'Instant Setup', desc: 'Go live in under 2 minutes with zero configuration required.' },
  { icon: '🔒', title: 'Enterprise Security', desc: 'SOC 2 Type II compliant. Your data stays encrypted end-to-end.' },
  { icon: '🤝', title: 'Cancel Anytime', desc: 'No lock-in contracts. Cancel or downgrade whenever you want.' },
  { icon: '🌍', title: '99.9% Uptime SLA', desc: 'Reliable infrastructure backed by a strong SLA guarantee.' },
];

export default function Pricing({ goToDashboard, goToHome, onUpgrade, userPlan, setUserPlan }) {
  const [billing, setBilling] = useState('monthly');
  const [hoveredPlan, setHoveredPlan] = useState(null);
  const [downgradePlan, setDowngradePlan] = useState(null);
  
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactStatus, setContactStatus] = useState('');

  const activePlan = userPlan || localStorage.getItem('userPlan') || 'free';
  const isPro = activePlan === 'pro' || activePlan === 'enterprise';

  const dynamicPlans = plans.map(p => {
    if (p.id === activePlan) {
      return { ...p, cta: 'Current Plan', ctaDisabled: true };
    } else if (activePlan === 'enterprise' && p.id === 'pro') {
      return { ...p, cta: 'Downgrade', ctaDisabled: false };
    } else if (activePlan === 'enterprise' && p.id === 'free') {
      return { ...p, cta: 'Downgrade', ctaDisabled: false };
    } else if (activePlan === 'pro' && p.id === 'free') {
      return { ...p, cta: 'Downgrade', ctaDisabled: false };
    }
    return p;
  });

  return (
    <div className="pricing-page">
      {/* ── Nav ── */}
      <header className="pricing-nav">
        <div className="brand" onClick={goToHome} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          OpsMind AI
          {isPro && <span className="pro-badge">PRO</span>}
        </div>
        <div className="nav-actions">
          <button className="ghost-btn" onClick={goToDashboard}>← Dashboard</button>
        </div>
      </header>

      <div className="pricing-content">
        {/* ── Hero ── */}
        <div className="pricing-hero">
          <span className="pricing-eyebrow">Flexible Pricing</span>
          <h1 className="pricing-title">
            Upgrade your<br />
            <span className="pricing-accent">operations intelligence</span>
          </h1>
          <p className="pricing-subtitle">
            Choose the plan that fits your team. Upgrade, downgrade, or cancel at any time.
          </p>

          {/* Billing Toggle */}
          <div className="billing-toggle">
            <button
              className={`toggle-btn ${billing === 'monthly' ? 'active' : ''}`}
              onClick={() => setBilling('monthly')}
            >
              Monthly
            </button>
            <button
              className={`toggle-btn ${billing === 'yearly' ? 'active' : ''}`}
              onClick={() => setBilling('yearly')}
            >
              Yearly
              <span className="toggle-badge">Save 20%</span>
            </button>
          </div>
        </div>

        {/* ── Plan Cards ── */}
        <div className="pricing-grid">
          {dynamicPlans.map((plan, i) => (
            <div
              key={plan.id}
              className={`plan-card ${plan.highlight ? 'plan-card--highlight' : ''} ${hoveredPlan === plan.id ? 'plan-card--hovered' : ''}`}
              style={{ animationDelay: `${i * 0.1}s` }}
              onMouseEnter={() => setHoveredPlan(plan.id)}
              onMouseLeave={() => setHoveredPlan(null)}
            >
              {/* Glow orb for highlighted card */}
              {plan.highlight && <div className="plan-glow" />}

              {/* Badge */}
              {plan.badge && (
                <div className="plan-badge">{plan.badge}</div>
              )}

              {/* Header */}
              <div className="plan-header">
                <h3 className="plan-name">{plan.name}</h3>
                <div className="plan-price-wrap">
                  <span className="plan-currency">$</span>
                  <span className="plan-price">
                    {billing === 'monthly' ? plan.price.monthly : plan.price.yearly}
                  </span>
                  <span className="plan-period">
                    {plan.price.monthly === 0 ? 'forever' : '/mo'}
                  </span>
                </div>
                {billing === 'yearly' && plan.price.monthly > 0 && (
                  <p className="plan-billed-note">Billed annually · Save ${(plan.price.monthly - plan.price.yearly) * 12}/yr</p>
                )}
                <p className="plan-desc">{plan.description}</p>
              </div>

              {/* CTA */}
              <button
                className={`plan-cta ${plan.highlight ? 'plan-cta--primary' : 'plan-cta--ghost'} ${plan.ctaDisabled ? 'plan-cta--disabled' : ''}`}
                disabled={plan.ctaDisabled}
                onClick={() => {
                  if (plan.ctaDisabled) return;
                  if (plan.cta === 'Downgrade') {
                    setDowngradePlan(plan);
                  } else if (onUpgrade) {
                    onUpgrade(plan, billing);
                  }
                }}
              >
                {plan.cta}
                {!plan.ctaDisabled && <span className="cta-arrow">→</span>}
              </button>

              {/* Features */}
              <ul className="plan-features">
                {plan.features.map((f, j) => (
                  <li key={j} className={`plan-feature ${f.included ? 'plan-feature--on' : 'plan-feature--off'}`}>
                    <span className="feature-icon">{f.included ? '✓' : '✕'}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Perks Strip ── */}
        <div className="perks-strip">
          {perks.map((p, i) => (
            <div key={i} className="perk-item" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
              <span className="perk-icon">{p.icon}</span>
              <div>
                <h4 className="perk-title">{p.title}</h4>
                <p className="perk-desc">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── FAQ teaser ── */}
        <div className="pricing-cta-strip">
          <p className="cta-strip-text">Still have questions? We're here to help.</p>
          <button 
            className="ghost-btn cta-strip-btn"
            onClick={() => {
              setContactMessage('');
              setContactStatus('');
              setShowContactModal(true);
            }}
          >
            Talk to Sales
          </button>
        </div>
      </div>

      {/* ── Downgrade Confirmation Modal ── */}
      {downgradePlan && (
        <div className="modal-overlay" onClick={() => setDowngradePlan(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>⚠️</div>
            <h3 className="modal-title">Confirm Downgrade</h3>
            <p className="modal-desc">
              Are you sure you want to downgrade to the <strong>{downgradePlan.name}</strong> plan? 
              You will lose access to premium features and your limits will be reduced immediately.
            </p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setDowngradePlan(null)}>
                Cancel
              </button>
              <button className="modal-confirm" style={{ background: '#ef4444' }} onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch('http://localhost:5000/api/payments/cancel', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`
                    }
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    alert(data.error || 'Failed to cancel subscription');
                    return;
                  }
                  localStorage.setItem('userPlan', downgradePlan.id);
                  if (setUserPlan) setUserPlan(downgradePlan.id);
                  setDowngradePlan(null);
                } catch (err) {
                  alert('Network error while downgrading');
                }
              }}>
                Yes, Downgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contact Sales Modal ── */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <motion.div 
            className="modal-card" 
            onClick={(e) => e.stopPropagation()} 
            style={{ maxWidth: '480px' }}
            initial={{ opacity: 0, scale: 0.94, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div className="modal-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>📧</div>
            <h3 className="modal-title">Talk to Sales</h3>
            <p className="modal-desc" style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '16px' }}>
              Discuss custom Enterprise features, team accounts, or dedicated compliance needs with our solutions engineers.
            </p>
            
            {contactStatus === 'success' ? (
              <div className="contact-success-state" style={{ textAlign: 'center', padding: '20px 0' }}>
                <span style={{ fontSize: '3rem' }}>🎉</span>
                <h4 style={{ color: '#10b981', margin: '10px 0', fontSize: '1.2rem' }}>Message Sent!</h4>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Thank you. Our sales desk will reach out to you within 24 hours.</p>
                <button 
                  className="modal-cancel" 
                  onClick={() => setShowContactModal(false)}
                  style={{ marginTop: '20px', width: '100%', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Close Window
                </button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setContactStatus('sending');
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch('http://localhost:5000/api/contact', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      name: contactName,
                      email: contactEmail,
                      message: contactMessage
                    })
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setContactStatus('success');
                    setContactName('');
                    setContactEmail('');
                    setContactMessage('');
                  } else {
                    setContactStatus('error');
                    alert(data.error || 'Failed to submit form');
                  }
                } catch (err) {
                  setContactStatus('error');
                  alert('Network error while sending message');
                }
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', marginBottom: '20px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '500' }}>Full Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="John Doe" 
                    value={contactName} 
                    onChange={e => setContactName(e.target.value)} 
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', outline: 'none', transition: 'border-color 0.2s' }}
                  />
                  
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '500' }}>Work Email</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="john@company.com" 
                    value={contactEmail} 
                    onChange={e => setContactEmail(e.target.value)} 
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', outline: 'none', transition: 'border-color 0.2s' }}
                  />
                  
                  <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '500' }}>Message</label>
                  <textarea 
                    required 
                    rows={4}
                    placeholder="Tell us about your team size, custom compliance needs..." 
                    value={contactMessage} 
                    onChange={e => setContactMessage(e.target.value)} 
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px', color: '#fff', outline: 'none', resize: 'vertical', minHeight: '80px', transition: 'border-color 0.2s' }}
                  />
                </div>
                
                <div className="modal-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button type="button" className="modal-cancel" onClick={() => setShowContactModal(false)} disabled={contactStatus === 'sending'} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" className="modal-confirm" disabled={contactStatus === 'sending'} style={{ background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '8px', padding: '10px 22px', cursor: 'pointer', fontWeight: '600' }}>
                    {contactStatus === 'sending' ? 'Sending...' : 'Send Inquiry'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
