import { useState } from 'react';

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
    cta: 'Upgrade to Pro',
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
    cta: 'Contact Sales',
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

export default function Pricing({ goToDashboard, goToHome, onUpgrade }) {
  const [billing, setBilling] = useState('monthly');
  const [hoveredPlan, setHoveredPlan] = useState(null);

  return (
    <div className="pricing-page">
      {/* ── Nav ── */}
      <header className="pricing-nav">
        <div className="brand" onClick={goToHome} style={{ cursor: 'pointer' }}>OpsMind AI</div>
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
          {plans.map((plan, i) => (
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
                onClick={() => !plan.ctaDisabled && onUpgrade && onUpgrade(plan, billing)}
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
          <button className="ghost-btn cta-strip-btn">Talk to Sales</button>
        </div>
      </div>
    </div>
  );
}
