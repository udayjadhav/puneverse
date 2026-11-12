import "./map/maplibreWorker";
import { registerPmtilesProtocol } from "./map/pmtiles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/ui/ErrorBoundary";
import "./index.css";

registerPmtilesProtocol();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element");
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
