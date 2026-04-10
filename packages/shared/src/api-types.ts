// ── Health ──────────────────────────────────────────────────────
export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  version: string;
  uptime: number;
  graphqlReachable: boolean;
}

// ── Docker ─────────────────────────────────────────────────────
export interface DockerContainer {
  id: string;
  names: string[];
  image: string;
  state: string;
  status: string;
  autoStart: boolean;
}

export interface DockerContainerDetail extends DockerContainer {
  ports: DockerPort[];
  mounts: DockerMount[];
  networkMode: string;
}

export interface DockerPort {
  ip: string;
  privatePort: number;
  publicPort: number;
  type: string;
}

export interface DockerMount {
  source: string;
  destination: string;
  mode: string;
}

export interface DockerActionResponse {
  id: string;
  names: string[];
  state: string;
  status: string;
}

export interface DockerLogsRequest {
  tail?: number;
  since?: string;
}

export interface DockerLogsResponse {
  id: string;
  logs: string;
}

// ── JDownloader ────────────────────────────────────────────────
export interface JDownloaderConfig {
  enabled: boolean;
  mode: "direct" | "myjd";
  baseUrl?: string;
  deviceName?: string;
  email?: string;
  password?: string;
  containerName?: string;
  downloadRoot?: string;
  defaultPackageNamePrefix?: string;
  pollIntervalMs?: number;
}

export interface JDownloaderStatus {
  enabled: boolean;
  configured: boolean;
  mode: "direct" | "myjd";
  containerName?: string;
  containerState?: string;
  deviceName?: string;
  baseUrl?: string;
  downloadRoot?: string;
  pollIntervalMs?: number;
}

export interface JDownloaderLinkItem {
  uuid?: string;
  name?: string;
  url?: string;
  status?: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  enabled?: boolean;
}

export interface JDownloaderPackageItem {
  uuid?: string;
  name?: string;
  saveTo?: string;
  downloadDirectory?: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  childCount?: number;
  enabled?: boolean;
  finished?: boolean;
  running?: boolean;
  speed?: number;
  eta?: number;
  status?: string;
}

export interface JDownloaderAddLinksRequest {
  links: string[];
  packageName?: string;
  destinationFolder?: string;
  autoStart?: boolean;
}

export interface JDownloaderAddLinksResponse {
  success: boolean;
  packageName?: string;
  linksAdded: number;
}

// ── VMs ────────────────────────────────────────────────────────
export interface VM {
  id: string;
  name: string;
  state: string;
  uuid: string;
  coreCount: number;
  ramAllocation: string;
  primaryGPU: string;
  description: string;
  autoStart: boolean;
}

export interface VMActionResponse {
  id: string;
  name: string;
  state: string;
  uuid: string;
}

// ── Array ──────────────────────────────────────────────────────
export interface ArrayStatus {
  state: string;
  capacity: {
    kilobytes: { free: string; used: string; total: string };
    disks: { free: string; used: string; total: string };
  };
  disks: ArrayDisk[];
  parityChecks: ParityCheck[];
}

export interface ArrayDisk {
  id: string;
  name: string;
  device: string;
  size: string;
  status: string;
  temp: number | null;
  fsType: string;
  color: string;
}

export interface ParityCheck {
  date: string;
  duration: string;
  speed: string;
  status: string;
  errors: number;
}

export interface ParityActionResponse {
  success: boolean;
  message: string;
}

// ── Disks ──────────────────────────────────────────────────────
export interface DiskInfo {
  id: string;
  name: string;
  device: string;
  size: string;
  temp: number | null;
  status: string;
  fsType: string;
  smart: SmartData | null;
}

export interface SmartData {
  health: string;
  temperature: number | null;
  powerOnHours: number | null;
  attributes: SmartAttribute[];
}

export interface SmartAttribute {
  id: number;
  name: string;
  value: number;
  worst: number;
  threshold: number;
  raw: string;
}

// ── Shares ─────────────────────────────────────────────────────
export interface Share {
  name: string;
  comment: string;
  allocator: string;
  floor: string;
  splitLevel: string;
  include: string[];
  exclude: string[];
  useCache: string;
  free: string;
  used: string;
  size: string;
}

export interface UpdateShareRequest {
  comment?: string;
  allocator?: string;
  floor?: string;
  splitLevel?: string;
}

// ── System ─────────────────────────────────────────────────────
export interface SystemInfo {
  os: {
    platform: string;
    hostname: string;
    uptime: number;
    version: string;
  };
  cpu: {
    model: string;
    cores: number;
    threads: number;
    frequency: string;
  };
  memory: {
    total: string;
    used: string;
    free: string;
    cached: string;
  };
  versions: {
    unraid: string;
    kernel: string;
  };
}

export interface SystemMetrics {
  cpu: { usage: number; loadAverage: number[] };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number; usagePercent: number };
  uptime: number;
}

export interface ServiceInfo {
  name: string;
  state: string;
  autoStart: boolean;
}

// ── Notifications ──────────────────────────────────────────────
export interface Notification {
  id: string;
  title: string;
  subject: string;
  description: string;
  importance: "alert" | "warning" | "normal";
  type: string;
  timestamp: string;
  archived: boolean;
}

export interface CreateNotificationRequest {
  title: string;
  subject: string;
  description: string;
  importance?: "alert" | "warning" | "normal";
  type?: string;
}

// ── Network ────────────────────────────────────────────────────
export interface NetworkInterface {
  name: string;
  mac: string;
  ipv4: string[];
  ipv6: string[];
  state: string;
  speed: string;
}

export interface NetworkInfo {
  hostname: string;
  gateway: string;
  dns: string[];
  interfaces: NetworkInterface[];
}

// ── Users ──────────────────────────────────────────────────────
export interface CurrentUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

// ── Logs ───────────────────────────────────────────────────────
export interface SyslogEntry {
  timestamp: string;
  host: string;
  process: string;
  message: string;
}

// ── Files ──────────────────────────────────────────────────────
export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
}

export interface FileListResponse {
  path: string;
  entries: FileEntry[];
}

export interface FileReadResponse {
  path: string;
  content: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

export interface ApiError {
  ok: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
