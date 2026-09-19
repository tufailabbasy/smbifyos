import { useEffect, useMemo, useRef, useState } from "react";

type EmailComposerProps = {
  label: string; description?: string; textValue: string; htmlValue: string;
  onTextChange: (value: string) => void; onHtmlChange: (value: string) => void;
  textRows?: number; htmlRows?: number; tokenHint?: string; previewTitle?: string;
};

function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function plainTextToFragment(value: string): string {
  return value.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`).join("") || "<p><br></p>";
}
function bodyFragment(value: string): string {
  if (!value.trim()) return "";
  const normalized = value.replace(/\\n/g, "<br>");
  if (!/<(?:html|body)[\s>]/i.test(normalized)) return normalized;
  try { return new DOMParser().parseFromString(normalized, "text/html").body.innerHTML; } catch { return normalized; }
}
function emailDocument(fragment: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;padding:24px"><div style="max-width:680px;margin:0 auto;padding:28px;background:#fff;color:#0f172a;font:15px/1.65 Arial,sans-serif;border:1px solid #e2e8f0;border-radius:12px">${fragment}</div></body></html>`;
}

export function EmailComposer({ label, description, textValue, htmlValue, onTextChange, onHtmlChange, tokenHint, previewTitle }: EmailComposerProps) {
  const [preview, setPreview] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValue = useRef("");
  const editorHtml = useMemo(() => bodyFragment(htmlValue) || plainTextToFragment(textValue), [htmlValue, textValue]);
  const tokens = useMemo(() => Array.from(new Set((tokenHint || "").match(/\{\{[^}]+\}\}/g) || [])), [tokenHint]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor || lastValue.current === editorHtml) return;
    editor.innerHTML = editorHtml;
    lastValue.current = editorHtml;
  }, [editorHtml, preview]);

  function syncEditor() {
    const editor = editorRef.current; if (!editor) return;
    const html = editor.innerHTML; const text = editor.innerText.replace(/\n{3,}/g, "\n\n").trim();
    lastValue.current = html; onHtmlChange(html); onTextChange(text);
  }
  function command(name: string, value?: string) {
    editorRef.current?.focus(); document.execCommand(name, false, value); syncEditor();
  }
  function insertToken(token: string) { editorRef.current?.focus(); document.execCommand("insertText", false, token); syncEditor(); }

  const tools = [
    { label: "B", title: "Bold", command: "bold", className: "font-bold" },
    { label: "I", title: "Italic", command: "italic", className: "italic" },
    { label: "U", title: "Underline", command: "underline", className: "underline" },
    { label: "H2", title: "Heading", command: "formatBlock", value: "h2", className: "font-bold" },
    { label: "• List", title: "Bullet list", command: "insertUnorderedList", className: "" },
    { label: "1. List", title: "Numbered list", command: "insertOrderedList", className: "" },
  ];

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-semibold text-slate-900">{label}</p>{description && <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>}</div>
      <div className="flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5"><button type="button" onClick={() => setPreview(false)} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${!preview ? "bg-slate-900 text-white" : "text-slate-500"}`}>Compose</button><button type="button" onClick={() => setPreview(true)} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold ${preview ? "bg-slate-900 text-white" : "text-slate-500"}`}>Preview</button></div>
    </div>
    {!preview ? <>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-3 py-2">{tools.map((tool) => <button key={tool.title} type="button" title={tool.title} onMouseDown={(event) => event.preventDefault()} onClick={() => command(tool.command, tool.value)} className={`min-w-8 rounded-md border border-transparent px-2 py-1.5 text-[11px] text-slate-600 hover:border-slate-200 hover:bg-slate-50 ${tool.className}`}>{tool.label}</button>)}<span className="mx-1 h-5 w-px bg-slate-200" /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command("removeFormat")} className="rounded-md px-2 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50">Clear format</button></div>
      <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={syncEditor} className="min-h-[220px] px-4 py-4 text-[13px] leading-6 text-slate-800 outline-none [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:ml-5 [&_ul]:list-disc" />
      {tokens.length > 0 && <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/50 px-3 py-2"><span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Insert field</span>{tokens.map((token) => <button key={token} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertToken(token)} className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-indigo-600 hover:border-indigo-300">{token}</button>)}</div>}
    </> : <iframe title={previewTitle || `${label} preview`} sandbox="" srcDoc={emailDocument(editorHtml)} className="h-80 w-full bg-slate-50" />}
  </div>;
}