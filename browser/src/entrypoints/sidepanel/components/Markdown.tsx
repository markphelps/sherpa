import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "preact/hooks";

marked.setOptions({
  breaks: true,
  gfm: true,
});

interface Props {
  text: string;
  streaming?: boolean;
  class?: string;
}

export function Markdown({ text, streaming, class: className }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false });
    return DOMPurify.sanitize(typeof raw === "string" ? raw : String(raw));
  }, [text]);

  return (
    <div
      class={`markdown-body ${className ?? ""}`}
      aria-live={streaming ? "polite" : undefined}
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {streaming && <span class="streaming-cursor" />}
    </div>
  );
}
