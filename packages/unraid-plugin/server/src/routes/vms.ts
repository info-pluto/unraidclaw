import type { FastifyInstance } from "fastify";
import { Resource, Action } from "@unraidclaw/shared";
import type { VM } from "@unraidclaw/shared";
import type { GraphQLClient } from "../graphql-client.js";
import { requirePermission } from "../permissions.js";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

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

const VmCreateSchema = z.object({
  name: z.string().min(1),
  vdiskPath: z.string().min(1),
  vdiskSizeGb: z.number().int().positive(),
  memoryMiB: z.number().int().positive(),
  vcpus: z.number().int().positive(),
  osVariant: z.string().min(1).default("ubuntu24.04"),
  networkBridge: z.string().min(1).default("br0"),
  isoPath: z.string().min(1),
  machine: z.string().min(1).default("q35"),
  graphics: z.enum(["vnc", "spice", "none"]).default("vnc"),
  autostart: z.boolean().optional().default(false),
  diskBus: z.enum(["virtio", "sata", "scsi"]).default("virtio"),
  bootFirmware: z.enum(["ovmf", "seabios"]).default("ovmf"),
  extraDiskPath: z.string().min(1).optional(),
  extraDiskSizeGb: z.number().int().positive().optional(),
});

type VmCreateInput = z.infer<typeof VmCreateSchema>;

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

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function createQcowDisk(filePath: string, sizeGb: number): Promise<void> {
  await ensureParentDir(filePath);
  await execFileAsync("qemu-img", ["create", "-f", "qcow2", filePath, `${sizeGb}G`]);
}

function buildVirtInstallArgs(input: VmCreateInput): string[] {
  const args = [
    "--name", input.name,
    "--memory", String(input.memoryMiB),
    "--vcpus", String(input.vcpus),
    "--cpu", "host-passthrough",
    "--machine", input.machine,
    "--cdrom", input.isoPath,
    "--network", `bridge=${input.networkBridge},model=virtio`,
    "--disk", `path=${input.vdiskPath},bus=${input.diskBus},format=qcow2`,
    "--os-variant", input.osVariant,
    "--noautoconsole",
    "--check", "path_in_use=off",
  ];

  if (input.extraDiskPath) {
    args.push("--disk", `path=${input.extraDiskPath},bus=${input.diskBus},format=qcow2`);
  }

  if (input.bootFirmware === "ovmf") {
    args.push("--boot", "uefi");
  }

  if (input.graphics === "none") {
    args.push("--graphics", "none");
  } else if (input.graphics === "spice") {
    args.push("--graphics", "spice");
  } else {
    args.push("--graphics", "vnc,listen=0.0.0.0");
  }

  return args;
}

export function registerVMRoutes(app: FastifyInstance, gql: GraphQLClient): void {
  app.get("/api/vms", {
    preHandler: requirePermission(Resource.VMS, Action.READ),
    handler: async (_req, reply) => {
      const data = await gql.query<{ vms: { domains: VM[] } }>(LIST_QUERY);
      return reply.send({ ok: true, data: data.vms.domains });
    },
  });

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

  app.post<{ Body: VmCreateInput }>("/api/vms", {
    preHandler: requirePermission(Resource.VMS, Action.CREATE),
    handler: async (req, reply) => {
      try {
        const input = VmCreateSchema.parse(req.body ?? {});
        const data = await gql.query<{ vms: { domains: VM[] } }>(LIST_QUERY);
        const existing = data.vms.domains.find((d) => d.name.toLowerCase() === input.name.toLowerCase());
        if (existing) {
          return reply.status(409).send({
            ok: false,
            error: { code: "VM_ALREADY_EXISTS", message: `VM '${input.name}' already exists` },
          });
        }

        const resolvedPrimary = path.resolve(input.vdiskPath);
        if (!resolvedPrimary.startsWith("/mnt/")) {
          return reply.status(400).send({ ok: false, error: { code: "INVALID_DISK_PATH", message: "vdiskPath must be under /mnt" } });
        }
        const resolvedIso = path.resolve(input.isoPath);
        if (!resolvedIso.startsWith("/mnt/")) {
          return reply.status(400).send({ ok: false, error: { code: "INVALID_ISO_PATH", message: "isoPath must be under /mnt" } });
        }
        await fs.access(resolvedIso);

        let resolvedExtra: string | undefined;
        if (input.extraDiskPath) {
          resolvedExtra = path.resolve(input.extraDiskPath);
          if (!resolvedExtra.startsWith("/mnt/")) {
            return reply.status(400).send({ ok: false, error: { code: "INVALID_EXTRA_DISK_PATH", message: "extraDiskPath must be under /mnt" } });
          }
        }

        await createQcowDisk(resolvedPrimary, input.vdiskSizeGb);
        if (resolvedExtra && input.extraDiskSizeGb) {
          await createQcowDisk(resolvedExtra, input.extraDiskSizeGb);
        }

        const virtArgs = buildVirtInstallArgs({
          ...input,
          vdiskPath: resolvedPrimary,
          isoPath: resolvedIso,
          ...(resolvedExtra ? { extraDiskPath: resolvedExtra } : {}),
        });
        await execFileAsync("virt-install", virtArgs);
        if (input.autostart) {
          await execFileAsync("virsh", ["autostart", input.name]);
        }

        const { stdout } = await execFileAsync("virsh", ["domstate", input.name]).catch(() => ({ stdout: "shut off\n" }));
        return reply.send({
          ok: true,
          data: {
            id: input.name,
            name: input.name,
            state: stdout.trim(),
            uuid: "",
            vdiskPath: resolvedPrimary,
            extraDiskPath: resolvedExtra ?? null,
          },
        });
      } catch (err: any) {
        return reply.status(400).send({
          ok: false,
          error: { code: "VM_CREATE_FAILED", message: err.message },
        });
      }
    },
  });

  for (const [routePath, virshCmd] of Object.entries(VIRSH_ACTION_MAP)) {
    app.post<{ Params: { id: string } }>(`/api/vms/:id/${routePath}`, {
      preHandler: requirePermission(Resource.VMS, Action.UPDATE),
      handler: async (req, reply) => {
        try {
          await execFileAsync("virsh", [virshCmd, req.params.id]);
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

  app.delete<{ Params: { id: string } }>("/api/vms/:id", {
    preHandler: requirePermission(Resource.VMS, Action.DELETE),
    handler: async (req, reply) => {
      try {
        const { stdout: xml } = await execFileAsync("virsh", ["dumpxml", req.params.id]);
        const vmName = extractVmName(xml) ?? req.params.id;
        const diskPaths = extractFileBackedDiskPaths(xml);
        const undefineArgs = ["undefine", req.params.id];
        if (hasNvram(xml)) undefineArgs.push("--nvram");

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
