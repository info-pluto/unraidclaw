import { readFileSync, existsSync } from "node:fs";
import { loadConfig, loadPermissions, loadIntegrations, watchPermissions, watchIntegrations } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const permissions = loadPermissions();
  const integrations = loadIntegrations();

  console.log("[unraidclaw] Loaded permissions:", Object.values(permissions).filter(Boolean).length, "enabled");
  console.log("[unraidclaw] Loaded integrations:", Object.entries(integrations).filter(([, cfg]) => (cfg as any)?.enabled).map(([name]) => name).join(", ") || "none");

  // Watch for permission changes (hot-reload)
  watchPermissions((matrix) => {
    console.log("[unraidclaw] Permissions reloaded:", Object.values(matrix).filter(Boolean).length, "enabled");
  });
  watchIntegrations((cfg) => {
    console.log("[unraidclaw] Integrations reloaded:", Object.entries(cfg).filter(([, v]) => (v as any)?.enabled).map(([name]) => name).join(", ") || "none");
  });

  // Load TLS cert/key if available
  let httpsOpts: { cert: Buffer; key: Buffer } | undefined;
  if (config.tlsCert && config.tlsKey && existsSync(config.tlsCert) && existsSync(config.tlsKey)) {
    try {
      httpsOpts = {
        cert: readFileSync(config.tlsCert),
        key: readFileSync(config.tlsKey),
      };
      console.log("[unraidclaw] TLS enabled — loaded cert from", config.tlsCert);
    } catch (err) {
      console.warn("[unraidclaw] Failed to load TLS certs, falling back to HTTP:", err);
    }
  } else {
    console.warn("[unraidclaw] TLS cert/key not found, running plain HTTP");
  }

  const app = createServer(config, httpsOpts);
  const proto = httpsOpts ? "https" : "http";

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`[unraidclaw] Server running on ${proto}://${config.host}:${config.port}`);
  } catch (err) {
    console.error("[unraidclaw] Failed to start:", err);
    process.exit(1);
  }

  // Graceful shutdown
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      console.log(`[unraidclaw] Received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }
}

main();
