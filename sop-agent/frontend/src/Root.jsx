import { useState } from "react";
import App from "./App";
import Login from "./Login";
import Register from "./Register";

export default function Root() {
  const [page, setPage] = useState("login");
  const token = localStorage.getItem("token");

  if (!token) {
    if (page === "register") {
      return <Register goToLogin={() => setPage("login")} />;
    }
    return <Login goToRegister={() => setPage("register")} />;
  }

  return <App />;
}