import type { FastifyInstance } from "fastify";
import { Resource, Action, isPermitted } from "@unraidclaw/shared";
import { requirePermission } from "../permissions.js";
import { getPermissions } from "../config.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const filePathSchema = z.object({
  path: z.string(),
});

const writeFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export function registerFileRoutes(app: FastifyInstance): void {
  app.get("/api/files/list", {
    preHandler: requirePermission(Resource.FILES, Action.READ),
    handler: async (req, reply) => {
      try {
        const query = filePathSchema.parse(req.query);
        const resolvedPath = path.resolve(query.path);
        
        // Ensure path starts with /mnt/ to prevent reading outside of array/shares if wanted, 
        // but for now let's just use it as is since it requires explicit permissions.
        const files = await fs.readdir(resolvedPath, { withFileTypes: true });
        const result = files.map(f => ({
          name: f.name,
          isDirectory: f.isDirectory(),
          isFile: f.isFile(),
        }));
        
        reply.send({ ok: true, data: result });
      } catch (error: any) {
        app.log.error(`Error listing directory: ${error.message}`);
        reply.status(400).send({ ok: false, error: { code: "FILE_ACTION_FAILED", message: error.message } });
      }
    },
  });

  app.get("/api/files/read", {
    preHandler: requirePermission(Resource.FILES, Action.READ),
    handler: async (req, reply) => {
      try {
        const query = filePathSchema.parse(req.query);
        const resolvedPath = path.resolve(query.path);
        const content = await fs.readFile(resolvedPath, "utf-8");
        reply.send({ ok: true, data: { content } });
      } catch (error: any) {
        app.log.error(`Error reading file: ${error.message}`);
        reply.status(400).send({ ok: false, error: { code: "FILE_ACTION_FAILED", message: error.message } });
      }
    },
  });

  app.post("/api/files/write", {
    handler: async (req, reply) => {
      try {
        const body = writeFileSchema.parse(req.body);
        const resolvedPath = path.resolve(body.path);
        const permissions = getPermissions();
        const fileExists = await fs.stat(resolvedPath).then(() => true).catch(() => false);
        const requiredAction = fileExists ? Action.UPDATE : Action.CREATE;

        if (!isPermitted(permissions, Resource.FILES, requiredAction)) {
          return reply.status(403).send({
            ok: false,
            error: {
              code: "FORBIDDEN",
              message: `Permission denied: ${Resource.FILES}:${requiredAction}`,
            },
          });
        }

        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, body.content, "utf-8");
        reply.send({ ok: true, data: { status: fileExists ? "updated" : "created" } });
      } catch (error: any) {
        app.log.error(`Error writing file: ${error.message}`);
        reply.status(400).send({ ok: false, error: { code: "FILE_ACTION_FAILED", message: error.message } });
      }
    },
  });

  app.delete("/api/files/delete", {
    preHandler: requirePermission(Resource.FILES, Action.DELETE),
    handler: async (req, reply) => {
      try {
        const query = filePathSchema.parse(req.query);
        const resolvedPath = path.resolve(query.path);
        const recursive = (req.query as any).recursive === 'true';
        
        const stat = await fs.stat(resolvedPath);
        if (stat.isDirectory()) {
          await fs.rm(resolvedPath, { recursive, force: true });
        } else {
          await fs.unlink(resolvedPath);
        }
        
        reply.send({ ok: true, data: { status: "success" } });
      } catch (error: any) {
        app.log.error(`Error deleting file/directory: ${error.message}`);
        reply.status(400).send({ ok: false, error: { code: "FILE_ACTION_FAILED", message: error.message } });
      }
    },
  });
}
