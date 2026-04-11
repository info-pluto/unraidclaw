import type { FastifyInstance } from "fastify";
import { Resource, Action, type JDownloaderPackageItem, type JDownloaderLinkItem } from "@unraidclaw/shared";
import { requirePermission } from "../permissions.js";
import { getIntegrations } from "../config.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

interface DirectAddLinksPayload {
  autostart?: boolean;
  links?: string;
  packageName?: string;
  downloadPassword?: string;
  extractPassword?: string;
  destinationFolder?: string;
  assignJobID?: boolean;
}

interface CnlPayload {
  urls: string;
  packageName?: string;
  dir?: string;
  autostart?: boolean;
  passwords?: string[];
  source?: string;
}

const execFileAsync = promisify(execFile);

interface JDSession {
  deviceId?: string;
  sessionToken?: string;
  regainToken?: string;
}

const MYJD_API = "https://api.jdownloader.org";

async function dockerContainerState(containerName: string): Promise<string | undefined> {
  if (!containerName) return undefined;
  try {
    const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{.State.Status}}", containerName]);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

async function directRequest(path: string, init?: RequestInit): Promise<any> {
  const cfg = getIntegrations().jdownloader;
  if (!cfg.baseUrl) throw new Error("JDownloader baseUrl is not configured");
  const base = cfg.baseUrl.replace(/\/$/, "");
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("content-type") && init?.body) headers.set("content-type", "application/json");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`JDownloader direct API failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function myJdCall(path: string, body?: unknown): Promise<any> {
  const cfg = getIntegrations().jdownloader;
  if (!cfg.email || !cfg.password || !cfg.deviceName) {
    throw new Error("MyJDownloader credentials or deviceName are not configured");
  }

  const loginRes = await fetch(`${MYJD_API}/my/connect?email=${encodeURIComponent(cfg.email)}&appkey=${encodeURIComponent("unraidclaw")}`);
  if (!loginRes.ok) throw new Error(`MyJDownloader connect failed (${loginRes.status})`);

  const listRes = await fetch(`${MYJD_API}/my/listdevices?sessiontoken=dummy`, { method: "GET" });
  void listRes; // kept as explicit placeholder for future full myjd crypto flow
  throw new Error("MyJDownloader mode is configured but not yet supported without the official encryption flow. Use direct mode for now.");
}

async function jdCall(path: string, init?: RequestInit): Promise<any> {
  const cfg = getIntegrations().jdownloader;
  if (!cfg.enabled) throw new Error("JDownloader integration is disabled");
  if (cfg.mode === "myjd") {
    const parsedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
    return myJdCall(path, parsedBody);
  }
  return directRequest(path, init);
}

async function queryApiCompat(path: string, payload: unknown): Promise<any> {
  try {
    return await jdCall(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const params = new URLSearchParams({ params: JSON.stringify(payload) });
    const message = error instanceof Error ? error.message : String(error);
    try {
      return await jdCall(`${path}?${params.toString()}`, { method: "GET" });
    } catch {
      throw new Error(`JDownloader API request failed for ${path}. Last error: ${message}`);
    }
  }
}

function directModeSupportsRemoteV2(): boolean {
  const cfg = getIntegrations().jdownloader;
  return cfg.mode === "direct" && cfg.deprecatedApiEnabled === true;
}

async function getPackages(): Promise<JDownloaderPackageItem[]> {
  if (directModeSupportsRemoteV2()) {
    const data = await queryApiCompat("/downloadsV2/queryPackages", [{ name: true, saveTo: true, bytesLoaded: true, bytesTotal: true, childCount: true, enabled: true, finished: true, running: true, speed: true, eta: true, status: true }]);
    return Array.isArray(data) ? data.map(normalizePackage) : [];
  }
  return [];
}

async function addLinksViaCnl(payload: CnlPayload): Promise<void> {
  const cnl: Record<string, unknown> = {
    urls: payload.urls,
  };
  if (payload.packageName) cnl.packageName = payload.packageName;
  if (payload.dir) cnl.dir = payload.dir;
  if (typeof payload.autostart === "boolean") cnl.autostart = payload.autostart;
  if (payload.passwords?.length) cnl.passwords = payload.passwords;
  if (payload.source) cnl.source = payload.source;

  const params = new URLSearchParams();
  params.set("cnl", JSON.stringify(cnl));
  await jdCall(`/flash/addcnl?${params.toString()}`, { method: "GET" });
}

async function addLinksDirectCompatibility(payload: DirectAddLinksPayload): Promise<void> {
  if (!directModeSupportsRemoteV2()) {
    await addLinksViaCnl({
      urls: payload.links ?? "",
      packageName: payload.packageName,
      dir: payload.destinationFolder,
      autostart: payload.autostart !== false,
      passwords: [payload.downloadPassword, payload.extractPassword].filter((x): x is string => Boolean(x)),
      source: "unraidclaw",
    });
    return;
  }

  try {
    await jdCall("/linkgrabberv2/addLinks", {
      method: "POST",
      body: JSON.stringify([payload]),
    });
  } catch (error) {
    const fallbackParams = new URLSearchParams();
    if (payload.links) fallbackParams.set("links", payload.links);
    if (payload.packageName) fallbackParams.set("packageName", payload.packageName);
    if (payload.destinationFolder) fallbackParams.set("destinationFolder", payload.destinationFolder);
    fallbackParams.set("autostart", String(payload.autostart !== false));
    const message = error instanceof Error ? error.message : String(error);
    try {
      await jdCall(`/linkgrabberv2/addLinks?${fallbackParams.toString()}`, { method: "GET" });
    } catch {
      throw new Error(`Failed to add links via JDownloader API. Last error: ${message}`);
    }
  }
}

function normalizePackage(item: any): JDownloaderPackageItem {
  return {
    uuid: item.uuid,
    name: item.name,
    saveTo: item.saveTo,
    downloadDirectory: item.downloadDirectory,
    bytesLoaded: item.bytesLoaded,
    bytesTotal: item.bytesTotal,
    childCount: item.childCount,
    enabled: item.enabled,
    finished: item.finished,
    running: item.running,
    speed: item.speed,
    eta: item.eta,
    status: item.status,
  };
}

function normalizeLink(item: any): JDownloaderLinkItem {
  return {
    uuid: item.uuid,
    name: item.name,
    url: item.url,
    status: item.status,
    bytesLoaded: item.bytesLoaded,
    bytesTotal: item.bytesTotal,
    enabled: item.enabled,
  };
}

export function registerJDownloaderRoutes(app: FastifyInstance): void {
  app.get("/api/integrations/jdownloader/status", {
    preHandler: requirePermission(Resource.JDOWNLOADER, Action.READ),
    handler: async (_req, reply) => {
      const cfg = getIntegrations().jdownloader;
      const containerState = cfg.containerName ? await dockerContainerState(cfg.containerName) : undefined;
      return reply.send({
        ok: true,
        data: {
          enabled: cfg.enabled,
          configured: Boolean(cfg.baseUrl || (cfg.email && cfg.deviceName)),
          mode: cfg.mode,
          containerName: cfg.containerName,
          containerState,
          deviceName: cfg.deviceName,
          baseUrl: cfg.baseUrl,
          downloadRoot: cfg.downloadRoot,
          pollIntervalMs: cfg.pollIntervalMs,
          deprecatedApiEnabled: cfg.deprecatedApiEnabled,
        },
      });
    },
  });

  app.get("/api/integrations/jdownloader/packages", {
    preHandler: requirePermission(Resource.JDOWNLOADER, Action.READ),
    handler: async (_req, reply) => {
      return reply.send({ ok: true, data: await getPackages() });
    },
  });

  app.get<{ Querystring: { packageUUIDs?: string } }>("/api/integrations/jdownloader/links", {
    preHandler: requirePermission(Resource.JDOWNLOADER, Action.READ),
    handler: async (req, reply) => {
      if (!directModeSupportsRemoteV2()) {
        return reply.send({ ok: true, data: [] });
      }
      const packageUUIDs = req.query.packageUUIDs
        ? req.query.packageUUIDs.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x))
        : [];
      const data = await queryApiCompat("/downloadsV2/queryLinks", [{ name: true, url: true, status: true, bytesLoaded: true, bytesTotal: true, enabled: true, packageUUIDs }]);
      return reply.send({ ok: true, data: Array.isArray(data) ? data.map(normalizeLink) : [] });
    },
  });

  app.post<{ Body: { links: string[]; packageName?: string; destinationFolder?: string; autoStart?: boolean } }>("/api/integrations/jdownloader/links", {
    preHandler: requirePermission(Resource.JDOWNLOADER, Action.CREATE),
    handler: async (req, reply) => {
      const cfg = getIntegrations().jdownloader;
      const packageName = req.body.packageName || `${cfg.defaultPackageNamePrefix || "OpenClaw"}-${Date.now()}`;
      const destinationFolder = req.body.destinationFolder || cfg.downloadRoot || "/mnt/user/downloads";
      const links = Array.isArray(req.body.links) ? req.body.links.filter(Boolean) : [];
      if (links.length === 0) {
        return reply.code(400).send({ ok: false, error: { code: "VALIDATION_ERROR", message: "At least one link is required" } });
      }
      await addLinksDirectCompatibility({
        links: links.join("\n"),
        packageName,
        destinationFolder,
        autostart: req.body.autoStart !== false,
        assignJobID: false,
      });
      return reply.send({ ok: true, data: { success: true, packageName, linksAdded: links.length } });
    },
  });

  app.post<{ Body: { enabled: boolean } }>("/api/integrations/jdownloader/pause", {
    preHandler: requirePermission(Resource.JDOWNLOADER, Action.UPDATE),
    handler: async (req, reply) => {
      if (!directModeSupportsRemoteV2()) {
        return reply.code(501).send({ ok: false, error: { code: "UNSUPPORTED", message: "Pause is not supported in current JDownloader direct mode without deprecated API" } });
      }
      await queryApiCompat("/downloadcontroller/pause", [req.body.enabled === true]);
      return reply.send({ ok: true, data: { paused: req.body.enabled === true } });
    },
  });

  app.post("/api/integrations/jdownloader/resume", {
    preHandler: requirePermission(Resource.JDOWNLOADER, Action.UPDATE),
    handler: async (_req, reply) => {
      if (!directModeSupportsRemoteV2()) {
        return reply.code(501).send({ ok: false, error: { code: "UNSUPPORTED", message: "Resume is not supported in current JDownloader direct mode without deprecated API" } });
      }
      await queryApiCompat("/downloadcontroller/start", []);
      return reply.send({ ok: true, data: { resumed: true } });
    },
  });

  app.post<{ Body: { packageName?: string; timeoutSeconds?: number } }>("/api/integrations/jdownloader/wait", {
    preHandler: requirePermission(Resource.JDOWNLOADER, Action.UPDATE),
    handler: async (req, reply) => {
      const cfg = getIntegrations().jdownloader;
      const timeoutMs = Math.max(1, Number(req.body.timeoutSeconds ?? 900)) * 1000;
      const pollMs = Math.max(1000, Number(cfg.pollIntervalMs ?? 5000));
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        const packages = await getPackages();
        const filtered = req.body.packageName
          ? packages.filter((pkg) => pkg.name === req.body.packageName)
          : packages;
        if (filtered.length > 0 && filtered.every((pkg) => pkg.finished || pkg.status === "Finished" || ((pkg.bytesTotal ?? 0) > 0 && pkg.bytesLoaded === pkg.bytesTotal))) {
          return reply.send({ ok: true, data: filtered });
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      return reply.code(408).send({ ok: false, error: { code: "TIMEOUT", message: "Timed out waiting for JDownloader package completion" } });
    },
  });
}
