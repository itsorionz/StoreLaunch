"use client";

import { useState } from "react";
import { useToast } from "@frontend/components/ui/toast";

export function ReferralShare({
  code,
  link,
  reward,
}: {
  code: string;
  link: string;
  reward: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  async function copy(value: string, kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast(kind === "link" ? "Referral link copied" : "Referral code copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast("Select and copy your referral link or code.");
    }
  }
  const text = "Join me and shop with my referral link: " + link;
  const shares = [
    {
      label: "WhatsApp",
      symbol: "↗",
      color: "#22a824",
      url: "https://wa.me/?text=" + encodeURIComponent(text),
    },
    {
      label: "Facebook",
      symbol: "f",
      color: "#1877f2",
      url: "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(link),
    },
    {
      label: "LinkedIn",
      symbol: "in",
      color: "#0a66c2",
      url: "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(link),
    },
    {
      label: "Email",
      symbol: "✉",
      color: "#209cee",
      url:
        "mailto:?subject=" +
        encodeURIComponent("An invitation to shop") +
        "&body=" +
        encodeURIComponent(text),
    },
    {
      label: "X",
      symbol: "𝕏",
      color: "#111111",
      url: "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text),
    },
  ];
  return (
    <section className="card px-4 py-9 text-center sm:px-8">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <svg
          width="25"
          height="25"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13" />
          <path d="M12 8H8.5A3 3 0 1 1 12 5v3Zm0 0h3.5A3 3 0 1 0 12 5v3Z" />
        </svg>
      </div>
      <h2 className="text-lg font-bold">Earn {reward} for every referral</h2>
      <p className="mt-2 text-sm text-muted">
        Share your referral link or code. Your code never expires.
      </p>
      <div className="mx-auto mt-5 flex max-w-lg flex-col gap-2 sm:flex-row sm:gap-0">
        <input
          aria-label="Your referral link"
          readOnly
          value={link}
          onFocus={(event) => event.target.select()}
          className="input min-w-0 sm:rounded-r-none"
        />
        <button
          type="button"
          className="btn-primary shrink-0 sm:rounded-l-none"
          onClick={() => void copy(link, "link")}
        >
          {copied === "link" ? "Copied!" : "Copy link"}
        </button>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {shares.map((share) => (
          <a
            key={share.label}
            href={share.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={"Share via " + share.label}
            title={share.label}
            style={{ backgroundColor: share.color }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            {share.label === "WhatsApp" ? (
              <svg
                width="23"
                height="23"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M20 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-4.3A8 8 0 1 1 20 11.5Z" />
                <path d="m9 7-1 2c0 3 3 6 6 6l2-1-2-2-1 1c-1.5-.5-2.5-1.5-3-3l1-1-2-2Z" />
              </svg>
            ) : (
              share.symbol
            )}
          </a>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
        <span>Or share your referral code:</span>
        <button
          type="button"
          onClick={() => void copy(code, "code")}
          className="inline-flex items-center gap-2 rounded px-1 py-1 font-mono font-semibold tracking-wide text-primary"
          aria-label={"Copy referral code " + code}
        >
          {code}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V4H4v12h4" />
          </svg>
          {copied === "code" && <span className="font-sans text-xs">Copied!</span>}
        </button>
      </div>
    </section>
  );
}

export function ReferralSteps({ reward }: { reward: string }) {
  return (
    <section className="card px-5 py-9 sm:px-10">
      <h2 className="text-center text-lg font-bold">How the referral program works</h2>
      <div
        className="mx-auto my-7 flex max-w-lg items-center justify-center gap-3 sm:gap-8"
        aria-hidden="true"
      >
        <PhoneCard title="Your invitation" detail="Share your referral" icon="↗" />
        <svg className="w-12 shrink-0 text-primary sm:w-20" viewBox="0 0 90 35" fill="none">
          <path
            d="M2 20C26 2 53 2 80 19"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 5"
          />
          <path d="m73 10 9 10-14 2" stroke="currentColor" strokeWidth="2" />
        </svg>
        <PhoneCard title="Friend's first order" detail="Delivered & paid" icon="✓" />
      </div>
      <div className="mx-auto grid max-w-3xl gap-7 text-center sm:grid-cols-3 sm:gap-10">
        {[
          { title: "Invite", icon: "↗", detail: "Share your link or code with friends." },
          {
            title: "Sign up & shop",
            icon: "＋",
            detail: "Your friend creates a new account and completes their first purchase.",
          },
          {
            title: "Earn",
            icon: "✓",
            detail: reward + " is added to your wallet after the order is paid and delivered.",
          },
        ].map((step, index) => (
          <div key={step.title}>
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
              {step.icon}
            </span>
            <h3 className="mt-3 text-sm font-semibold">
              {index + 1}. {step.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{step.detail}</p>
          </div>
        ))}
      </div>
      <p className="mt-7 text-center text-xs leading-relaxed text-muted">
        One reward per new customer. Existing accounts, self-referrals, cancelled and unpaid orders
        do not qualify. Rewards are store wallet credit.
      </p>
    </section>
  );
}

function PhoneCard({ title, detail, icon }: { title: string; detail: string; icon: string }) {
  return (
    <div className="w-36 rounded-[1.4rem] border-2 border-border bg-background p-3 pb-5 shadow-sm sm:w-44">
      <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-border" />
      <div className="flex h-14 items-center justify-center rounded-lg bg-primary/10 text-3xl text-primary">
        {icon}
      </div>
      <p className="mt-4 text-center text-xs font-semibold">{title}</p>
      <p className="mt-1 text-center text-[10px] text-muted">{detail}</p>
      <div className="mx-auto mt-5 h-1 w-8 rounded-full bg-border" />
    </div>
  );
}
