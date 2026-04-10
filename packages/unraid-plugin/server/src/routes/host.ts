import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { Resource, Action } from "@unraidclaw/shared";
import { requirePermission } from "../permissions.js";

const execFileAsync = promisify(execFile);

const execSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeoutSeconds: z.number().int().min(1).max(3600).optional(),
});

export function registerHostRoutes(app: FastifyInstance): void {
  app.post("/api/host/exec", {
    preHandler: requirePermission(Resource.HOST, Action.UPDATE),
    handler: async (req, reply) => {
      try {
        const body = execSchema.parse(req.body);
        const timeoutMs = (body.timeoutSeconds ?? 300) * 1000;

        try {
          const { stdout, stderr } = await execFileAsync("/bin/bash", ["-lc", body.command], {
            cwd: body.cwd,
            timeout: timeoutMs,
            maxBuffer: 10 * 1024 * 1024,
          });

          return reply.send({
            ok: true,
            data: {
              command: body.command,
              cwd: body.cwd ?? null,
              timeoutSeconds: body.timeoutSeconds ?? 300,
              exitCode: 0,
              signal: null,
              stdout,
              stderr,
            },
          });
        } catch (error: any) {
          return reply.send({
            ok: true,
            data: {
              command: body.command,
              cwd: body.cwd ?? null,
              timeoutSeconds: body.timeoutSeconds ?? 300,
              exitCode: typeof error?.code === "number" ? error.code : null,
              signal: error?.signal ?? null,
              stdout: error?.stdout ?? "",
              stderr: error?.stderr ?? error?.message ?? "",
              timedOut: Boolean(error?.killed && error?.signal === "SIGTERM"),
            },
          });
        }
      } catch (error: any) {
        app.log.error(`Error executing host command: ${error.message}`);
        return reply.status(400).send({ ok: false, error: { code: "HOST_EXEC_FAILED", message: error.message } });
      }
    },
  });
}
