import assert from "node:assert/strict";
import test from "node:test";
import { publicMetadata } from "./publicMetadata.ts";

test("public page metadata has a canonical route and complete sharing fields", () => {
  const metadata = publicMetadata("Team", "Team description", "/team");
  assert.equal(metadata.title, "Team");
  assert.deepEqual(metadata.alternates, { canonical: "/team" });
  assert.deepEqual(metadata.openGraph, {
    type: "website",
    locale: "zh_CN",
    siteName: "RNAV Lab",
    title: "Team | RNAV Lab",
    description: "Team description",
    url: "/team",
    images: ["/og-default.svg"],
  });
});

test("homepage title remains absolute instead of applying the root template twice", () => {
  assert.deepEqual(publicMetadata("RNAV Lab", "Home", "/").title, { absolute: "RNAV Lab" });
});
