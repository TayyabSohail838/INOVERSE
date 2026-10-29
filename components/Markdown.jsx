// Small Markdown renderer for the cofounder's answers.
// Handles headings, bold, italics, inline code, lists and dividers, and builds
// React elements directly (no innerHTML), so model output can't inject HTML.

// Bold, italics and code inside a line.
function inline(text, keyBase) {
  const out = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)(?<!\s)\3(?![A-Za-z0-9])|`([^`]+)`/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] !== undefined) out.push(<strong key={key}>{inline(m[2], key)}</strong>);
    else if (m[4] !== undefined) out.push(<em key={key}>{inline(m[4], key)}</em>);
    else out.push(<code key={key}>{m[5]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  // Drop any stray asterisks the model left unpaired
  return out.map((p) => (typeof p === "string" ? p.replace(/\*+/g, "") : p));
}

export default function Markdown({ text = "" }) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  let list = null; // { ordered, items: [] }

  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ...list });
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if (!line) {
      flushPara();
      flushList();
    } else if (/^([-*_])\1{2,}$/.test(line)) {
      flushPara();
      flushList();
      blocks.push({ type: "hr" });
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: m[2].replace(/#+$/, "").trim() });
    } else if ((m = line.match(/^[-*+•]\s+(.*)$/)) || (m = line.match(/^\d+[.)]\s+(.*)$/))) {
      flushPara();
      const ordered = /^\d/.test(line);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(m[1]);
    } else if (list && /^\s{2,}/.test(raw)) {
      // indented continuation of the previous list item
      list.items[list.items.length - 1] += " " + line;
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.type === "hr") return <hr key={i} />;
        if (b.type === "h") return <h4 key={i}>{inline(b.text, i)}</h4>;
        if (b.type === "p") return <p key={i}>{inline(b.text, i)}</p>;
        const Tag = b.ordered ? "ol" : "ul";
        return (
          <Tag key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, `${i}-${j}`)}</li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}

// Plain text for the voice: no Markdown symbols read aloud.
export function plainText(text = "") {
  return String(text)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+•]\s+/gm, "")
    .replace(/[*_`#]+/g, "")
    .trim();
}
