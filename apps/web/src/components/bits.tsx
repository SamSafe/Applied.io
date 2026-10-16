import { Check, Copy } from "lucide-react";
import { type CSSProperties, useState } from "react";
import type { ChipSpec } from "../format";

export function StageChip({ chip, large = false }: { chip: ChipSpec; large?: boolean }) {
  return (
    <span
      className={`chip${large ? " chip-large" : ""}`}
      style={{ "--chip-color": chip.color } as CSSProperties}
    >
      {chip.label}
    </span>
  );
}

/** The wordmark's mark: a tiny tracking bar (applied, a step reached, silence since). */
export function Mark() {
  return (
    <svg viewBox="0 0 26 14" fill="none" aria-hidden="true">
      <circle cx="4" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.6 7h5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="15" cy="7" r="3" fill="currentColor" />
      <path d="M19 7h1.6M23 7h1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-small btn-quiet"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="banner banner-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          className="btn btn-small"
          onClick={onRetry}
          style={{ marginLeft: "auto" }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
