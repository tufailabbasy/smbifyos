import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// Global fetch interceptor to inject JWT token and handle 401 Unauthorized redirects
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const token = localStorage.getItem("smbify_lead_auth_token");
  let modifiedInit = init || {};

  const destination = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
  const apiOrigin = new URL(import.meta.env.VITE_API_BASE_URL || window.location.origin, window.location.origin).origin;
  if (token && destination.origin === apiOrigin && destination.pathname.startsWith("/api/")) {
    const headers = modifiedInit.headers || {};
    if (headers instanceof Headers) {
      headers.set("Authorization", `Bearer ${token}`);
      modifiedInit.headers = headers;
    } else if (Array.isArray(headers)) {
      headers.push(["Authorization", `Bearer ${token}`]);
      modifiedInit.headers = headers;
    } else {
      modifiedInit.headers = {
        ...headers,
        "Authorization": `Bearer ${token}`,
      } as Record<string, string>;
    }
  }

  try {
    const response = await originalFetch(input, modifiedInit);
    if (response.status === 401 && destination.origin === apiOrigin && destination.pathname.startsWith("/api/")) {
      localStorage.removeItem("smbify_lead_auth_token");
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/signup")) {
        window.location.href = "/login";
      }
    }
    return response;
  } catch (error) {
    console.error("Fetch network error:", error);
    throw error;
  }
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
