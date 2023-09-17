export async function test(file: string, filters: string): Promise<boolean> {
  const results = await new Deno.Command("rclone", {
    args: ["lsf", file, "--filter-from", filters],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!results.success) return false;
  return results.stdout.length < 2;
}
