import { useState } from 'react';

export default function Payment({ plan, billing, goToPricing, goToDashboard }) {
  const [form, setForm] = useState({
    email: '',
    name: '',
    card: '',
    expiry: '',
    cvv: '',
  });
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState({});

  const price = billing === 'yearly'
    ? (plan?.price?.yearly ?? 23)
    : (plan?.price?.monthly ?? 29);

  const planName = plan?.name ?? 'Pro';

  const formatCard = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let formatted = value;
    if (name === 'card') formatted = formatCard(value);
    if (name === 'expiry') formatted = formatExpiry(value);
    if (name === 'cvv') formatted = value.replace(/\D/g, '').slice(0, 3);
    setForm((f) => ({ ...f, [name]: formatted }));
    setErrors((er) => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = 'Enter a valid email.';
    if (form.name.trim().length < 2) e.name = 'Enter the name on card.';
    if (form.card.replace(/\s/g, '').length !== 16) e.card = 'Enter a valid 16-digit card number.';
    if (!form.expiry.match(/^\d{2}\/\d{2}$/)) e.expiry = 'Enter expiry as MM/YY.';
    if (form.cvv.length !== 3) e.cvv = 'CVV must be 3 digits.';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setProcessing(true);
    // Simulate payment processing
    setTimeout(() => {
      setProcessing(false);
      setSuccess(true);
    }, 2200);
  };

  if (success) {
    return (
      <div className="payment-page">
        <div className="payment-success-card">
          <div className="success-icon">✅</div>
          <h2 className="success-title">You're on {planName}!</h2>
          <p className="success-desc">
            Your subscription is now active. Enjoy unlimited access to all {planName} features.
          </p>
          <button className="pay-submit-btn" onClick={goToDashboard}>
            Go to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-page">
      {/* Nav */}
      <header className="pricing-nav">
        <div className="brand" onClick={goToDashboard} style={{ cursor: 'pointer' }}>OpsMind AI</div>
        <div className="nav-actions">
          <button className="ghost-btn" onClick={goToPricing}>← Back to Plans</button>
        </div>
      </header>

      <div className="payment-layout">
        {/* Order Summary */}
        <aside className="order-summary">
          <div className="order-summary-inner">
            <p className="order-eyebrow">Order Summary</p>
            <div className="order-plan-badge">{planName}</div>
            <div className="order-price-row">
              <span className="order-price">${price}</span>
              <span className="order-period">/{billing === 'yearly' ? 'mo · billed annually' : 'month'}</span>
            </div>
            {billing === 'yearly' && (
              <p className="order-saving">🎉 You save ${(29 - price) * 12}/year with annual billing</p>
            )}
            <ul className="order-features">
              <li>✓ Unlimited SOP uploads</li>
              <li>✓ Advanced AI Copilot</li>
              <li>✓ Unlimited queries</li>
              <li>✓ Priority response speed</li>
              <li>✓ Priority support</li>
              <li>✓ Team collaboration (up to 10)</li>
            </ul>
            <div className="order-trust">
              <span>🔒 Secure & encrypted checkout</span>
              <span>🔄 Cancel anytime</span>
            </div>
          </div>
        </aside>

        {/* Payment Form */}
        <main className="payment-form-wrap">
          <h1 className="payment-title">Complete your purchase</h1>
          <p className="payment-subtitle">You're one step away from supercharging your operations.</p>

          <form className="payment-form" onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="form-group">
              <label className="form-label" htmlFor="pay-email">Email address</label>
              <input
                id="pay-email"
                className={`form-input ${errors.email ? 'form-input--error' : ''}`}
                type="email"
                name="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
              />
              {errors.email && <p className="form-error">{errors.email}</p>}
            </div>

            {/* Card Section */}
            <div className="form-section-label">Payment details</div>

            <div className="form-group">
              <label className="form-label" htmlFor="pay-name">Name on card</label>
              <input
                id="pay-name"
                className={`form-input ${errors.name ? 'form-input--error' : ''}`}
                type="text"
                name="name"
                placeholder="Jane Smith"
                value={form.name}
                onChange={handleChange}
                autoComplete="cc-name"
              />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="pay-card">Card number</label>
              <div className="card-input-wrap">
                <input
                  id="pay-card"
                  className={`form-input ${errors.card ? 'form-input--error' : ''}`}
                  type="text"
                  name="card"
                  placeholder="1234 5678 9012 3456"
                  value={form.card}
                  onChange={handleChange}
                  autoComplete="cc-number"
                  inputMode="numeric"
                />
                <div className="card-icons">
                  <span title="Visa">💳</span>
                </div>
              </div>
              {errors.card && <p className="form-error">{errors.card}</p>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="pay-expiry">Expiry</label>
                <input
                  id="pay-expiry"
                  className={`form-input ${errors.expiry ? 'form-input--error' : ''}`}
                  type="text"
                  name="expiry"
                  placeholder="MM/YY"
                  value={form.expiry}
                  onChange={handleChange}
                  autoComplete="cc-exp"
                  inputMode="numeric"
                />
                {errors.expiry && <p className="form-error">{errors.expiry}</p>}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pay-cvv">CVV</label>
                <input
                  id="pay-cvv"
                  className={`form-input ${errors.cvv ? 'form-input--error' : ''}`}
                  type="text"
                  name="cvv"
                  placeholder="123"
                  value={form.cvv}
                  onChange={handleChange}
                  autoComplete="cc-csc"
                  inputMode="numeric"
                />
                {errors.cvv && <p className="form-error">{errors.cvv}</p>}
              </div>
            </div>

            <button
              type="submit"
              className={`pay-submit-btn ${processing ? 'pay-submit-btn--loading' : ''}`}
              disabled={processing}
            >
              {processing ? (
                <span className="pay-spinner">⟳ Processing…</span>
              ) : (
                <>⚡ Pay ${price}/{billing === 'yearly' ? 'mo' : 'month'} — Start {planName}</>
              )}
            </button>

            <p className="pay-legal">
              By continuing, you agree to our <a href="#" className="pay-link">Terms of Service</a> and{' '}
              <a href="#" className="pay-link">Privacy Policy</a>. You can cancel at any time.
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}
