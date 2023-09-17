import { path } from "./deps.ts";

const decoder = new TextDecoder();

export async function bisync(
  local: string,
  remote: string,
  filters: string,
  resync: boolean,
  logs: string,
): Promise<{ broadcast: boolean; output: Deno.CommandOutput }> {
  const output = await new Deno.Command("rclone", {
    args: [
      "bisync",
      local,
      remote,
      resync ? "--resync" : "--resilient",
      "--filters-file",
      filters,
      "--create-empty-src-dirs",
      "--force",
      "-v"
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();

  const stderr = decoder.decode(output.stderr);
  const [, changes] = /Path1:\s+(\d+)\schanges\:/gm.exec(stderr) ?? [];
  const broadcast = (+changes) > 0;

  const file = path.join(logs, new Date().toISOString().replaceAll(":", "_"));

  await Deno.writeTextFile(`${file}.stdout.txt`, decoder.decode(output.stdout));
  await Deno.writeTextFile(`${file}.stderr.txt`, stderr);

  return { broadcast, output };
}
