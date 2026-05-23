import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Billing({ goToDashboard, goToPricing }) {
  const userPlan = localStorage.getItem('userPlan') || 'free';
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showUpdateCardModal, setShowUpdateCardModal] = useState(false);
  const [billingInfo, setBillingInfo] = useState({
    cardBrand: 'Visa',
    last4: '4242',
    expiry: '12/28',
    email: localStorage.getItem('userEmail') || 'billing@company.com'
  });
  
  const [history, setHistory] = useState([
    { id: 'INV-2026-004', date: '2026-05-15', amount: userPlan === 'enterprise' ? 99 : userPlan === 'pro' ? 29 : 0, status: 'Paid' },
    { id: 'INV-2026-003', date: '2026-04-15', amount: userPlan === 'enterprise' ? 99 : userPlan === 'pro' ? 29 : 0, status: 'Paid' },
    { id: 'INV-2026-002', date: '2026-03-15', amount: userPlan === 'enterprise' ? 99 : userPlan === 'pro' ? 29 : 0, status: 'Paid' },
  ]);

  // Clean empty invoices if free plan
  const activeHistory = userPlan === 'free' ? [] : history;

  const handleCancelSubscription = () => {
    localStorage.setItem('userPlan', 'free');
    setShowCancelModal(false);
    window.location.reload();
  };

  const handleDownloadInvoice = (inv) => {
    const content = `
=========================================
          OPSMIND AI INVOICE
=========================================
Invoice ID:  ${inv.id}
Date:        ${inv.date}
Amount:      $${inv.amount}.00 USD
Status:      ${inv.status}
Billed To:   ${billingInfo.email}
Payment:     ${billingInfo.cardBrand} **** **** **** ${billingInfo.last4}
=========================================
Thank you for supporting OpsMind AI!
    `;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inv.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="billing-page">
      {/* ── Nav ── */}
      <header className="pricing-nav">
        <div className="brand" onClick={goToDashboard} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          OpsMind AI
          {(userPlan === 'pro' || userPlan === 'enterprise') && <span className="pro-badge">PRO</span>}
        </div>
        <div className="nav-actions">
          <button className="ghost-btn" onClick={goToDashboard}>← Dashboard</button>
        </div>
      </header>

      <div className="billing-container">
        {/* ── Header ── */}
        <motion.div 
          className="billing-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="billing-title">Billing & Subscription</h1>
          <p className="billing-subtitle">Manage your plan, payment methods, and review transaction history.</p>
        </motion.div>

        {/* ── Main Layout Grid ── */}
        <div className="billing-grid">
          
          {/* Left Column: Sub Info & Payment Method */}
          <motion.div 
            className="billing-left"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            
            {/* Active Plan Card */}
            <div className="glass-card plan-overview-card">
              <div className="plan-details">
                <span className="card-eyebrow">Active Subscription</span>
                <div className="plan-name-row">
                  <h2 className="plan-display-name">{userPlan.toUpperCase()} PLAN</h2>
                  {userPlan !== 'free' && <span className="active-pill">Active</span>}
                </div>
                <p className="plan-desc">
                  {userPlan === 'free' && 'You are currently on the limited free tier.'}
                  {userPlan === 'pro' && 'Enjoy unlimited SOP uploads and full AI Copilot benefits.'}
                  {userPlan === 'enterprise' && 'Tailored for scale with high-security & custom integrations.'}
                </p>
                {userPlan !== 'free' && (
                  <p className="renewal-info">Next renewal on <strong>June 15, 2026</strong> for <strong>${userPlan === 'pro' ? 29 : 99}/month</strong>.</p>
                )}
              </div>
              
              <div className="plan-card-actions">
                <button className="primary-btn flex-btn" onClick={goToPricing}>
                  ⚡ {userPlan === 'free' ? 'Upgrade Now' : 'Change Plan'}
                </button>
                {userPlan !== 'free' && (
                  <button className="danger-ghost-btn" onClick={() => setShowCancelModal(true)}>
                    Cancel Plan
                  </button>
                )}
              </div>
            </div>

            {/* Payment Method Card */}
            {userPlan !== 'free' && (
              <div className="glass-card payment-method-card">
                <span className="card-eyebrow">Payment Method</span>
                <div className="payment-card-row">
                  <div className="payment-icon-box">💳</div>
                  <div className="payment-card-details">
                    <p className="card-text">{billingInfo.cardBrand} ending in <strong>{billingInfo.last4}</strong></p>
                    <p className="card-subtext">Expires {billingInfo.expiry} · Billed to {billingInfo.email}</p>
                  </div>
                  <button className="ghost-btn update-method-btn" onClick={() => setShowUpdateCardModal(true)}>
                    Update
                  </button>
                </div>
              </div>
            )}

            {/* Production Webhook Integration Tip */}
            <div className="glass-card integration-note-card">
              <div className="note-header">
                <span className="note-badge">Developer Reference</span>
              </div>
              <p className="note-text">
                This panel is powered by live customer sessions. In production, billing actions synchronize with 
                <strong> Stripe / Razorpay Webhooks</strong> via secure backend API signatures.
              </p>
            </div>
          </motion.div>

          {/* Right Column: Invoices & Payment History */}
          <motion.div 
            className="billing-right"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className="glass-card history-card">
              <span className="card-eyebrow">Invoice History</span>
              {activeHistory.length === 0 ? (
                <div className="empty-history">
                  <p className="empty-title">No invoices found</p>
                  <p className="empty-desc">Once you subscribe to a paid plan, your invoices will show up here.</p>
                </div>
              ) : (
                <div className="invoice-list">
                  {activeHistory.map((inv) => (
                    <div className="invoice-row" key={inv.id}>
                      <div className="inv-meta">
                        <span className="inv-id">{inv.id}</span>
                        <span className="inv-date">{inv.date}</span>
                      </div>
                      <div className="inv-actions">
                        <span className="inv-amount">${inv.amount}.00</span>
                        <span className="inv-status-badge">Paid</span>
                        <button className="download-icon-btn" onClick={() => handleDownloadInvoice(inv)} title="Download Invoice">
                          📥
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

        </div>
      </div>

      {/* ── Cancel Plan Modal ── */}
      {showCancelModal && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>⚠️</div>
            <h3 className="modal-title">Cancel Subscription?</h3>
            <p className="modal-desc">
              Your premium features will be disabled immediately. You'll lose access to unlimited document uploads and priority support. 
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowCancelModal(false)}>
                Keep My Plan
              </button>
              <button className="modal-confirm" style={{ background: '#ef4444' }} onClick={handleCancelSubscription}>
                Yes, Cancel Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Update Card Modal ── */}
      {showUpdateCardModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateCardModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>🔒</div>
            <h3 className="modal-title">Update Payment Details</h3>
            <p className="modal-desc">Enter your new card details below. Transactions are secured and encrypted.</p>
            
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label">Card Number</label>
              <input className="form-input" type="text" placeholder="xxxx xxxx xxxx 4242" defaultValue="**** **** **** 4242" disabled />
            </div>

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button className="modal-cancel" onClick={() => setShowUpdateCardModal(false)}>
                Cancel
              </button>
              <button className="modal-confirm" style={{ background: '#3b82f6' }} onClick={() => setShowUpdateCardModal(false)}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
