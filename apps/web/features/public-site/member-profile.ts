export type MemberProfilePayload = { member: Record<string, unknown>; publications: Array<Record<string, unknown>> };

export function createMemberProfileLoader(fetchProfile: (slug: string) => Promise<MemberProfilePayload>) {
  const cache = new Map<string, MemberProfilePayload>();
  return {
    async load(slug: string, force = false) {
      if (!force && cache.has(slug)) return cache.get(slug)!;
      const profile = await fetchProfile(slug);
      cache.set(slug, profile);
      return profile;
    },
    clear(slug?: string) { if (slug) cache.delete(slug); else cache.clear(); },
  };
}

export const memberProfileLoader = createMemberProfileLoader(async (slug) => {
  const response = await fetch(`/api/public/team-members/${encodeURIComponent(slug)}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "成员公开资料不存在" : "暂时无法加载成员资料");
  return response.json() as Promise<MemberProfilePayload>;
});
