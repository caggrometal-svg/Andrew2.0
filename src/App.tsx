import React, { useState } from "react";
import EditorApp from "./editor/EditorApp";
import { AndrewChat } from "./components/chat/AndrewChat";
import "./editor/editor.css";
import "./components/layout/MainLayout.css";

export default function App(): JSX.Element {
  const [active, setActive] = useState<"editor" | "andrew">("andrew");

  return (
    <div className="andrew-shell">
      <main className="andrew-shell__content">
        <div className={active === "editor" ? "andrew-view" : "andrew-view andrew-view--hidden"} aria-hidden={active !== "editor"}>
          <EditorApp />
        </div>
        <div className={active === "andrew" ? "andrew-view" : "andrew-view andrew-view--hidden"} aria-hidden={active !== "andrew"}>
          <AndrewChat />
        </div>
      </main>
      <nav className="andrew-bottom-nav" aria-label="Navegación principal">
        <button type="button" className={active === "andrew" ? "andrew-nav-button is-active" : "andrew-nav-button"} onClick={() => setActive("andrew")} aria-current={active === "andrew" ? "page" : undefined}>
          <span aria-hidden="true">✦</span>
          <strong>Andrew</strong>
        </button>
        <button type="button" className={active === "editor" ? "andrew-nav-button is-active" : "andrew-nav-button"} onClick={() => setActive("editor")} aria-current={active === "editor" ? "page" : undefined}>
          <span aria-hidden="true">▣</span>
          <strong>Editor</strong>
        </button>
      </nav>
    </div>
  );
}
