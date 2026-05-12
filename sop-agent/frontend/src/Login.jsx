import { useState } from "react";

const API = "http://localhost:5000";

export default function Login({ goToRegister }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const login = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Login failed");
        return;
      }

      localStorage.setItem("token", data.token);

      window.location.reload();
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
            AI Powered
            <span> SOP Intelligence</span>
          </h1>

          <p>
            Access operational knowledge instantly, upload SOPs securely,
            and streamline business workflows with AI-driven automation.
          </p>
        </div>
      </div>

      <div className="auth-right">
        <form className="auth-card" onSubmit={login}>
          <div>
            <h2>Welcome Back</h2>

            <p className="auth-subtitle">
              Login to continue using OpsMind AI.
            </p>
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
              placeholder="Enter your password"
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
            {loading ? "Signing In..." : "Login"}
          </button>

          <p className="switch-auth">
            Don’t have an account?
            <span onClick={goToRegister}> Register</span>
          </p>
        </form>
      </div>
    </div>
  );
}