export async function ensure(file: string) {
  try {
    await Deno.stat(file);
    return true;
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
    await Deno.writeTextFile(file, "");
    return false;
  }
}