export async function bisync(
  local: string,
  remote: string,
  filters: string,
  resync: boolean,
) {
  return await new Deno.Command("rclone", {
    args: [
      "bisync",
      "-v",
      local,
      remote,
      resync ? "--resync" : "--resilient",
      "--filters-file",
      filters,
      "--create-empty-src-dirs",
      "--force",
    ],
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().output();
}
