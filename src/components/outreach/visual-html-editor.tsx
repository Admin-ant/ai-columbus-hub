import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { sanitizeMailHtml } from "@/lib/skin-sanitize";

export type VisualHtmlEditorHandle = { insertText: (text: string) => void };

/**
 * Edit the text of an HTML mail template in place. Layout, styling and images
 * stay locked; only text can be changed. The iframe runs no scripts.
 */
export const VisualHtmlEditor = forwardRef<
  VisualHtmlEditorHandle,
  { html: string; onChange: (html: string) => void; height?: number }
>(function VisualHtmlEditor({ html, onChange, height = 560 }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Load once; later edits come from the iframe itself, so don't reload on every keystroke.
  const [initial] = useState(() => sanitizeMailHtml(html));

  function serialize() {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
    clone.querySelector("#__ve_style")?.remove();
    onChange(`<!DOCTYPE html>\n${clone.outerHTML}`);
  }

  function setup() {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.setAttribute("contenteditable", "true");
    // Lock images and buttons/links so the logo and layout can't be removed by accident.
    doc.querySelectorAll("img, hr").forEach((el) => el.setAttribute("contenteditable", "false"));
    const st = doc.createElement("style");
    st.id = "__ve_style";
    st.textContent =
      "[contenteditable=true] *:hover{outline:1px dashed rgba(120,120,120,.5)} body:focus{outline:none}";
    doc.head.appendChild(st);
    doc.body.addEventListener("input", serialize);
    doc.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) e.preventDefault();
    });
  }

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      const doc = frame.current?.contentDocument;
      if (!doc) return;
      doc.body.focus();
      doc.execCommand("insertText", false, text);
      serialize();
    },
  }));

  return (
    <div className="overflow-hidden rounded-md border border-input bg-muted">
      <iframe
        ref={frame}
        title="Sjabloon visueel bewerken"
        sandbox="allow-same-origin"
        srcDoc={initial}
        onLoad={setup}
        className="w-full bg-background"
        style={{ height }}
      />
    </div>
  );
});
