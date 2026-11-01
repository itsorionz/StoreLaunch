"use client";

import { useState } from "react";
import { useDict } from "@frontend/i18n/provider";

export function CopyTextButton({ text }: { text: string }) {
  const dict = useDict();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className="btn-outline btn-sm shrink-0">
      {copied ? dict.account.copied : dict.account.copyCode}
    </button>
  );
}
