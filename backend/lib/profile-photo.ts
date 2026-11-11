import sharp from "sharp";
import "server-only";
import { db } from "./db";

// Read side for the profile-photo route handler: returns the stored bytes for
// the signed-in user, or null when no photo is set.
export async function getProfilePhoto(userId: string): Promise<Uint8Array | null> {
  const account = await db.user.findUnique({
    where: { id: userId },
    select: { profilePhoto: true },
  });
  return account?.profilePhoto ?? null;
}

export async function prepareProfilePhoto(file: File): Promise<Buffer> {
  if (file.size > 2 * 1024 * 1024) throw new Error("Choose a photo smaller than 2 MB");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG or WebP photo");
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 20_000_000, animated: false });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error();
    return await image
      .rotate()
      .resize(512, 512, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new Error("This photo could not be read. Choose a valid JPEG, PNG or WebP image");
  }
}
