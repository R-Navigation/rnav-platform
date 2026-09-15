import "dotenv/config";
import pg from "pg";
import { parseArgs, requiredArg } from "../db/common.js";
import { executeMemberReset, previewMemberReset, type MemberResetPlan, type ResetMemberProfile } from "../../server/services/scholarly-sync/resetMemberSync.js";

function printReport(profile: ResetMemberProfile, plan: MemberResetPlan, executed: boolean) {
  const range = `${profile.syncFromYear ?? "∞"} → ${profile.syncToYear ?? "∞"}`;
  console.log(`=== RNAV Scholarly Member Reset ===\n\nUser:\n${profile.memberName} (@${profile.username}) · ${profile.userId}\n\nProfile:\nORCID              ${profile.orcidId ?? "not configured"}\nOpenAlex Author     ${profile.openalexAuthorId ?? "not configured"}\nIdentity            ${profile.identityStatus}\nSync Enabled        ${profile.syncEnabled}\nSync Range          ${range}\n\nRelations:\n${plan.relationCount} works\n\nCandidates:\n${plan.pendingCandidates} pending\n${plan.ignoredCandidates} ignored\n\nAccepted:\n${plan.acceptedSyncCreated} sync-created\n${plan.mergedManualPublications} merged-to-manual\n\nShared:\n${plan.sharedWorksPreserved} linked to other RNAV members\n\nProtected:\n${plan.manualWorksProtected} manual works\n${plan.featuredBlocks.length} homepage featured\n\nPlanned:\ndisable sync              YES\nremove member relations   ${plan.removableRelationWorkIds.length}\ndelete orphan works       ${plan.workIdsToDelete.length}\ndelete generated papers   ${plan.researchItemIdsToDelete.length}\npreserve identities       YES\npreserve runs/audits      YES\n\n${executed ? "EXECUTED" : plan.blocked ? "BLOCKED — no changes made" : "DRY RUN — no changes made"}`);
}

const args = parseArgs();
const userId = requiredArg(args, "user");
const execute = args.has("execute");
if (execute === args.has("dry-run")) throw new Error("Specify exactly one of --dry-run or --execute");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (execute) {
    const result = await executeMemberReset(pool, userId, requiredArg(args, "confirm"));
    printReport(result.profile, result.plan, true);
  } else {
    const result = await previewMemberReset(pool, userId);
    printReport(result.profile, result.plan, false);
    if (result.plan.blocked) process.exitCode = 2;
  }
} finally { await pool.end(); }
