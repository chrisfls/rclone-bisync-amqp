export async function mkdir(dir: string) {
  try {
    await Deno.mkdir(dir);
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }
}
