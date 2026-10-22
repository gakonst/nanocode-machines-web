import "nanocode-ts/react/zyzz.css";
import { styles } from "nanocode-ts/react/site";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./fonts.ts";

document.body.className = styles.body().className;
createRoot(document.getElementById("root")!).render(<App />);
