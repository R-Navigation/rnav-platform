"use client";

import { ScholarlyProfileForm } from "@/features/console/scholarly/ScholarlyProfileForm";

export function ScholarlyProfileEditor({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  return <ScholarlyProfileForm canEdit={canEdit} mode="admin" userId={userId} />;
}
