import assert from "node:assert/strict";
import test from "node:test";
import { createCrossrefClient } from "./crossrefClient.js";
import { createOpenAlexClient } from "./openAlexClient.js";

test("OpenAlex resolves ORCID and retrieves recent works with bounded selected fields", async () => {
  const urls: URL[] = [];
  const client = createOpenAlexClient({ apiKey: "test-key", fetchImpl: async (input) => {
    const url = new URL(String(input)); urls.push(url);
    if (url.pathname.startsWith("/authors/")) return Response.json({ id: "https://openalex.org/A1", display_name: "Researcher", orcid: "https://orcid.org/0000-0002-1825-0097", works_count: 1, last_known_institutions: [{ display_name: "WHU" }] });
    return Response.json({ results: [{ id: "https://openalex.org/W1", title: "Work", publication_year: 2025, type: "article", authorships: [] }], meta: { next_cursor: null } });
  } });
  const author = await client.resolveAuthorByOrcid("0000-0002-1825-0097");
  assert.equal(author.id, "A1"); assert.equal(author.recentWorks[0].id, "W1");
  assert.ok(urls.every((url) => url.searchParams.get("api_key") === "test-key"));
  assert.equal(urls.find((url) => url.pathname === "/works")?.searchParams.get("per_page"), "100");
});
test("Crossref uses polite identification without exposing it outside the provider request", async () => {
  let observed: { url?: URL; userAgent?: string | null } = {};
  const client = createCrossrefClient({ contactEmail: "scholarly@example.org", fetchImpl: async (input, init) => { observed = { url: new URL(String(input)), userAgent: new Headers(init?.headers).get("user-agent") }; return Response.json({ message: { DOI: "10.1000/ABC", title: ["Title"] } }); } });
  const work = await client.getWorkByDoi("10.1000/abc");
  assert.equal(work.DOI, "10.1000/ABC"); assert.equal(observed.url?.searchParams.get("mailto"), "scholarly@example.org"); assert.match(observed.userAgent ?? "", /RNAV-Scholarly-Sync/);
});

test("provider clients resolve updated credentials for each request", async () => {
  let key = "first-key"; const openAlexKeys: Array<string | null> = [];
  const openAlex = createOpenAlexClient({ apiKey: async () => key, fetchImpl: async (input) => {
    const url = new URL(String(input)); openAlexKeys.push(url.searchParams.get("api_key"));
    return url.pathname === "/works" ? Response.json({ results: [], meta: { next_cursor: null } }) : Response.json({ id: "https://openalex.org/A1", display_name: "Researcher" });
  } });
  await openAlex.getAuthor("A1"); key = "second-key"; await openAlex.getAuthor("A1");
  assert.deepEqual(openAlexKeys, ["first-key", "first-key", "second-key", "second-key"]);

  let email = "first@example.org"; const crossrefEmails: Array<string | null> = [];
  const crossref = createCrossrefClient({ contactEmail: async () => email, fetchImpl: async (input) => {
    crossrefEmails.push(new URL(String(input)).searchParams.get("mailto")); return Response.json({ message: { DOI: "10.1000/test" } });
  } });
  await crossref.getWorkByDoi("10.1000/test"); email = "second@example.org"; await crossref.getWorkByDoi("10.1000/test");
  assert.deepEqual(crossrefEmails, ["first@example.org", "second@example.org"]);
});
