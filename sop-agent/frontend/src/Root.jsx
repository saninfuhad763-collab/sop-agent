import { useState } from "react";
import App from "./App";
import Login from "./Login";
import Register from "./Register";
import Home from "./Home";
import Pricing from "./Pricing";

export default function Root() {
  const token = localStorage.getItem("token");
  const [page, setPage] = useState(token ? "dashboard" : "home");

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
    return <Pricing goToDashboard={() => setPage("dashboard")} goToHome={() => setPage("home")} />;
  }

  return <App goToHome={() => setPage("home")} goToPricing={() => setPage("pricing")} />;
}