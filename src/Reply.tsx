import type { ThemedToken } from "@pierre/highlights";
import { useEffect, useState } from "react";
import { fences } from "./fences.ts";

export function Code(props: { code: string; language: string }) {
  const [result, setResult] = useState<{ code: string; language: string; tokens: ThemedToken[][] }>();
  useEffect(() => {
    let active = true;
    void import("./highlight.ts").then(({ highlight }) => {
      if (active) setResult({ code: props.code, language: props.language, tokens: highlight(props.code, props.language).tokens });
    }).catch(() => {});
    return () => { active = false; };
  }, [props.code, props.language]);
  return <pre className="code"><code>{result?.code === props.code && result.language === props.language ? result.tokens.map((line, row) => <span key={row}>{row > 0 && "\n"}{line.map((token, column) => <span key={column} style={{ color: token.htmlStyle?.color ?? token.color, fontStyle: token.htmlStyle?.["font-style"] === "italic" || token.fontStyle && token.fontStyle & 1 ? "italic" : undefined }}>{token.content}</span>)}</span>) : props.code}</code></pre>;
}

const image = /!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)/g;

function Text(props: { text: string }) {
  const parts: (string | { alt: string; src: string })[] = [];
  let offset = 0;
  for (const match of props.text.matchAll(image)) {
    if (match.index > offset) parts.push(props.text.slice(offset, match.index));
    parts.push({ alt: match[1] ?? "", src: match[2]! });
    offset = match.index + match[0].length;
  }
  if (offset < props.text.length) parts.push(props.text.slice(offset));
  return parts.map((part, index) => typeof part === "string" ? <span key={index}>{part}</span> : <img alt={part.alt} className="image" key={index} loading="lazy" src={part.src} />);
}

export function Reply(props: { text: string }) {
  return fences(props.text).map((part, index) => part.kind === "code" ? <Code code={part.text} key={index} language={part.language} /> : <Text key={index} text={part.text} />);
}
