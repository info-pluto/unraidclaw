// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ClientResolver } from "../index.js";
import { textResult, errorResult } from "./util.js";

export function registerHostTools(api: any, getClient: ClientResolver): void {
  api.registerTool({
    name: "unraid_exec",
    description: "Run a shell command directly on the Unraid host. This is highly privileged and can change the host system.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute on the Unraid host" },
        cwd: { type: "string", description: "Optional working directory on the Unraid host" },
        timeoutSeconds: { type: "number", description: "Optional timeout in seconds (default: 300, max: 3600)" },
        server: { type: "string", description: "Target server name (optional, uses default server)" },
        ask: { type: "string", enum: ["always"], description: "Always ask for confirmation before running privileged host commands." },
      },
      required: ["command", "ask"],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        return textResult(await getClient(params.server as string | undefined).post("/api/host/exec", {
          command: params.command,
          cwd: params.cwd,
          timeoutSeconds: params.timeoutSeconds,
        }));
      } catch (err) {
        return errorResult(err);
      }
    },
  });
}
