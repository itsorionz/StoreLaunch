export function OrderAdditionalInfo({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-sm">
      <p className="font-semibold">Additional Info:</p>
      <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-muted">{text}</p>
    </div>
  );
}
