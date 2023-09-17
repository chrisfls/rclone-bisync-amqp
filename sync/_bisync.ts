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
      "--log-level",
      "INFO",
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();

  const stdout = decoder.decode(output.stdout);
  const [, changes] = /Path1:\s+(\d+)\schanges\:/gm.exec(stdout) ?? [];
  const broadcast = (+changes) > 0;

  const file = path.join(logs, new Date().toISOString().replaceAll(":", "_"));

  await Deno.writeTextFile(`${file}.stdout.txt`, stdout);
  await Deno.writeTextFile(`${file}.stderr.txt`, decoder.decode(output.stderr));

  return { broadcast, output };
}
