import { Config } from "./types.ts";
import { getLogger, path } from "./deps.ts";
import { mkdir } from "./_mkdir.ts";
import { watch } from "./_watch.ts";

const DEFAULT_DEBOUNCE = 3000;
const hostname = Deno.hostname();

export async function sync(config: Config) {
  const log = getLogger();
  const folders = config.hosts[hostname];

  if (folders === undefined) {
    log.error(`[host]  '${hostname}' is not configured`);
    return;
  }

  const home = await Deno.env.get("HOME");

  if (home === undefined) {
    log.error(`[init]  'HOME' var is not set`);
    return;
  }

  const { connection, abort } = config;
  const filters = config.filters ?? [];
  const debounce = config.debounce ?? DEFAULT_DEBOUNCE;
  const metadata = path.join(home, ".sync");
  await mkdir(metadata);

  log.info(`[host]  '${hostname}'`);

  await Promise.all(
    Object.entries(folders).map(([r, l]) =>
      watch(r, l, {
        abort,
        log,
        connection,
        metadata,
        filters,
        debounce,
      })
    ),
  );

  await connection.closed();
}
