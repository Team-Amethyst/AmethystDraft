import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "./index.css";
import "./styles/sonner.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* Toaster: top-right under 56px auth bar; offset tucks stack near the bell */}
    <Toaster
      className="dr-sonner"
      theme="dark"
      position="top-right"
      offset={{ top: 62, right: 14 }}
      gap={10}
      visibleToasts={4}
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast: "dr-toast",
        },
      }}
    />
  </StrictMode>,
);
