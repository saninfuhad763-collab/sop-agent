import { useState, useCallback, useEffect } from "react";
import App from "./App";
import Login from "./Login";
import Register from "./Register";
import Home from "./Home";
import Pricing from "./Pricing";
import Payment from "./Payment";
import Billing from "./Billing";

const API = "http://localhost:5000";

function getInitialPage(token) {
  const saved = sessionStorage.getItem("currentPage");
  if (saved && token) return saved;
  return token ? "dashboard" : "home";
}

export default function Root() {
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

  const handleAuthSuccess = (newToken, newPlan, newEmail) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("userPlan", newPlan || "free");
    if (newEmail) localStorage.setItem("userEmail", newEmail);
    setToken(newToken);
    setUserPlan(newPlan || "free");
    setPage("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userPlan");
    localStorage.removeItem("userEmail");
    setToken(null);
    setUserPlan("free");
    setPage("home");
  };

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
  }, [token, page]);

  if (page === "home") {
    return (
      <Home 
        goToLogin={() => setPage("login")} 
        goToRegister={() => setPage("register")} 
        goToDashboard={() => setPage("dashboard")} 
        hasToken={!!token} 
      />
    );
  }

  if (page === "login") {
    if (token) {
      setPage("dashboard");
      return null;
    }
    return (
      <Login 
        goToRegister={() => setPage("register")} 
        goToHome={() => setPage("home")} 
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (page === "register") {
    if (token) {
      setPage("dashboard");
      return null;
    }
    return (
      <Register 
        goToLogin={() => setPage("login")} 
        goToHome={() => setPage("home")} 
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (!token) {
    return (
      <Login 
        goToRegister={() => setPage("register")} 
        goToHome={() => setPage("home")} 
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (page === "pricing") {
    return (
      <Pricing
        goToDashboard={() => setPage("dashboard")}
        goToHome={() => setPage("home")}
        userPlan={userPlan}
        setUserPlan={setUserPlan}
        onUpgrade={(plan, billing) => {
          setSelectedPlan(plan);
          setSelectedBilling(billing);
          setPage("payment");
        }}
      />
    );
  }

  if (page === "payment") {
    return (
      <Payment
        plan={selectedPlan}
        billing={selectedBilling}
        goToPricing={() => setPage("pricing")}
        goToDashboard={() => {
          // Re-fetch plan on redirecting to dashboard
          fetch(`${API}/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          })
          .then(res => res.json())
          .then(data => {
            if (data.plan) {
              localStorage.setItem("userPlan", data.plan);
              setUserPlan(data.plan);
            }
          })
          .catch(console.error);
          setPage("dashboard");
        }}
      />
    );
  }

  if (page === "billing") {
    return (
      <Billing
        goToDashboard={() => setPage("dashboard")}
        goToPricing={() => setPage("pricing")}
        userPlan={userPlan}
        setUserPlan={setUserPlan}
        token={token}
      />
    );
  }

  return (
    <App 
      goToHome={() => setPage("home")} 
      goToPricing={() => setPage("pricing")} 
      goToBilling={() => setPage("billing")}
      userPlan={userPlan}
      handleLogout={handleLogout}
    />
  );
}