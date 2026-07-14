# RNAV Account Lifecycle, Profile, and Permissions Implementation Plan

> **For Codex:** Execute this plan task by task with tests first. Do not deploy until the full local test, lint, and production build gates pass.

**Goal:** Complete the first-phase RNAV console account lifecycle: first-login password changes, self-service profiles with public-field controls, user administration, permission templates/overrides, protected super administration, session revocation, and audit logging.

**Architecture:** Keep Express as the only business/API authority, PostgreSQL as the transactional source of truth, and Next.js App Router route handlers as same-origin browser proxies. Extend the existing `users`, `user_profiles`, `permissions`, `user_permissions`, `session_tokens`, `audit_logs`, and `team_members` model rather than introducing a second identity system. Put domain rules in typed services, keep route handlers thin, and update public member records in the same transaction as profile changes.

**Tech Stack:** Node.js 24, TypeScript, Express 5, PostgreSQL, Zod, bcryptjs, Next.js 15 App Router, React 19, Tailwind CSS, Node test runner.

---

## Task 1: Account and permission schema migration

**Files:**
- Create: `server/db/migrations/014_account_profile_permissions.sql`
- Modify: `server/db/runMigrations.test.ts`

**Step 1: Write the failing migration assertions**

Assert the migration defines:

- `users.must_change_password`, `users.password_changed_at`, and `users.created_source`
- expanded `user_profiles` fields, `public_fields`, `version`, timestamps, and `team_member_id`
- permission template, template permission, user template, and explicit override tables
- immutable system templates and their expected permission assignments
- safe backfill of existing profiles and team-member links
- indexes and constraints for active-user and permission administration queries

**Step 2: Run the migration test and confirm failure**

Run: `npm --workspace server test -- --test-name-pattern="account profile permission migration"`

**Step 3: Implement the additive migration**

Use guarded DDL so production data is retained. Do not rewrite prior checksummed migrations. Store explicit per-user permission decisions as `grant` or `revoke`; migrate existing `user_permissions` rows to grants. Seed the seven approved templates and use stable keys.

**Step 4: Run migration tests**

Run: `npm --workspace server test -- --test-name-pattern="migration"`

**Step 5: Commit**

```bash
git add server/db/migrations/014_account_profile_permissions.sql server/db/runMigrations.test.ts
git commit -m "feat: add account and permission schema"
```

## Task 2: Permission resolution and source reporting

**Files:**
- Modify: `server/services/auth/permissions.ts`
- Modify: `server/services/auth/permissions.test.ts`
- Modify: `server/middleware/auth.ts`
- Modify: `server/middleware/requirePermission.test.ts`

**Step 1: Add failing tests**

Cover immutable normal permissions, template grants, explicit grants, explicit revokes, implied procurement read permission, `plus` derivation, all-permission `super`, source metadata, and available console modules.

**Step 2: Run and confirm failures**

Run: `npm --workspace server test -- --test-name-pattern="permission"`

**Step 3: Implement typed permission resolution**

Expose one resolver returning effective keys plus per-key sources. Update the PostgreSQL auth repository query to load template and override sources. Include `mustChangePassword` in session identity without leaking password data.

**Step 4: Run focused tests and typecheck**

Run: `npm --workspace server test -- --test-name-pattern="permission|auth middleware"`

Run: `npm --workspace server run lint`

**Step 5: Commit**

```bash
git add server/services/auth server/middleware/auth.ts server/middleware/requirePermission.test.ts
git commit -m "feat: resolve template and override permissions"
```

## Task 3: Password lifecycle and first-login restriction

**Files:**
- Create: `server/services/account/passwordPolicy.ts`
- Create: `server/services/account/passwordPolicy.test.ts`
- Create: `server/services/account/accountService.ts`
- Create: `server/services/account/accountService.test.ts`
- Modify: `server/routes/auth.ts`
- Modify: `server/routes/auth.test.ts`
- Create: `server/middleware/requirePasswordChanged.ts`
- Create: `server/middleware/requirePasswordChanged.test.ts`
- Modify: `server/index.ts`

**Step 1: Add failing password-policy and account-service tests**

Cover the 12-character uppercase/lowercase/digit/special policy, current-password validation, bcrypt hashing, changing the password, clearing `must_change_password`, updating `password_changed_at`, revoking other sessions, and audit details that contain no password.

**Step 2: Add failing route and middleware tests**

Cover login/session payloads with `mustChangePassword`, `POST /api/auth/change-password`, same-origin enforcement, stable validation errors, and `PASSWORD_CHANGE_REQUIRED` responses for blocked console APIs. Allow only session, change-password, and logout while the flag is set.

**Step 3: Implement the lifecycle**

Keep the current session valid after self-service password change while deleting every other session. On first-login completion, refresh session identity naturally from the database.

**Step 4: Run focused tests**

Run: `npm --workspace server test -- --test-name-pattern="password|first login|auth"`

**Step 5: Commit**

```bash
git add server/services/account server/routes/auth.ts server/routes/auth.test.ts server/middleware server/index.ts
git commit -m "feat: enforce account password lifecycle"
```

## Task 4: Self-service member profile and public synchronization

**Files:**
- Create: `server/services/account/profileSchemas.ts`
- Create: `server/services/account/profileSchemas.test.ts`
- Create: `server/services/account/profileService.ts`
- Create: `server/services/account/profileService.test.ts`
- Create: `server/routes/profile.ts`
- Create: `server/routes/profile.test.ts`
- Modify: `server/index.ts`

**Step 1: Add failing schema tests**

Validate all bounded text/URL/email fields, approved public field keys, rejection of `phone` in `publicFields`, and strict rejection of unknown input keys.

**Step 2: Add failing transactional service tests**

Cover profile read, optimistic version update, atomic `user_profiles` and `team_members` synchronization, neutral names when both names are hidden, clearing hidden optional public values, email/homepage/GitHub contact/link replacement, phone never reaching public tables, avatar mapping, audit logging, and conflict response.

**Step 3: Implement routes**

Add `GET /api/profile` and `PUT /api/profile`, protected by login, password-change completion, own-profile permissions, and same-origin checks for writes.

**Step 4: Run focused tests**

Run: `npm --workspace server test -- --test-name-pattern="profile"`

**Step 5: Commit**

```bash
git add server/services/account server/routes/profile.ts server/routes/profile.test.ts server/index.ts
git commit -m "feat: add self-service member profiles"
```

## Task 5: User administration

**Files:**
- Create: `server/services/user-admin/userSchemas.ts`
- Create: `server/services/user-admin/userSchemas.test.ts`
- Create: `server/services/user-admin/userAdminService.ts`
- Create: `server/services/user-admin/userAdminService.test.ts`
- Create: `server/routes/users.ts`
- Create: `server/routes/users.test.ts`
- Modify: `server/index.ts`

**Step 1: Add failing service tests**

Cover listing/search/filter, transactionally creating user/profile/team member, immutable username, unique conflicts, temporary-password generation, bcrypt hashing, first-login flag, normal defaults, optional super creation, disabling/restoring, reset password, session revocation, audit logging, and one-time password response.

**Step 2: Add super safety tests**

Cover non-super attempts to change super, self-disable rejection, last-active-super protection under row/advisory locks, and super-only base-tier promotion/demotion.

**Step 3: Implement routes and schemas**

Add list, create, detail, status, tier, reset-password, and revoke-sessions endpoints. Require `users.read` for reads and `users.write` for lifecycle writes, with additional super checks in the service.

**Step 4: Run focused tests**

Run: `npm --workspace server test -- --test-name-pattern="user admin|super protection"`

**Step 5: Commit**

```bash
git add server/services/user-admin server/routes/users.ts server/routes/users.test.ts server/index.ts
git commit -m "feat: add protected user administration"
```

## Task 6: Permission template and override administration

**Files:**
- Create: `server/services/permission-admin/permissionSchemas.ts`
- Create: `server/services/permission-admin/permissionSchemas.test.ts`
- Create: `server/services/permission-admin/permissionAdminService.ts`
- Create: `server/services/permission-admin/permissionAdminService.test.ts`
- Create: `server/routes/permissions.ts`
- Create: `server/routes/permissions.test.ts`
- Modify: `server/index.ts`

**Step 1: Add failing tests**

Cover catalogs, template membership, explicit grants/revokes, final source calculation, immutable base permissions, unknown permission rejection, transactional replacement, session revocation, audit logging, non-super targeting super rejection, self-critical-permission protection, and super tier handling.

**Step 2: Implement service and routes**

Add catalog, user assignment detail, and replace-assignment endpoints. Return effective permissions, sources, derived tier, and console modules after every read/write.

**Step 3: Run focused tests**

Run: `npm --workspace server test -- --test-name-pattern="permission admin"`

**Step 4: Commit**

```bash
git add server/services/permission-admin server/routes/permissions.ts server/routes/permissions.test.ts server/index.ts
git commit -m "feat: add permission template administration"
```

## Task 7: API enforcement and Next.js same-origin proxies

**Files:**
- Modify: `server/routes/console.ts`
- Modify: `server/routes/console.test.ts`
- Modify: existing internal routers to apply `requirePasswordChanged`
- Create: `apps/web/app/api/profile/[[...path]]/proxy.ts`
- Create: `apps/web/app/api/profile/[[...path]]/proxy.test.ts`
- Create: `apps/web/app/api/profile/[[...path]]/route.ts`
- Create: `apps/web/app/api/users/[[...path]]/proxy.ts`
- Create: `apps/web/app/api/users/[[...path]]/proxy.test.ts`
- Create: `apps/web/app/api/users/[[...path]]/route.ts`
- Create: `apps/web/app/api/permissions/[[...path]]/proxy.ts`
- Create: `apps/web/app/api/permissions/[[...path]]/proxy.test.ts`
- Create: `apps/web/app/api/permissions/[[...path]]/route.ts`
- Create: `apps/web/app/api/auth/session/route.ts`
- Create: `apps/web/app/api/auth/logout/route.ts`
- Create: `apps/web/app/api/auth/change-password/route.ts`

**Step 1: Add proxy and enforcement tests**

Verify path construction, cookies, content type, request body forwarding, status/body/header forwarding, and first-login denial on every internal business router.

**Step 2: Implement using existing proxy conventions**

Do not duplicate authorization or business rules in Next handlers. Update console bootstrap to expose `mustChangePassword` and redirect metadata.

**Step 3: Run server and web tests**

Run: `npm test`

**Step 4: Commit**

```bash
git add server/routes server/index.ts apps/web/app/api
git commit -m "feat: expose account administration APIs"
```

## Task 8: Profile console UI

**Files:**
- Modify: `apps/web/app/console/profile/page.tsx`
- Create: `apps/web/app/console/profile/ProfileConsole.tsx`
- Create: `apps/web/app/console/profile/ProfileConsole.test.tsx` if the current web test stack supports component tests; otherwise cover pure helpers
- Create: `apps/web/lib/account.ts`
- Modify: `apps/web/app/console/layout.tsx`
- Modify: `apps/web/app/globals.css` only for shared primitives that existing Tailwind utilities cannot express cleanly

**Step 1: Implement the three-tab profile workflow**

Build personal details, public visibility, and account security tabs. Include a public preview, neutral-name behavior, save states, version-conflict handling, password policy feedback, first-login forced security view, and navigation lock until password change succeeds.

**Step 2: Verify responsive and accessibility states**

Check labels, keyboard focus, disabled/loading states, mobile layout, long bilingual content, and errors. Keep the media control ready for Phase 2 while preserving current avatar references.

**Step 3: Run lint and build**

Run: `npm --workspace apps/web run lint`

Run: `npm --workspace apps/web run build`

**Step 4: Commit**

```bash
git add apps/web/app/console/profile apps/web/app/console/layout.tsx apps/web/lib/account.ts apps/web/app/globals.css
git commit -m "feat: complete profile and password console"
```

## Task 9: User and permission console UI

**Files:**
- Modify: `apps/web/app/console/users/page.tsx`
- Create: `apps/web/app/console/users/UserManagement.tsx`
- Modify: `apps/web/app/console/permissions/page.tsx`
- Create: `apps/web/app/console/permissions/PermissionManagement.tsx`
- Create: `apps/web/lib/userAdmin.ts`
- Create: `apps/web/lib/permissionAdmin.ts`

**Step 1: Build user management**

Implement search, tier/status filters, user table, create dialog, status changes, base-tier changes, password reset, session revocation, detail view, and one-time temporary-password result. Hide or disable actions the current actor cannot perform and still rely on server enforcement.

**Step 2: Build permission management**

Implement user selection, template selection, per-permission grant/revoke/inherit controls, effective source display, change summary, resulting tier/module preview, and session-revocation confirmation.

**Step 3: Run lint, tests, and build**

Run: `npm --workspace apps/web test`

Run: `npm --workspace apps/web run lint`

Run: `npm --workspace apps/web run build`

**Step 4: Commit**

```bash
git add apps/web/app/console/users apps/web/app/console/permissions apps/web/lib
git commit -m "feat: complete user and permission consoles"
```

## Task 10: Full local verification

**Files:**
- Modify only files required by defects found during verification

**Step 1: Install exact dependencies**

Run: `npm ci`

**Step 2: Execute all automated gates**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

**Step 3: Run a disposable PostgreSQL migration verification**

Create a fresh database, run `npm run db:migrate`, inspect seeded templates, and run service/API smoke tests against it. Drop only the disposable database afterward.

**Step 4: Browser verification**

Start the unified service locally and verify login, forced first-password change, profile save/public preview, user creation/reset/status changes, permission assignment, session invalidation, normal/plus/super module visibility, and desktop/mobile layouts.

**Step 5: Commit fixes and push**

```bash
git status --short
git push origin main
```

## Task 11: Production migration and acceptance

**Files:**
- Update: `docs/MIGRATION_RUNBOOK_ZH.md` with Phase 1 operational steps and rollback evidence
- Store runtime backups only under ignored `backups/`

**Step 1: Preflight**

Verify local/remote commits, production health, disk space, systemd state, nginx single upstream, database connectivity, and active-super count. Do not print secrets.

**Step 2: Back up production**

Create timestamped PostgreSQL custom and plain dumps plus checksums before pulling code. Retain the current checkout commit and service/environment metadata for rollback.

**Step 3: Pull and build from GitHub**

On `/srv/rnav_platform`, run a fast-forward-only pull, `npm ci`, tests, lint, and production build.

**Step 4: Apply migration**

Run `npm run db:migrate`, verify schema checksums, row counts, profile/team-member links, seven templates, permission assignments, active-super count, and existing account login hashes remaining intact.

**Step 5: Activate and verify**

Restart `rnav-platform`, then verify `/api/health`, public pages, login/session/logout, internal API boundaries, first-login flow with a disposable account, profile synchronization, user admin, permission admin, websocket monitor, asset and procurement regressions, systemd logs, and nginx.

**Step 6: Rollback rule**

If acceptance fails, stop writes, restore the pre-migration database dump, return the checkout to the recorded prior commit using a non-destructive deployment checkout strategy, rebuild, restart, and rerun health checks. Keep the failed database and logs for diagnosis.

**Step 7: Final commit**

```bash
git add docs/MIGRATION_RUNBOOK_ZH.md
git commit -m "docs: add account rollout runbook"
git push origin main
```

## Completion checklist

- Existing production passwords and member data survive the additive migration.
- Every active account can log in; temporary-password accounts cannot use business APIs before changing password.
- Password changes and admin resets revoke the required sessions and never log secrets.
- Members control approved public fields without review; phone is never public.
- Profile and public member updates commit atomically with optimistic concurrency.
- Admin-created users receive linked profile/member records and a password shown exactly once.
- Last active super, self-disable, self-critical-permission, and non-super-to-super protections hold under concurrent writes.
- Effective permissions have explainable base/template/grant/revoke sources and produce correct normal/plus/super tiers.
- All console pages are usable on desktop and mobile and no longer show placeholders.
- Full tests, type checks, production build, database verification, deployment, and production acceptance pass before Phase 1 is declared complete.
