import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

function getInitialPage(token) {
  const saved = sessionStorage.getItem("currentPage");
  if (saved && token) return saved;
  return token ? "dashboard" : "home";
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [userPlan, setUserPlan] = useState(() => localStorage.getItem("userPlan") || "free");
  const [page, setPageRaw] = useState(() => getInitialPage(token));
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedBilling, setSelectedBilling] = useState('monthly');

  const setPage = useCallback((p) => {
    sessionStorage.setItem("currentPage", p);
    setPageRaw(p);
    window.scrollTo(0, 0);
  }, []);

  const handleAuthSuccess = useCallback((newToken, newPlan, newEmail) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("userPlan", newPlan || "free");
    if (newEmail) localStorage.setItem("userEmail", newEmail);
    setToken(newToken);
    setUserPlan(newPlan || "free");
    setPage("dashboard");
  }, [setPage]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("userPlan");
    localStorage.removeItem("userEmail");
    sessionStorage.removeItem("chat_messages");
    setToken(null);
    setUserPlan("free");
    setPage("home");
  }, [setPage]);

  // Keep plan in sync with the backend dynamically on load and page changes
  useEffect(() => {
    if (!token) return;

    fetch(`${API}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    .then(res => {
      if (!res.ok) {
        if (res.status === 401 || res.status === 400) {
          handleLogout();
        }
        throw new Error("Failed to fetch profile");
      }
      return res.json();
    })
    .then(data => {
      if (data.plan) {
        localStorage.setItem("userPlan", data.plan);
        localStorage.setItem("userEmail", data.email);
        setUserPlan(data.plan);
      }
    })
    .catch(err => console.error("Profile sync error:", err));
  }, [token, page, handleLogout]);

  return (
    <AuthContext.Provider value={{
      token,
      setToken,
      userPlan,
      setUserPlan,
      page,
      setPage,
      selectedPlan,
      setSelectedPlan,
      selectedBilling,
      setSelectedBilling,
      handleAuthSuccess,
      handleLogout,
      API
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
