import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Register({ goToLogin, goToHome, onAuthSuccess }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const register = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Registration failed");
        return;
      }

      if (onAuthSuccess) {
        onAuthSuccess(data.token, data.plan, form.email);
      } else {
        localStorage.setItem("token", data.token);
        window.location.reload();
      }
    } catch (err) {
      alert("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-left">
        <div className="overlay"></div>

        <div className="auth-brand-content">
          <p className="mini-title">OpsMind AI</p>

          <h1>
            Build Smarter
            <span> Operational Workflows</span>
          </h1>

          <p>
            Create your account and streamline SOP management with
            AI-powered automation, instant search, and operational insights.
          </p>
        </div>
      </div>

      <div className="auth-right">
        <form className="auth-card" onSubmit={register}>
          <div>
            {goToHome && (
              <div 
                onClick={goToHome} 
                className="auth-back-link"
              >
                &larr; Back to Home
              </div>
            )}
            <h2>Create Account</h2>

            <p className="auth-subtitle">
              Join OpsMind AI and manage SOPs efficiently.
            </p>
          </div>

          <div className="input-group">
            <label>Full Name</label>

            <input
              type="text"
              placeholder="Enter your name"
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
              required
            />
          </div>

          <div className="input-group">
            <label>Email Address</label>

            <input
              type="email"
              placeholder="Enter your email"
              value={form.email}
              onChange={(e) =>
                setForm({
                  ...form,
                  email: e.target.value,
                })
              }
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>

            <input
              type="password"
              placeholder="Create password"
              value={form.password}
              onChange={(e) =>
                setForm({
                  ...form,
                  password: e.target.value,
                })
              }
              required
            />
          </div>

          <button className="auth-btn" type="submit">
            {loading ? "Creating Account..." : "Register"}
          </button>

          <p className="switch-auth">
            Already have an account?
            <span onClick={goToLogin}> Login</span>
          </p>
        </form>
      </div>
    </div>
  );
}