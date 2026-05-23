import { useState, useEffect } from 'react';

const API = ''; // Vite proxies /api, /auth etc. to http://localhost:5000

// Dynamically load Razorpay checkout script
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-script')) return resolve(true);
    const script = document.createElement('script');
    script.id = 'razorpay-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const upiApps = [
  { id: 'gpay',    name: 'Google Pay',  icon: '🤖' },
  { id: 'phonepe', name: 'PhonePe',     icon: '🟣' },
  { id: 'paytm',   name: 'Paytm',       icon: '🔵' },
  { id: 'bhim',    name: 'BHIM UPI',    icon: '🇮🇳' },
];

const popularBanks = [
  { id: 'HDFC', name: 'HDFC Bank' },
  { id: 'ICIC', name: 'ICICI Bank' },
  { id: 'SBIN', name: 'State Bank of India' },
  { id: 'UTIB', name: 'Axis Bank' },
];

const walletOptions = [
  { id: 'paytm',    name: 'Paytm Wallet' },
  { id: 'amazonpay',name: 'Amazon Pay' },
  { id: 'phonepe',  name: 'PhonePe Wallet' },
];

export default function Payment({ plan, billing, goToPricing, goToDashboard }) {
  const [form, setForm] = useState({
    email: localStorage.getItem('userEmail') || '',
    paymentMethod: 'card',
    selectedBank: '',
    selectedWallet: '',
  });

  const [errors,       setErrors]       = useState({});
  const [payState,     setPayState]     = useState('input');   // input | processing | success | failure
  const [failReason,   setFailReason]   = useState('');
  const [paymentId,    setPaymentId]    = useState('');
  const [sdkReady,     setSdkReady]     = useState(false);

  // Price in INR — Razorpay works natively in INR
  const priceINR = billing === 'yearly'
    ? (plan?.price?.yearlyINR ?? 1999)
    : (plan?.price?.monthlyINR ?? 2499);

  const planName = plan?.name ?? 'Pro';
  const planId   = plan?.id   ?? 'pro';

  useEffect(() => {
    loadRazorpayScript().then(setSdkReady);
  }, []);

  const validateEmail = () => {
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setErrors(e => ({ ...e, email: 'Please enter a valid billing email before proceeding.' }));
      return false;
    }
    return true;
  };

  // ── Core payment launcher ──────────────────────────────────────────────
  const launchRazorpay = async (prefill = {}) => {
    if (!validateEmail()) return;
    if (!sdkReady) {
      setFailReason('Razorpay SDK failed to load. Check your internet connection and try again.');
      setPayState('failure');
      return;
    }

    setPayState('processing');

    try {
      // 1. Create order on our backend
      const orderRes = await fetch(`${API}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          planName,
          billing,
          amount: priceINR,
          currency: 'INR',
          email: form.email,
        }),
      });

      let orderData;
      try {
        orderData = await orderRes.json();
      } catch {
        setFailReason('Backend returned an invalid response. Make sure the server is running on port 5000.');
        setPayState('failure');
        return;
      }

      if (!orderRes.ok) {
        const msg = orderData?.error || `Server error ${orderRes.status}`;
        // Detect placeholder/invalid Razorpay key specifically
        const isKeyError = msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('key') || orderRes.status === 401;
        setFailReason(
          isKeyError
            ? 'Invalid Razorpay API key. Please add your real Key ID and Key Secret to the .env file and restart the server.'
            : msg
        );
        setPayState('failure');
        return;
      }

      // 2. Open Razorpay Checkout widget
      const options = {
        key:          orderData.key,
        amount:       orderData.amount,
        currency:     orderData.currency,
        name:         'OpsMind AI',
        description:  `${planName} Plan — ${billing}`,
        order_id:     orderData.orderId,
        prefill: {
          email: form.email,
          ...prefill,
        },
        theme: { color: '#4b87ff' },
        modal: {
          ondismiss: () => {
            setFailReason('Payment was cancelled. You can try again anytime.');
            setPayState('failure');
          },
        },
        handler: async (response) => {
          // 3. Verify signature on our backend
          try {
            const verifyRes = await fetch(`${API}/api/payments/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                planId,
                email: form.email,
              }),
            });

            const verifyData = await verifyRes.json();

            if (!verifyRes.ok) {
              setFailReason(verifyData.error || 'Payment verification failed.');
              setPayState('failure');
              return;
            }

            // 4. Success — update localStorage plan & show success screen
            localStorage.setItem('userPlan', planId);
            localStorage.setItem('userEmail', form.email);
            setPaymentId(response.razorpay_payment_id);
            setPayState('success');
          } catch {
            setFailReason('Network error during verification. Contact support with your payment ID.');
            setPayState('failure');
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        setFailReason(resp.error?.description || 'Payment failed. Please try again.');
        setPayState('failure');
      });
      rzp.open();

    } catch (err) {
      const isOffline = err instanceof TypeError && err.message.includes('fetch');
      setFailReason(
        isOffline
          ? 'Cannot reach the server. Make sure the backend is running (npm run dev) on port 5000.'
          : `Unexpected error: ${err.message}`
      );
      setPayState('failure');
    }
  };

  const handleDownloadInvoice = () => {
    const invId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
    const content = `
=========================================
          OPSMIND AI INVOICE
=========================================
Invoice ID:    ${invId}
Razorpay ID:   ${paymentId}
Date:          ${new Date().toLocaleDateString()}
Amount:        ₹${priceINR}
Status:        Paid / Successful
Billed To:     ${form.email}
Plan:          ${planName} (${billing})
=========================================
Thank you for choosing OpsMind AI!
    `;
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${invId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Success Screen ─────────────────────────────────────────────────────
  if (payState === 'success') {
    return (
      <div className="payment-page">
        <div className="payment-success-card glass-card">
          <div className="success-check-badge">✓</div>
          <h2 className="success-title">Subscription Activated!</h2>
          <p className="success-desc">
            Welcome to the <strong>{planName} Plan</strong>. Your payment of <strong>₹{priceINR}</strong> was processed successfully.
          </p>
          <div className="success-metadata">
            <div className="meta-item"><span>Status:</span>        <strong className="status-active">Active</strong></div>
            <div className="meta-item"><span>Billing cycle:</span> <strong>{billing.toUpperCase()}</strong></div>
            <div className="meta-item"><span>Account:</span>       <strong>{form.email}</strong></div>
            {paymentId && <div className="meta-item"><span>Payment ID:</span> <strong style={{ fontSize: '12px' }}>{paymentId}</strong></div>}
          </div>
          <div className="success-actions">
            <button className="primary-btn flex-btn" onClick={goToDashboard}>Go to Dashboard</button>
            <button className="ghost-btn flex-btn"   onClick={handleDownloadInvoice}>📥 Invoice</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Failure Screen ─────────────────────────────────────────────────────
  if (payState === 'failure') {
    return (
      <div className="payment-page">
        <div className="payment-success-card glass-card" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="success-check-badge" style={{ background: '#ef4444', boxShadow: '0 0 20px rgba(239,68,68,0.4)' }}>✕</div>
          <h2 className="success-title">Payment Failed</h2>
          <p className="success-desc">{failReason}</p>
          <div className="success-actions" style={{ flexDirection: 'column', gap: '10px', width: '100%' }}>
            <button
              className="primary-btn flex-btn"
              style={{ background: '#ef4444', width: '100%' }}
              onClick={() => setPayState('input')}
            >
              🔄 Try Again
            </button>
            <button className="ghost-btn flex-btn" style={{ width: '100%' }} onClick={goToPricing}>
              ← Choose Another Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Processing Screen ──────────────────────────────────────────────────
  if (payState === 'processing') {
    return (
      <div className="payment-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '36px', animation: 'payPulse 1.2s infinite', marginBottom: '16px' }}>⟳</div>
          <h3 className="modal-title">Connecting to Gateway...</h3>
          <p className="modal-desc">Communicating securely with Razorpay. Do not close this tab.</p>
        </div>
      </div>
    );
  }

  // ── Input Form ─────────────────────────────────────────────────────────
  return (
    <div className="payment-page">
      <header className="pricing-nav">
        <div className="brand" onClick={goToDashboard} style={{ cursor: 'pointer' }}>OpsMind AI</div>
        <div className="nav-actions">
          <button className="ghost-btn" onClick={goToPricing}>← Back to Plans</button>
        </div>
      </header>

      <div className="payment-layout">

        {/* Left: Order Summary */}
        <aside className="order-summary">
          <div className="order-summary-inner">
            <span className="secure-badge">🔒 SECURE CHECKOUT · RAZORPAY</span>
            <div className="order-plan-badge">{planName}</div>
            <div className="order-price-row">
              <span className="order-price">₹{priceINR}</span>
              <span className="order-period">/{billing === 'yearly' ? 'mo · billed annually' : 'month'}</span>
            </div>
            {billing === 'yearly' && <p className="order-saving">🎉 You save 20% with annual billing</p>}
            <div className="features-divider" />
            <ul className="order-features">
              <li><span>✓</span> Unlimited SOP document uploads</li>
              <li><span>✓</span> Full-access Advanced AI Copilot</li>
              <li><span>✓</span> Priority support</li>
              <li><span>✓</span> Advanced team features</li>
            </ul>
            <div className="features-divider" />
            <div className="trust-badges">
              <div className="badge-item"><span className="badge-icon">🛡️</span><span className="badge-txt">256-bit SSL Encrypted</span></div>
              <div className="badge-item"><span className="badge-icon">💳</span><span className="badge-txt">PCI-DSS Compliant · Powered by Razorpay</span></div>
            </div>
          </div>
        </aside>

        {/* Right: Payment Form */}
        <main className="payment-form-wrap">
          <h1 className="payment-title">Complete your purchase</h1>
          <p className="payment-subtitle">All payments are securely processed by Razorpay.</p>

          {/* Billing Email (always visible) */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label className="form-label">Billing Email *</label>
            <input
              className={`form-input ${errors.email ? 'form-input--error' : ''}`}
              type="email"
              placeholder="billing@company.com"
              value={form.email}
              onChange={(e) => { setForm(f => ({ ...f, email: e.target.value })); setErrors(er => ({ ...er, email: '' })); }}
            />
            {errors.email && <p className="form-error">{errors.email}</p>}
          </div>

          {/* Payment Method Tabs */}
          <div className="payment-tabs-grid">
            {['card', 'upi', 'netbanking', 'wallets', 'paypal', 'express'].map(m => (
              <button
                key={m}
                type="button"
                className={`tab-btn ${form.paymentMethod === m ? 'tab-btn--active' : ''}`}
                onClick={() => setForm(f => ({ ...f, paymentMethod: m }))}
              >
                {{ card: 'Card', upi: 'UPI', netbanking: 'Net Bank', wallets: 'Wallets', paypal: 'PayPal', express: 'Pay Apps' }[m]}
              </button>
            ))}
          </div>

          {/* Card */}
          {form.paymentMethod === 'card' && (
            <div className="tab-pane">
              <p className="tab-desc" style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>
                Razorpay's secure popup will collect your card details — we never store card numbers.
              </p>
              <button className="pay-submit-btn" onClick={() => launchRazorpay({ method: 'card' })}>
                ⚡ Pay ₹{priceINR} with Card
              </button>
            </div>
          )}

          {/* UPI */}
          {form.paymentMethod === 'upi' && (
            <div className="tab-pane">
              <label className="form-label">Tap an app to launch Razorpay UPI checkout</label>
              <div className="upi-apps-grid">
                {upiApps.map(app => (
                  <button
                    key={app.id}
                    type="button"
                    className="upi-app-btn"
                    onClick={() => launchRazorpay({ method: 'upi' })}
                  >
                    <span className="upi-app-icon">{app.icon}</span>
                    <span className="upi-app-name">{app.name}</span>
                  </button>
                ))}
              </div>
              <div className="divider-text">OR PAY WITH ANY UPI ID</div>
              <button className="pay-submit-btn" onClick={() => launchRazorpay({ method: 'upi' })}>
                ⚡ Open UPI Checkout
              </button>
            </div>
          )}

          {/* Net Banking */}
          {form.paymentMethod === 'netbanking' && (
            <div className="tab-pane">
              <div className="form-group">
                <label className="form-label">Select Bank</label>
                <select
                  className={`form-input ${errors.selectedBank ? 'form-input--error' : ''}`}
                  value={form.selectedBank}
                  onChange={e => setForm(f => ({ ...f, selectedBank: e.target.value }))}
                  style={{ background: '#0a143c', color: '#fff' }}
                >
                  <option value="">-- Choose your Bank --</option>
                  {popularBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <button className="pay-submit-btn" onClick={() => launchRazorpay({ method: 'netbanking', bank: form.selectedBank })}>
                ⚡ Proceed to Net Banking
              </button>
            </div>
          )}

          {/* Wallets */}
          {form.paymentMethod === 'wallets' && (
            <div className="tab-pane">
              <label className="form-label">Select Wallet</label>
              <div className="wallet-grid">
                {walletOptions.map(w => (
                  <label key={w.id} className={`wallet-label ${form.selectedWallet === w.id ? 'wallet-label--active' : ''}`}>
                    <input
                      type="radio"
                      name="selectedWallet"
                      value={w.id}
                      checked={form.selectedWallet === w.id}
                      onChange={e => setForm(f => ({ ...f, selectedWallet: e.target.value }))}
                      style={{ display: 'none' }}
                    />
                    <span>{w.name}</span>
                  </label>
                ))}
              </div>
              <button className="pay-submit-btn" onClick={() => launchRazorpay({ method: 'wallet', wallet: form.selectedWallet })}>
                ⚡ Pay via Wallet
              </button>
            </div>
          )}

          {/* PayPal */}
          {form.paymentMethod === 'paypal' && (
            <div className="tab-pane" style={{ textAlign: 'center' }}>
              <p className="tab-desc" style={{ color: '#94a3b8', fontSize: '14px' }}>
                Razorpay will handle the PayPal redirect securely.
              </p>
              <button className="paypal-btn" onClick={() => launchRazorpay()}>
                <span>Pay with</span> <strong style={{ color: '#003087' }}>Pay</strong><strong style={{ color: '#0079C1' }}>Pal</strong>
              </button>
            </div>
          )}

          {/* Express / App Pay */}
          {form.paymentMethod === 'express' && (
            <div className="tab-pane" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button className="express-pay-btn apple-pay" onClick={() => launchRazorpay()}>
                 Pay
              </button>
              <button className="express-pay-btn gpay" onClick={() => launchRazorpay()}>
                Google Pay
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
