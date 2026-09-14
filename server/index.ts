import "dotenv/config";
import { createServer } from "node:http";
import { parse as parseCookie } from "cookie";
import nextModule from "next/dist/server/next.js";
import type { NextServerOptions } from "next/dist/server/next.js";
import pg from "pg";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { hashSessionToken, createAuthMiddleware, createPostgresAuthRepository, sessionCookieName } from "./middleware/auth.js";
import { createAuthRouter } from "./routes/auth.js";
import { createConsoleRouter } from "./routes/console.js";
import { createConsoleDashboardService } from "./services/console-dashboard/consoleDashboardService.js";
import { createLabAssetsRouter } from "./routes/labAssets.js";
import { createMonitorRouter } from "./routes/monitor.js";
import { createProcurementRouter } from "./routes/procurements.js";
import { createPublicRouter } from "./routes/public.js";
import { createSiteAdminRouter } from "./routes/site-admin.js";
import { createLabAssetsService } from "./services/lab-assets/labAssetsService.js";
import { createMonitorService } from "./services/monitor/monitorService.js";
import { startOfflineMonitor } from "./services/monitor/offlineMonitor.js";
import { createMonitorWebSocketHub } from "./services/monitor/websocketHub.js";
import { createProcurementService } from "./services/procurement/procurementService.js";
import { createPostgresPublicSiteRepository } from "./services/public-site/postgres-repository.js";
import { createPublicSiteService } from "./services/public-site/service.js";
import { createPostgresSiteAdminRepository } from "./services/site-admin/postgres-repository.js";
import { createSiteAdminService } from "./services/site-admin/service.js";
import { createAccountService } from "./services/account/accountService.js";
import { createProfileService } from "./services/account/profileService.js";
import { createProfileRouter } from "./routes/profile.js";
import { createUsersRouter } from "./routes/users.js";
import { createUserAdminService } from "./services/user-admin/userAdminService.js";
import { createPermissionsRouter } from "./routes/permissions.js";
import { createPermissionAdminService } from "./services/permission-admin/permissionAdminService.js";
import { createCosGateway } from "./services/media/cosGateway.js";
import { createMediaService } from "./services/media/mediaService.js";
import { createMediaRouter } from "./routes/media.js";
import { createSettingsService } from "./services/settings/settingsService.js";
import { createSettingsRouter } from "./routes/settings.js";
import { resolveWebDir } from "./webDir.js";
import { createNotificationService } from "./services/notifications/notificationService.js";
import { createNotificationsRouter } from "./routes/notifications.js";
import { createScholarlySyncRepository } from "./services/scholarly-sync/repository.js";
import { createOpenAlexClient } from "./services/scholarly-sync/providers/openAlexClient.js";
import { createCrossrefClient } from "./services/scholarly-sync/providers/crossrefClient.js";
import { createScholarlySyncService } from "./services/scholarly-sync/service.js";
import { createScholarlySyncRouter } from "./routes/scholarly-sync.js";

const env = loadEnv();
const pool = new pg.Pool({ connectionString: env.databaseUrl });
const authRepository = createPostgresAuthRepository(pool); const authMiddleware = createAuthMiddleware(authRepository);
type NextInstance = { prepare(): Promise<void>; getRequestHandler(): (request: import("express").Request, response: import("express").Response) => unknown };
type CreateNext = (options: NextServerOptions) => NextInstance;
const createNext = ((nextModule as unknown as { default?: CreateNext }).default ?? nextModule) as unknown as CreateNext;
const web = createNext({ dev: env.nodeEnv !== "production", dir: resolveWebDir(import.meta.url), hostname: env.host, port: env.port });
await web.prepare();

const publicService = createPublicSiteService(createPostgresPublicSiteRepository(pool));
const siteAdminService = createSiteAdminService(createPostgresSiteAdminRepository(pool));
const profileService = createProfileService(pool);
const scholarlySyncService = createScholarlySyncService({
  pool,
  repository: createScholarlySyncRepository(pool),
  openAlex: createOpenAlexClient({ baseUrl: env.scholarlySyncOpenAlexBaseUrl, apiKey: env.openAlexApiKey }),
  crossref: createCrossrefClient({ baseUrl: env.scholarlySyncCrossrefBaseUrl, contactEmail: env.scholarlySyncContactEmail }),
  enabled: env.scholarlySyncEnabled,
  providerConfig: { openAlexKeyConfigured: Boolean(env.openAlexApiKey), crossrefContactConfigured: Boolean(env.scholarlySyncContactEmail) },
});
let hub: ReturnType<typeof createMonitorWebSocketHub>;
const monitorService = createMonitorService(pool, { deviceTokenPepper: env.deviceTokenPepper, broadcast: (type, payload, audience) => hub.broadcast(type, payload, audience), onRealtimeError: (error) => console.error("Monitor realtime error", error) });
hub = createMonitorWebSocketHub({ publicPath: env.monitorWsPath, consolePath: `${env.monitorWsPath}/console`, authorizeConsole: async (request) => {
  const token = parseCookie(request.headers.cookie ?? "")[sessionCookieName]; if (!token) return false;
  const identity = await authRepository.findIdentityBySessionTokenHash(hashSessionToken(token), new Date());
  return Boolean(identity?.permissions.some((permission) => ["monitor.devices.read", "monitor.devices.write"].includes(permission)) || identity?.baseTier === "super");
} });

const app = createApp({
  health: { database: async () => { await pool.query("SELECT 1"); return true; } },
  routers: [
    createAuthRouter({ repository: authRepository, authMiddleware, cookieSecure: env.cookieSecure, accountService: createAccountService(pool), trustProxy: true }),
    createProfileRouter({ authMiddleware, service: profileService, trustProxy: true }),
    createUsersRouter({ authMiddleware, service: createUserAdminService(pool), profileService, trustProxy: true }),
    createPermissionsRouter({ authMiddleware, service: createPermissionAdminService(pool), trustProxy: true }),
    createMediaRouter({ authMiddleware, service: createMediaService(pool, createCosGateway({ secretId: env.cosSecretId, secretKey: env.cosSecretKey, region: env.cosRegion, bucket: env.cosBucket }),), trustProxy: true, maxBytes: env.mediaMaxUploadBytes, publicBaseUrl: env.cosPublicBaseUrl ?? `${env.publicBaseUrl}/media`, pathPrefix: env.cosPathPrefix }),
    createSettingsRouter({ authMiddleware, service: createSettingsService(pool), trustProxy: true }),
    createNotificationsRouter({ authMiddleware, service: createNotificationService(pool), trustProxy: true }),
    createScholarlySyncRouter({ authMiddleware, service: scholarlySyncService, trustProxy: true }),
    createConsoleRouter({ authMiddleware, dashboardService: createConsoleDashboardService(pool) }), createPublicRouter({ service: publicService }),
    createSiteAdminRouter({ authMiddleware, service: siteAdminService, trustProxy: true }),
    createLabAssetsRouter({ authMiddleware, service: createLabAssetsService(pool), trustProxy: true }),
    createMonitorRouter({ authMiddleware, service: monitorService, trustProxy: true }),
    createProcurementRouter({ authMiddleware, service: createProcurementService(pool), trustProxy: true }),
  ],
  nextHandler: web.getRequestHandler(),
});
const server = createServer(app); server.on("upgrade", async (request, socket, head) => { if (!(await hub.handleUpgrade(request, socket, head))) socket.destroy(); });
const stopOfflineMonitor = startOfflineMonitor({ service: monitorService, offlineTimeoutSeconds: env.monitorOfflineTimeoutSeconds });
server.listen(env.port, env.host, () => console.log(`RNAV platform listening on http://${env.host}:${env.port}`));

async function shutdown() { stopOfflineMonitor(); server.close(); await hub.close(); await pool.end(); process.exit(0); }
process.once("SIGINT", () => void shutdown()); process.once("SIGTERM", () => void shutdown());
