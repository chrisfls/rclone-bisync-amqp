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

  const check = await new Deno.Command("rclone", {
    args: [
      "cryptcheck", // TODO: parameterize "check" | "cryptcheck"
      local,
      remote,
      "--one-way",
      "--filter-from",
      filters,
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();

  const broadcast = decoder.decode(check.stderr).includes(
    "Failed to cryptcheck:",
  );

  const sync = await new Deno.Command("rclone", {
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

  return { broadcast, output: sync };
}
