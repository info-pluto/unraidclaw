// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ClientResolver } from "../index.js";
import { textResult, errorResult } from "./util.js";

export function registerJDownloaderTools(api: any, getClient: ClientResolver): void {
  api.registerTool({
    name: "unraid_jd_status",
    description: "Get JDownloader integration status including mode, container state, and basic configuration.",
    parameters: {
      type: "object",
      properties: {
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        return textResult(await getClient(params.server as string | undefined).get("/api/integrations/jdownloader/status"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_jd_add_links",
    description: "Add one or more links to JDownloader. Optionally set package name, destination folder, and whether to auto-start.",
    parameters: {
      type: "object",
      properties: {
        links: { type: "array", items: { type: "string" }, description: "List of URLs to add" },
        packageName: { type: "string", description: "Optional package name" },
        destinationFolder: { type: "string", description: "Optional destination folder" },
        autoStart: { type: "boolean", description: "Start downloads automatically (default: true)" },
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
      required: ["links"],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const { server, ...body } = params;
        return textResult(await getClient(server as string | undefined).post("/api/integrations/jdownloader/links", body));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_jd_list_packages",
    description: "List JDownloader download packages with progress, destination, status, speed, and ETA.",
    parameters: {
      type: "object",
      properties: {
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        return textResult(await getClient(params.server as string | undefined).get("/api/integrations/jdownloader/packages"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_jd_list_links",
    description: "List JDownloader links. Optionally filter by package UUIDs.",
    parameters: {
      type: "object",
      properties: {
        packageUUIDs: {
          type: "array",
          items: { type: "number" },
          description: "Optional package UUIDs to filter links",
        },
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const query: Record<string, string> = {};
        if (Array.isArray(params.packageUUIDs) && params.packageUUIDs.length > 0) {
          query.packageUUIDs = (params.packageUUIDs as unknown[]).join(",");
        }
        return textResult(await getClient(params.server as string | undefined).get("/api/integrations/jdownloader/links", query));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_jd_pause",
    description: "Pause or unpause JDownloader's download controller.",
    parameters: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "True to pause, false to unpause" },
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
      required: ["enabled"],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const { server, ...body } = params;
        return textResult(await getClient(server as string | undefined).post("/api/integrations/jdownloader/pause", body));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_jd_resume",
    description: "Resume JDownloader downloads.",
    parameters: {
      type: "object",
      properties: {
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        return textResult(await getClient(params.server as string | undefined).post("/api/integrations/jdownloader/resume"));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_jd_wait_for_package",
    description: "Wait until a JDownloader package finishes downloading, optionally filtered by package name.",
    parameters: {
      type: "object",
      properties: {
        packageName: { type: "string", description: "Optional exact package name to wait for" },
        timeoutSeconds: { type: "number", description: "Timeout in seconds (default: 900)" },
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const { server, ...body } = params;
        return textResult(await getClient(server as string | undefined).post("/api/integrations/jdownloader/wait", body));
      } catch (err) {
        return errorResult(err);
      }
    },
  });
}
