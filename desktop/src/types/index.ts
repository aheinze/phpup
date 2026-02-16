import type { Child } from "@tauri-apps/plugin-shell";

export interface Project {
  id: string;
  name: string;
  path: string;
  port: string;
  isRunning: boolean;
  status: ProjectStatus;
  hasConfig: boolean;
  docroot: string;
  groupId?: string;
  favicon?: string;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface RunningProcess {
  project: Project;
  child: Child;
  output: string[];
}

export type ProjectStatus = "stopped" | "starting" | "running" | "crashed";

export interface ProjectSettings {
  host: string;
  port: string;
  domain: string;
  docroot: string;
  phpThreads: string;
  httpsMode: "off" | "local" | "on";
  workerMode: boolean;
  watchMode: boolean;
  compression: boolean;
  openBrowser: boolean;
  xdebug: boolean;
}
