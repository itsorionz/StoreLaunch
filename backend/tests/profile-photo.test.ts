import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareProfilePhoto } from "../lib/profile-photo";

test("profile image is decoded, resized and converted to WebP", async () => {
  const bytes = await sharp({
    create: { width: 1000, height: 800, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const result = await prepareProfilePhoto(
    new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" }),
  );
  const meta = await sharp(result).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 512);
  assert.equal(meta.height, 512);
  assert.equal(meta.exif, undefined);
});

test("profile images reject oversized, unsupported and corrupt files", async () => {
  await assert.rejects(
    prepareProfilePhoto(
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }),
    ),
    /2 MB/,
  );
  await assert.rejects(
    prepareProfilePhoto(new File(["<svg></svg>"], "photo.svg", { type: "image/svg+xml" })),
    /JPEG, PNG or WebP/,
  );
  await assert.rejects(
    prepareProfilePhoto(new File(["not an image"], "photo.png", { type: "image/png" })),
    /could not be read/,
  );
  await assert.rejects(
    prepareProfilePhoto(new File(["<svg></svg>"], "photo.png", { type: "image/png" })),
    /could not be read/,
  );
});
