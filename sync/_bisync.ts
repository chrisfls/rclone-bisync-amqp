import { path } from "./deps.ts";

const decoder = new TextDecoder();

export async function bisync(
  local: string,
  remote: string,
  filters: string,
  resync: boolean,
  logs: string,
): Promise<{ broadcast: boolean; output: Deno.CommandOutput }> {
  const file = path.join(
    logs,
    `${new Date().toISOString().replaceAll(":", "_")}.txt`,
  );

  const args = [
    "bisync",
    local,
    remote,
    resync ? "--resync" : "--resilient",
    "--filters-file",
    filters,
    "--create-empty-src-dirs",
    "--force",
  ];

  const check = await new Deno.Command("rclone", {
    args: [
      ...args,
      "--dry-run",
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();

  if (!check.success || !decoder.decode(check.stdout).includes("--dry-run")) {
    return { broadcast: false, output: check };
  }

  const sync = await new Deno.Command("rclone", {
    args: [
      ...args,
      `--log-file=${file}`,
      "--log-level",
      "INFO",
    ],
    stdin: "null",
    stdout: "null",
    stderr: "null",
  }).spawn().output();

  return { broadcast: true, output: sync };
}
