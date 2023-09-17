export async function remove(file: string) {
  try {
    await Deno.remove(file);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
