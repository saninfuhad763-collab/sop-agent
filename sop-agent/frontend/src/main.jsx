import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Login from "./Login";
import Register from "./Register";

const token = localStorage.getItem("token");
const path = window.location.pathname;

let Page;

if (!token) {
  if (path === "/register") Page = Register;
  else Page = Login;
} else {
  Page = App;
}

ReactDOM.createRoot(document.getElementById("root")).render(<Page />);