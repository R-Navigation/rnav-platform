import assert from "node:assert/strict";
import test from "node:test";
import { defaultHeroImage, resolveHeroImage } from "./hero-image.ts";
test("headers use one configured photo or a safe landscape fallback", () => {
  const custom = { src: "https://example.com/campus.jpg", alt: "Campus" };
  assert.equal(resolveHeroImage(custom), custom);
  assert.equal(resolveHeroImage(null), defaultHeroImage);
  assert.equal(
    resolveHeroImage({ src: "javascript:alert(1)" }),
    defaultHeroImage,
  );
  assert.equal(
    resolveHeroImage({ src: custom.src, alt: "示意图片" }),
    defaultHeroImage,
  );
});
