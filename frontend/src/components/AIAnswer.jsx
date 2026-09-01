import React from "react";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-1" data-testid="ai-typing">
      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
    </span>
  );
}

function cleanLatex(text) {
  if (!text) return "";
  return text
    .replace(/\\\[|\\\]|\\\(|\\\)/g, "")
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\leq/g, "≤").replace(/\\geq/g, "≥").replace(/\\approx/g, "≈")
    .replace(/\\sqrt\s*\{([^}]*)\}/g, "√($1)")
    .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\left|\\right/g, "")
    .replace(/\\,|\\;|\\!/g, " ")
    .replace(/\\[a-zA-Z]+/g, "");
}

// Lightweight markdown -> HTML for AI answers (bold, headings, lists, code, hr, line breaks).
function renderMarkdown(text) {
  if (!text) return "";
  text = cleanLatex(text);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text.split("\n");
  let html = "";
  let inList = null; // 'ul' | 'ol'
  const closeList = () => { if (inList) { html += `</${inList}>`; inList = null; } };
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\$([^$]+)\$/g, "<code>$1</code>");

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,3}\s+/.test(line)) { closeList(); const t = line.replace(/^#{1,3}\s+/, ""); html += `<h3>${inline(t)}</h3>`; continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { closeList(); html += "<hr/>"; continue; }
    if (/^\s*[-*]\s+/.test(line)) { if (inList !== "ul") { closeList(); inList = "ul"; html += "<ul>"; } html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`; continue; }
    if (/^\s*\d+\.\s+/.test(line)) { if (inList !== "ol") { closeList(); inList = "ol"; html += "<ol>"; } html += `<li>${inline(line.replace(/^\s*\d+\.\s+/, ""))}</li>`; continue; }
    if (line.trim() === "") { closeList(); html += "<br/>"; continue; }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

export default function AIAnswer({ text, loading }) {
  if (loading && !text) return <TypingDots />;
  return (
    <div className="prose-ai text-[#1E2A4A] text-[15px]" data-testid="ai-answer"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
  );
}
