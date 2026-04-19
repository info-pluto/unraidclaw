export enum Resource {
  DOCKER = "docker",
  JDOWNLOADER = "jdownloader",
  VMS = "vms",
  ARRAY = "array",
  DISK = "disk",
  SHARE = "share",
  HOST = "host",
  INFO = "info",
  OS = "os",
  SERVICES = "services",
  NOTIFICATION = "notification",
  NETWORK = "network",
  ME = "me",
  LOGS = "logs",
  FILES = "files",
}

export enum Action {
  READ = "read",
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}

export type PermissionKey = `${Resource}:${Action}`;

export interface PermissionMeta {
  key: PermissionKey;
  label: string;
  description: string;
  destructive?: boolean;
}

export interface PermissionCategory {
  name: string;
  description: string;
  permissions: PermissionMeta[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    name: "Docker",
    description: "Manage Docker containers",
    permissions: [
      { key: "docker:read", label: "List & Inspect", description: "List containers, view details and logs" },
      { key: "docker:create", label: "Create", description: "Create and start new containers" },
      { key: "docker:update", label: "Control", description: "Start, stop, restart, pause, unpause containers" },
      { key: "docker:delete", label: "Remove", description: "Remove containers", destructive: true },
    ],
  },
  {
    name: "JDownloader",
    description: "Manage JDownloader downloads and link grabbing",
    permissions: [
      { key: "jdownloader:read", label: "View Status", description: "View JDownloader status, packages, links, and configuration state" },
      { key: "jdownloader:create", label: "Add Links", description: "Add links or packages to JDownloader" },
      { key: "jdownloader:update", label: "Control", description: "Pause, resume, clean up, and wait for downloads" },
    ],
  },
  {
    name: "Virtual Machines",
    description: "Manage VMs / libvirt domains",
    permissions: [
      { key: "vms:read", label: "List & Inspect", description: "List VMs and view details" },
      { key: "vms:create", label: "Create", description: "Create new VMs and their file-backed virtual disks", destructive: true },
      { key: "vms:update", label: "Control", description: "Start, stop, pause, resume, reboot VMs" },
      { key: "vms:delete", label: "Remove", description: "Remove VMs", destructive: true },
    ],
  },
  {
    name: "Array & Storage",
    description: "Array operations and disk information",
    permissions: [
      { key: "array:read", label: "Array Status", description: "View array state, capacity, and disk status" },
      { key: "array:update", label: "Array Operations", description: "Start/stop array, parity check control" },
      { key: "disk:read", label: "Disk Info", description: "View individual disk details and SMART data" },
      { key: "share:read", label: "List Shares", description: "List and view share configurations" },
      { key: "share:update", label: "Edit Share Settings", description: "Update share comment, allocator, split level, floor" },
    ],
  },
  {
    name: "System",
    description: "System information and control",
    permissions: [
      { key: "info:read", label: "System Info", description: "View system info, CPU, memory, uptime" },
      { key: "os:update", label: "Power Control", description: "Reboot or shutdown the server", destructive: true },
      { key: "services:read", label: "List Services", description: "View running services" },
    ],
  },
  {
    name: "Host Execution",
    description: "Run shell commands directly on the Unraid host",
    permissions: [
      { key: "host:update", label: "Run Commands", description: "Execute arbitrary shell commands on the Unraid host", destructive: true },
    ],
  },
  {
    name: "Notifications",
    description: "System notifications",
    permissions: [
      { key: "notification:read", label: "View", description: "List and read notifications" },
      { key: "notification:create", label: "Create", description: "Create new notifications" },
      { key: "notification:update", label: "Archive", description: "Archive notifications" },
      { key: "notification:delete", label: "Delete", description: "Delete notifications" },
    ],
  },
  {
    name: "Network",
    description: "Network information",
    permissions: [
      { key: "network:read", label: "View", description: "View network interfaces and configuration" },
    ],
  },
  {
    name: "Users",
    description: "User information",
    permissions: [
      { key: "me:read", label: "My Info", description: "View current user information" },
    ],
  },
  {
    name: "Logs",
    description: "System logs",
    permissions: [
      { key: "logs:read", label: "System Logs", description: "View syslog entries" },
    ],
  },
  {
    name: "Files",
    description: "Manage files and directories on Unraid shares",
    permissions: [
      { key: "files:read", label: "List & Read Files", description: "List directory contents and read files" },
      { key: "files:create", label: "Write Files", description: "Create and write file contents", destructive: true },
      { key: "files:update", label: "Update Files", description: "Update existing file contents", destructive: true },
      { key: "files:delete", label: "Delete Files/Directories", description: "Delete files or directories", destructive: true },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_CATEGORIES.flatMap(
  (cat) => cat.permissions.map((p) => p.key)
);

export const DESTRUCTIVE_PERMISSIONS: PermissionKey[] = PERMISSION_CATEGORIES.flatMap(
  (cat) => cat.permissions.filter((p) => p.destructive).map((p) => p.key)
);

interface UnraidClient {
  get(path: string, query?: Record<string, string>): Promise<any>;
  post(path: string, body?: any): Promise<any>;
  delete(path: string, query?: Record<string, string>): Promise<any>;
}

export async function listPath(client: UnraidClient, path: string): Promise<{ files: string[] }> {
  const response = await client.get(`/api/files/list`, { path });
  return response;
}

export async function readPath(client: UnraidClient, path: string): Promise<{ content: string }> {
  const response = await client.get(`/api/files/read`, { path });
  return response;
}

export async function createPath(client: UnraidClient, path: string, content: string): Promise<{ status: string }> {
  const response = await client.post(`/api/files/write`, { path, content });
  return response;
}

export async function deletePath(client: UnraidClient, path: string, recursive: boolean = false): Promise<{ status: string }> {
  const response = await client.delete(`/api/files/delete`, { path, recursive: String(recursive) });
  return response;
}
