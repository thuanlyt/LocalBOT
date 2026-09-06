import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const storedTheme = window.localStorage.getItem("localbot-theme");
if (storedTheme === "default" || storedTheme === "dark" || storedTheme === "light") {
  document.documentElement.dataset.theme = storedTheme;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
