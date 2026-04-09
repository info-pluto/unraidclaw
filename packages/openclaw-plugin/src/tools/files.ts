// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { ClientResolver } from "../index.js";
import { textResult, errorResult } from "./util.js";

export function registerFileTools(api: any, getClient: ClientResolver): void {
  api.registerTool({
    name: "unraid_list_directory",
    description: "List contents of a directory on an Unraid share.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the directory on the Unraid share (e.g., /mnt/user/MyShare)" },
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
      required: ["path"],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const query = new URLSearchParams({ path: params.path as string }).toString();
        return textResult(await getClient(params.server as string | undefined).get(`/api/files/list?${query}`));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_read_file",
    description: "Read the content of a file on an Unraid share.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file on the Unraid share" },
        server: { type: "string", description: "Target server name (optional, uses default server)" },
      },
      required: ["path"],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const query = new URLSearchParams({ path: params.path as string }).toString();
        return textResult(await getClient(params.server as string | undefined).get(`/api/files/read?${query}`));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_write_file",
    description: "Write content to a file on an Unraid share. Creates or overwrites.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file on the Unraid share" },
        content: { type: "string", description: "Content to write" },
        server: { type: "string", description: "Target server name (optional)" },
        ask: { type: "string", enum: ["always"], description: "Always ask for confirmation before writing to prevent data loss." },
      },
      required: ["path", "content", "ask"],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        return textResult(await getClient(params.server as string | undefined).post("/api/files/write", {
          path: params.path,
          content: params.content,
        }));
      } catch (err) {
        return errorResult(err);
      }
    },
  });

  api.registerTool({
    name: "unraid_delete_file",
    description: "Delete a file or an empty directory on an Unraid share.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file or directory" },
        recursive: { type: "boolean", description: "Set to true to delete a non-empty directory recursively." },
        server: { type: "string", description: "Target server name (optional)" },
        ask: { type: "string", enum: ["always"], description: "Always ask for confirmation before deleting to prevent data loss." },
      },
      required: ["path", "ask"],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const query = new URLSearchParams({ path: params.path as string });
        if (params.recursive) query.append('recursive', 'true');
        return textResult(await getClient(params.server as string | undefined).delete(`/api/files/delete?${query.toString()}`));
      } catch (err) {
        return errorResult(err);
      }
    },
  });
}
