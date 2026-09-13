import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultHeroImage,
  imagePresentation,
  resolveHeroImage,
} from "./hero-image.ts";
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

test("4.2 image focal metadata is bounded and keeps safe defaults", () => {
  assert.deepEqual(imagePresentation(), {
    positionX: 50,
    positionY: 50,
    zoom: 1,
  });
  assert.deepEqual(
    imagePresentation({ positionX: -40, positionY: 140, zoom: 9 }),
    { positionX: 0, positionY: 100, zoom: 2 },
  );
  assert.deepEqual(imagePresentation({}, { positionX: 68, positionY: 45 }), {
    positionX: 68,
    positionY: 45,
    zoom: 1,
  });
});
