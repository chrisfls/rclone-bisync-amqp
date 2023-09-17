import { AmqpConnectOptions } from "./deps.ts";

export type Config = {
  connection: AmqpConnectOptions;
  hosts: Hosts;
  filters?: string[];
  debounce?: number;
};

export type Hosts = {
  [hosname: string]: Folders;
};

export type Folders = {
  [remote: string]: Folder;
};

export type Folder = {
  path: string;
  filters?: string[];
  debounce?: number;
};
