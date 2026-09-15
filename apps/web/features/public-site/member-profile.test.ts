import assert from "node:assert/strict";
import test from "node:test";
import { createMemberProfileLoader } from "./member-profile.ts";

test("member profile loader caches successful payloads and supports forced retry", async () => {
  let calls = 0;
  const loader = createMemberProfileLoader(async (slug) => ({ member: { slug }, publications: [{ id: String(++calls) }] }));
  assert.equal((await loader.load("alice")).publications[0].id, "1");
  assert.equal((await loader.load("alice")).publications[0].id, "1");
  assert.equal((await loader.load("alice", true)).publications[0].id, "2");
});

test("member profile loader does not cache failures", async () => {
  let calls = 0;
  const loader = createMemberProfileLoader(async () => { if (++calls === 1) throw new Error("offline"); return { member: {}, publications: [] }; });
  await assert.rejects(loader.load("alice"), /offline/);
  await loader.load("alice");
  assert.equal(calls, 2);
});
