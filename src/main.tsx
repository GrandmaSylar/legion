import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { registerServiceWorker } from "./lib/pwa";
import "./styles/index.css";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
