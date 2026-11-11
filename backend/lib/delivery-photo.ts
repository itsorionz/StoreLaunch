import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";

// Read side for the delivery-proof photo route: loads a proof with the owning
// order's rider so the caller can enforce access. Returns the full row.
export async function getDeliveryProofWithOrder(id: string) {
  return db.deliveryProof.findUnique({
    where: { id },
    include: { order: { select: { riderId: true } } },
  });
}

export async function saveProofPhoto(value: FormDataEntryValue | null) {
  if (value === null) return {};
  if (!(value instanceof File)) throw new Error("Choose a valid photo file");
  if (value.size === 0) return {};
  if (value.size > 5 * 1024 * 1024) throw new Error("Use a photo of 5 MB or smaller");
  const bytes = Buffer.from(await value.arrayBuffer());
  const mime =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
  if (!mime) throw new Error("Use a JPEG, PNG or WebP photo");
  const photoKey = randomUUID();
  return { photoKey, photoMime: mime, photoData: Uint8Array.from(bytes) };
}
// Proof bytes are committed in the same transaction as the delivery record; no orphan cleanup is needed.
export async function discardProofPhoto(key?: string) {
  void key;
}
