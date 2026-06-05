import { loadEnv, defineConfig } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

// "server" handles HTTP, "worker" runs jobs/subscribers/cron, "shared" does both (local dev)
const WORKER_MODE =
  (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared";

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    workerMode: WORKER_MODE,
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7001",
      authCors: process.env.AUTH_CORS || "http://localhost:7001,http://localhost:3000",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    // Baked into the admin SPA at BUILD time — set MEDUSA_BACKEND_URL when building.
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
    // Never serve the admin from the worker process.
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true" || WORKER_MODE === "worker",
  },
  modules: [
    // Redis-backed infrastructure modules (required for the server/worker split).
    // All three ship inside @medusajs/medusa — no extra packages needed.
    // Only enabled when REDIS_URL is set, so local dev without Redis still works
    // (falls back to in-memory cache / local event bus / in-memory workflows).
    ...(process.env.REDIS_URL
      ? [
          {
            resolve: "@medusajs/medusa/cache-redis",
            options: {
              redisUrl: process.env.REDIS_URL,
            },
          },
          {
            resolve: "@medusajs/medusa/event-bus-redis",
            options: {
              redisUrl: process.env.REDIS_URL,
            },
          },
          {
            resolve: "@medusajs/medusa/workflow-engine-redis",
            options: {
              redis: {
                url: process.env.REDIS_URL,
              },
            },
          },
        ]
      : []),
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: "static",
              backend_url: `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/static`,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/midtrans",
            id: "midtrans",
            options: {
              serverKey: process.env.MIDTRANS_SERVER_KEY,
              clientKey: process.env.MIDTRANS_CLIENT_KEY,
              isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
            },
          },
        ],
      },
    },
  ],
});
