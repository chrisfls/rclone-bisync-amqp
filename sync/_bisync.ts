import { path } from "./deps.ts";

export async function bisync(
  local: string,
  remote: string,
  filters: string,
  resync: boolean,
  logs: string,
) {
  const file = path.join(
    logs,
    `${new Date().toISOString().replaceAll(":", "_")}.txt`,
  );

  return await new Deno.Command("rclone", {
    args: [
      "bisync",
      local,
      remote,
      resync ? "--resync" : "--resilient",
      "--filters-file",
      filters,
      "--create-empty-src-dirs",
      "--force",
      `--log-file=${file}`,
      "--log-level",
      "INFO",
    ],
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn().output();
}
