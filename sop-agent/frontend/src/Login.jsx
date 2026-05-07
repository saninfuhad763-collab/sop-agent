import { useState } from "react";

const API = "http://localhost:5000";

export default function Login({ goToRegister }) {
  const [form, setForm] = useState({ email: "", password: "" });

  const login = async (e) => {
    e.preventDefault();

    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error);
      return;
    }

    localStorage.setItem("token", data.token);
    window.location.reload();
  };

  return (
    <div className="auth-page">
      <form onSubmit={login}>
        <h2>Login</h2>
        <input placeholder="Email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="password" placeholder="Password" onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button>Login</button>

        <p onClick={goToRegister}>Create account</p>
      </form>
    </div>
  );
}