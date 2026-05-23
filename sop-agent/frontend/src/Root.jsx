import { useState, useCallback } from "react";
import App from "./App";
import Login from "./Login";
import Register from "./Register";
import Home from "./Home";
import Pricing from "./Pricing";
import Payment from "./Payment";
import Billing from "./Billing";

function getInitialPage(token) {
  const saved = sessionStorage.getItem("currentPage");
  if (saved && token) return saved;
  return token ? "dashboard" : "home";
}

export default function Root() {
  const token = localStorage.getItem("token");
  const [page, setPageRaw] = useState(() => getInitialPage(token));
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedBilling, setSelectedBilling] = useState('monthly');

  const setPage = useCallback((p) => {
    sessionStorage.setItem("currentPage", p);
    setPageRaw(p);
  }, []);

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
    return <Login goToRegister={() => setPage("register")} goToHome={() => setPage("home")} goToDashboard={() => setPage("dashboard")} />;
  }

  if (page === "register") {
    if (token) {
      setPage("dashboard");
      return null;
    }
    return <Register goToLogin={() => setPage("login")} goToHome={() => setPage("home")} goToDashboard={() => setPage("dashboard")} />;
  }

  if (!token) {
    return <Login goToRegister={() => setPage("register")} goToHome={() => setPage("home")} goToDashboard={() => setPage("dashboard")} />;
  }

  if (page === "pricing") {
    return (
      <Pricing
        goToDashboard={() => setPage("dashboard")}
        goToHome={() => setPage("home")}
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
        goToDashboard={() => setPage("dashboard")}
      />
    );
  }

  if (page === "billing") {
    return (
      <Billing
        goToDashboard={() => setPage("dashboard")}
        goToPricing={() => setPage("pricing")}
      />
    );
  }

  return <App goToHome={() => setPage("home")} goToPricing={() => setPage("pricing")} goToBilling={() => setPage("billing")} />;
}