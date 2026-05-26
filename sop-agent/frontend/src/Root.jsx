import React from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import App from "./App";
import Login from "./Login";
import Register from "./Register";
import Home from "./Home";
import Pricing from "./Pricing";
import Payment from "./Payment";
import Billing from "./Billing";

function RootContent() {
  const {
    token,
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
  } = useAuth();

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

export default function Root() {
  return (
    <AuthProvider>
      <RootContent />
    </AuthProvider>
  );
}