import { path } from "./deps.ts";

const decoder = new TextDecoder();

export type Changeset = {
  create: string[];
  modify: string[];
  remove: string[];
};

export async function bisync(
  local: string,
  remote: string,
  filters: string,
  resync: boolean,
  logs: string,
): Promise<{
  output: Deno.CommandOutput;
  changed: boolean;
  changeset: Changeset;
}> {
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
      "-v",
    ],
    stdin: "null",
    stdout: "null",
    stderr: "piped",
  }).output();

  const stderr = decoder.decode(output.stderr);
  const [, remoteChanges] = /Path1:\s+(\d+)\schanges\:/gm.exec(stderr) ?? [];

  const changed = (+remoteChanges) > 0;
  const create: string[] = [];
  const modify: string[] = [];
  const remove: string[] = [];

  if (changed) {
    const changeset = stderr.matchAll(
      /^.+INFO\s\s\:\s(.+)\:\s(Deleted|Copied\s\(new\)|Copied\s\(replaced existing\)|)$/gm,
    );

    for (const [, rawPath, kind] of changeset) {
      const normPath = path.normalize(rawPath);
      switch (kind) {
        case "Copied (new)":
          create.push(normPath);
          modify.push(normPath); // fixes dual notifications on windows  .-.
          break;
        case "Copied (replaced existing)":
          modify.push(normPath);
          remove.push(normPath); // fixes dual notifications on windows  .-.
          break;
        case "Deleted":
          remove.push(normPath);
          break;
      }
    }
  }

  await Deno.writeTextFile(
    path.join(logs, new Date().toISOString().replaceAll(":", "_")) + ".txt",
    stderr,
  );

  return { output, changed, changeset: { create, modify, remove } };
}
