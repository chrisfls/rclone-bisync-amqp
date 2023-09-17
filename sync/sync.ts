import { Config } from "./types.ts";
import { AmqpConnection, getLogger, path } from "./deps.ts";
import { connect } from "./deps.ts";
import { mkdir } from "./_mkdir.ts";
import { Watch, watch } from "./_watch.ts";
import { delay } from "https://deno.land/std@0.201.0/async/delay.ts";

const DEFAULT_DEBOUNCE = 3000;
const RECONNECT_WAIT_TIME = 1000 * 60;

const hostname = Deno.hostname();

async function connected(
  connection: AmqpConnection,
  signal: AbortSignal,
  config: Config,
) {
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

  const filters = config.filters ?? [];
  const debounce = config.debounce ?? DEFAULT_DEBOUNCE;
  const metadata = path.join(home, ".sync");

  await mkdir(metadata);

  log.info(`[host]  '${hostname}'`);

  const watchConfig: Watch = {
    signal,
    connection,
    metadata,
    filters,
    debounce,
  };

  await Promise.all(
    Object.entries(folders).map(([r, l]) => watch(r, l, watchConfig)),
  );

  await connection.closed();
}

export async function sync(config: Config) {
  while (true) {
    let connection: Awaited<ReturnType<typeof connect>> | undefined;
    const abort = new AbortController();

    try {
      connection = await connect(config.connection);
      await connected(connection, abort.signal, config);
      await connection.closed();
    } catch (e) {
      abort.abort();
      console.error(e);
      console.warn(`reconneting in ${RECONNECT_WAIT_TIME}ms`);
      await delay(RECONNECT_WAIT_TIME);
    } finally {
      await connection?.close();
    }
  }
}
