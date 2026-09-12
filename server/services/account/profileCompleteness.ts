export type CompletenessProfile = {
  memberStatus: "current" | "alumni";
  publicVisible: boolean;
  nameZh: string;
  nameEn: string;
  avatarAssetId: string | null;
  degreeLevel: string;
  enrollmentYear: string;
  graduationYear: string;
  majorZh: string;
  majorEn: string;
  researchInterestsZh: string;
  researchInterestsEn: string;
  destinationZh: string;
  destinationEn: string;
};

export function profileCompleteness(profile: CompletenessProfile) {
  const missing: string[] = [];
  if (!profile.nameZh && !profile.nameEn) missing.push("name");
  if (!profile.avatarAssetId) missing.push("avatar");
  if (!profile.degreeLevel) missing.push("degree");
  if (!profile.majorZh && !profile.majorEn) missing.push("major");
  if (!profile.researchInterestsZh && !profile.researchInterestsEn) missing.push("research");
  if (profile.memberStatus === "current" && !profile.enrollmentYear) missing.push("enrollmentYear");
  if (profile.memberStatus === "alumni" && !profile.graduationYear) missing.push("graduationYear");
  if (profile.memberStatus === "alumni" && !profile.destinationZh && !profile.destinationEn) missing.push("destination");
  return {
    missing,
    complete: missing.length === 0,
    publishable: profile.publicVisible && missing.length === 0,
  };
}

