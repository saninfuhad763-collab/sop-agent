import { useState } from "react";

const API = "http://localhost:5000";

export default function Register({ goToLogin }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const register = async (e) => {
    e.preventDefault();

    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error);
      return;
    }

    alert("Registered successfully");
    goToLogin();
  };

  return (
    <div className="auth-page">
      <form onSubmit={register}>
        <h2>Register</h2>
        <input placeholder="Name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="password" placeholder="Password" onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button>Register</button>

        <p onClick={goToLogin}>Back to Login</p>
      </form>
    </div>
  );
}