"use client";

import { useState } from "react";
import { receiveStockTransfer, type TransferActionResult } from "@backend/actions/transfers";

export function ReceiveTransferButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receive = async () => {
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("id", id);
    const result: TransferActionResult = await receiveStockTransfer(null, formData);
    if (result.ok) window.location.reload();
    else {
      setError(result.error ?? "Could not receive the transfer");
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void receive()}
        disabled={busy}
        className="btn btn-sm btn-primary"
      >
        {busy ? "Receiving…" : "Receive"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
