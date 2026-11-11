import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { logger } from "./logger";

const log = logger.child({ scope: "upload-image" });

export async function saveResizedBannerImage(
  file: File,
  { folder, label = "Banner" }: { folder: string; label?: string },
): Promise<string> {
  let image: Buffer;
  try {
    image = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20_000_000,
      animated: false,
    })
      .rotate()
      .resize(1600, 500, { fit: "cover", position: sharp.strategy.attention })
      .webp({ quality: 84, effort: 5 })
      .toBuffer();
  } catch {
    throw new Error("This file could not be read as a valid image");
  }

  return storeProcessedImage(image, { folder, label });
}

export async function saveResizedLogoImage(file: File): Promise<string> {
  let image: Buffer;
  try {
    image = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20_000_000,
      animated: false,
    })
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, effort: 5 })
      .toBuffer();
  } catch {
    throw new Error("This file could not be read as a valid image");
  }

  return storeProcessedImage(image, { folder: "logo", label: "Store logo" });
}

async function storeProcessedImage(
  image: Buffer,
  { folder, label }: { folder: string; label: string },
): Promise<string> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (cloud && apiKey && apiSecret) {
    try {
      const { v2: cloudinary } = await import("cloudinary");
      cloudinary.config({ cloud_name: cloud, api_key: apiKey, api_secret: apiSecret });
      const result = await cloudinary.uploader.upload(
        `data:image/webp;base64,${image.toString("base64")}`,
        {
          folder: `storelaunch/${folder}`,
          resource_type: "image",
          unique_filename: true,
          overwrite: false,
        },
      );
      return result.secure_url;
    } catch (error) {
      // Cause is discarded in production (a generic message is thrown), so it
      // must be recorded here or a Cloudinary outage stays invisible.
      log.error("cloudinary upload failed", { error, folder });
      if (process.env.NODE_ENV === "production")
        throw new Error(`${label} image storage is temporarily unavailable. Try again later`);
    }
  }
  if (process.env.NODE_ENV === "production")
    throw new Error(`Configure Cloudinary storage before uploading ${label.toLowerCase()} images`);

  const fileName = `${randomUUID()}.webp`;
  const directory = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), image);
  return `/uploads/${folder}/${fileName}`;
}
