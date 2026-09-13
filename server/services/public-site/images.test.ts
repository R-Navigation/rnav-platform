import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  collectPublishedImages,
  createPublicImageService,
  isOwnedPublicImage,
  PublicImageError,
} from "./images.js";
const src =
  "https://r-navigation-1326672316.cos.ap-beijing.myqcloud.com/rnav/team/photo.png";
const rejectsWith = (status: number) => (error: unknown) =>
  error instanceof PublicImageError && error.status === status;

test("image origin validation rejects alternate hosts, credentials and query credentials", () => {
  assert.equal(isOwnedPublicImage(src), true);
  for (const value of [
    "http://169.254.169.254/",
    "https://example.com/image.png",
    src.replace("/rnav/", "/private/"),
    src.replace("https://", "https://user:password@"),
    `${src}?token=secret`,
    `${src}#fragment`,
  ])
    assert.equal(isOwnedPublicImage(value), false);
});
test("image allowlist only includes public DTO src fields", () => {
  assert.deepEqual(
    [
      ...collectPublishedImages({
        image: { src },
        nested: [{ src: "https://other.test/photo.png" }],
        description: src,
      }),
    ],
    [src],
  );
});
test("unpublished objects and invalid widths never initiate a fetch", async () => {
  let calls = 0;
  const get = createPublicImageService(async () => ({}), (async () => {
    calls++;
    throw Error("No fetch expected");
  }) as typeof fetch);
  await assert.rejects(get(src, "640"), rejectsWith(404));
  await assert.rejects(get(src, "9999"), rejectsWith(400));
  await assert.rejects(get(src, ["640"]), rejectsWith(400));
  await assert.rejects(get("http://127.0.0.1/", "640"), rejectsWith(400));
  assert.equal(calls, 0);
});
test("published raster is resized to WebP, deduplicated and cached", async () => {
  const input = await sharp({
    create: { width: 200, height: 100, channels: 3, background: "#1266f1" },
  })
    .png()
    .toBuffer();
  let calls = 0;
  const get = createPublicImageService(
    async () => ({ image: { src } }),
    (async (url, options) => {
      calls++;
      assert.equal(url, src);
      assert.equal(options?.redirect, "error");
      assert.ok(options?.signal);
      return new Response(new Uint8Array(input), {
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch,
  );
  const [one, two] = await Promise.all([get(src, "96"), get(src, "96")]);
  assert.equal(one, two);
  assert.equal(await get(src, "96"), one);
  assert.equal(calls, 1);
  const metadata = await sharp(one).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 96);
  assert.equal(metadata.height, 48);
});
test("redirects, SVG and oversized upstream responses are rejected", async () => {
  for (const response of [
    new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254" },
    }),
    new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    new Response("too large", {
      headers: {
        "content-type": "image/png",
        "content-length": String(17 * 1024 * 1024),
      },
    }),
  ]) {
    const get = createPublicImageService(
      async () => ({ image: { src } }),
      (async () => response) as typeof fetch,
    );
    await assert.rejects(get(src, "640"), rejectsWith(502));
  }
});
test("SVG disguised with a raster MIME type is rejected before decoding", async () => {
  const get = createPublicImageService(
    async () => ({ image: { src } }),
    (async () =>
      new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        { headers: { "content-type": "image/png" } },
      )) as typeof fetch,
  );
  await assert.rejects(get(src, "640"), rejectsWith(415));
});
