import type { FastifyInstance } from "fastify";
import { Resource, Action } from "@unraidclaw/shared";
import type { VM } from "@unraidclaw/shared";
import type { GraphQLClient } from "../graphql-client.js";
import { requirePermission } from "../permissions.js";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const LIST_QUERY = `query {
  vms {
    domains {
      id
      name
      state
      uuid
    }
  }
}`;

const VIRSH_ACTION_MAP: Record<string, string> = {
  start: "start",
  stop: "shutdown",
  "force-stop": "destroy",
  pause: "suspend",
  resume: "resume",
  reboot: "reboot",
  reset: "reset",
};

function extractVmName(xml: string): string | undefined {
  return xml.match(/<name>([^<]+)<\/name>/)?.[1];
}

function hasNvram(xml: string): boolean {
  return /<nvram\b[^>]*>[^<]+<\/nvram>/.test(xml);
}

function extractFileBackedDiskPaths(xml: string): string[] {
  const diskPaths = new Set<string>();
  const diskBlockRegex = /<disk\b[^>]*type=['"]file['"][^>]*device=['"]disk['"][^>]*>([\s\S]*?)<\/disk>/g;

  for (const match of xml.matchAll(diskBlockRegex)) {
    const block = match[1] ?? "";
    const source = block.match(/<source\b[^>]*file=['"]([^'"]+)['"][^>]*\/?/);
    if (!source?.[1]) continue;
    diskPaths.add(source[1]);
  }

  return [...diskPaths];
}

async function removeVmDiskFiles(diskPaths: string[]): Promise<string[]> {
  const deleted: string[] = [];

  for (const diskPath of diskPaths) {
    const resolvedPath = path.resolve(diskPath);
    if (!resolvedPath.startsWith("/mnt/")) continue;

    await fs.rm(resolvedPath, { force: true });
    deleted.push(resolvedPath);

    const parentDir = path.dirname(resolvedPath);
    if (!parentDir.startsWith("/mnt/")) continue;
    await fs.rmdir(parentDir).catch(() => {});
  }

  return deleted;
}

export function registerVMRoutes(app: FastifyInstance, gql: GraphQLClient): void {
  // List VMs
  app.get("/api/vms", {
    preHandler: requirePermission(Resource.VMS, Action.READ),
    handler: async (_req, reply) => {
      const data = await gql.query<{ vms: { domains: VM[] } }>(LIST_QUERY);
      return reply.send({ ok: true, data: data.vms.domains });
    },
  });

  // Get VM details (filter from list)
  app.get<{ Params: { id: string } }>("/api/vms/:id", {
    preHandler: requirePermission(Resource.VMS, Action.READ),
    handler: async (req, reply) => {
      const data = await gql.query<{ vms: { domains: VM[] } }>(LIST_QUERY);
      const search = req.params.id.toLowerCase();
      const vm = data.vms.domains.find(
        (d) => d.name.toLowerCase() === search || d.uuid === req.params.id || d.id === req.params.id
      );
      if (!vm) {
        return reply.status(404).send({
          ok: false,
          error: { code: "NOT_FOUND", message: `VM '${req.params.id}' not found` },
        });
      }
      return reply.send({ ok: true, data: vm });
    },
  });

  // VM actions via virsh CLI
  for (const [path, virshCmd] of Object.entries(VIRSH_ACTION_MAP)) {
    app.post<{ Params: { id: string } }>(`/api/vms/:id/${path}`, {
      preHandler: requirePermission(Resource.VMS, Action.UPDATE),
      handler: async (req, reply) => {
        try {
          await execFileAsync("virsh", [virshCmd, req.params.id]);
          // Fetch updated state from virsh
          const { stdout } = await execFileAsync("virsh", ["domstate", req.params.id]);
          const state = stdout.trim();
          return reply.send({
            ok: true,
            data: { id: req.params.id, name: req.params.id, state, uuid: "" },
          });
        } catch (err: any) {
          return reply.status(400).send({
            ok: false,
            error: { code: "VM_ACTION_FAILED", message: err.message },
          });
        }
      },
    });
  }

  // Remove VM (destructive) via virsh
  app.delete<{ Params: { id: string } }>("/api/vms/:id", {
    preHandler: requirePermission(Resource.VMS, Action.DELETE),
    handler: async (req, reply) => {
      try {
        const { stdout: xml } = await execFileAsync("virsh", ["dumpxml", req.params.id]);
        const vmName = extractVmName(xml) ?? req.params.id;
        const diskPaths = extractFileBackedDiskPaths(xml);
        const undefineArgs = ["undefine", req.params.id];
        if (hasNvram(xml)) undefineArgs.push("--nvram");

        // Force-stop first if running, then undefine and remove file-backed disks.
        await execFileAsync("virsh", ["destroy", req.params.id]).catch(() => {});
        await execFileAsync("virsh", undefineArgs);
        const deletedDisks = await removeVmDiskFiles(diskPaths);

        return reply.send({
          ok: true,
          data: { id: req.params.id, name: vmName, deletedDisks },
        });
      } catch (err: any) {
        return reply.status(400).send({
          ok: false,
          error: { code: "VM_REMOVE_FAILED", message: err.message },
        });
      }
    },
  });
}
