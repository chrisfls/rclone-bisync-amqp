import { bisync, Changeset } from "./_bisync.ts";
import { AmqpConnection, delay, path, useDebounce } from "./deps.ts";
import { ensure } from "./_ensure.ts";
import { hash } from "./_hash.ts";
import { test } from "./_test.ts";
import { Folder } from "./types.ts";
import { remove } from "./_remove.ts";
import { getLogger } from "https://deno.land/std@0.201.0/log/mod.ts";
import { mkdir } from "./_mkdir.ts";

const DEFAULT_RETRY_WAIT = 5000;
const MAX_RETRY_WAIT = 10 * 60 * 1000;
const DEFAULT_EXPIRATION = (60 * 60 * 1000).toString(); // 1 hour
const hostname = Deno.hostname();

export type Watch = {
  signal: AbortSignal;
  connection: AmqpConnection;
  metadata: string;
  filters: string[];
  debounce: number;
};

type Msg = {
  hostname: string;
  changeset: Changeset;
};

async function getFiltersFile(checksum: string, folder: Folder, config: Watch) {
  const file = path.join(
    config.metadata,
    `${Deno.hostname()}.${checksum}.filters.txt`,
  );

  await Deno.writeTextFile(
    file,
    config.filters.concat(folder.filters ?? []).join("\n"),
  );

  return file;
}

const events = [
  "remove",
  "create",
  "modify",
];

function isWatched(kind: string): kind is "remove" | "create" | "modify" {
  return events.includes(kind);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function watch(remote: string, folder: Folder, config: Watch) {
  const { connection } = config;

  const log = getLogger();
  const channel = await connection.openChannel();
  const checksum = await hash(remote);

  const exchangeName = `exchange.${checksum}`;
  const queueName = `queue.${hostname}.${checksum}`;
  const local = path.normalize(folder.path);
  const nick = checksum.slice(0, 6);

  log.info(`[sync]  <${nick}> \`${folder.path}\` -> \`${remote}\``);

  const filters = await getFiltersFile(checksum, folder, config);
  const debounce = folder.debounce ?? config.debounce;
  const gitkeep = path.join(local, ".gitkeep");
  const logs = path.join(config.metadata, checksum);

  await mkdir(logs);

  let retry = false;
  let resync = !(await ensure(gitkeep));
  let wait = DEFAULT_RETRY_WAIT;

  await channel.declareExchange({
    exchange: exchangeName,
    type: "fanout",
  });

  channel.declareQueue({ queue: queueName });

  channel.bindQueue({
    queue: queueName,
    exchange: exchangeName,
  });

  const ping = useDebounce(
    () => {
      pinging = sync();
    },
    debounce,
  );

  const notify = async (changeset: Changeset) => {
    log.info(`[queue] <${nick}> ping`);

    await channel.publish(
      { exchange: exchangeName },
      { contentType: "application/json", expiration: DEFAULT_EXPIRATION },
      encoder.encode(JSON.stringify({ hostname, changeset })),
    );
  };

  const sync = async () => {
    log.info(`[sync]  <${nick}> syncing `);

    const result = await bisync(local, remote, filters, resync, logs);

    for (const set of Object.values(skip)) {
      set.clear();
    }

    if (result.changed) await notify(result.changeset);

    if (result.output.success && result.output.code === 0) {
      log.info(`[sync]  <${nick}> done`);

      retry = false;
      resync = false;
      wait = DEFAULT_RETRY_WAIT;

      await ensure(gitkeep);

      return;
    }

    if (result.output.code !== 1) {
      log.warning(`[sync]  <${nick}> fatal error: retry resync`);
      resync = true;
      await remove(gitkeep);
    } else {
      log.warning(`[sync]  <${nick}> minor error: retry syncing`);
    }

    if (retry) {
      wait = Math.min(+(wait * 1.5), MAX_RETRY_WAIT);
      log.warning(`[sync]  <${nick}> retry in ${wait}ms`);
      delay(wait);
    }

    log.warning(`[sync]  <${nick}> retrying now`);
    retry = true;

    ping();
  };

  const skip = {
    create: new Set<string>(),
    modify: new Set<string>(),
    remove: new Set<string>(),
  };

  const consumer = await channel.consume(
    { queue: queueName },
    async (args, _props, data) => {
      await channel.ack({ deliveryTag: args.deliveryTag });

      const msg: Msg = JSON.parse(decoder.decode(data));

      if (msg.hostname === hostname) {
        return;
      }

      log.info(`[queue] <${nick}> pong`);

      for (const [kind, set] of Object.entries(skip)) {
        for (const file of msg.changeset[kind as keyof typeof skip]) {
          set.add(path.normalize(file));
        }
      }

      await pinging;
      ping();
    },
  );

  const watcher = Deno.watchFs(local);

  log.info(`[sync]  <${nick}> startup sync`);

  let pinging = sync();

  await pinging;

  for await (const event of watcher) {
    if (config.signal.aborted) break;
    if (!isWatched(event.kind)) continue;
    for (const filePath of event.paths) {
      const relativePath = path.relative(local, filePath);

      if (relativePath === '.gitkeep') continue;

      if (skip[event.kind].has(relativePath)) {
        skip[event.kind].delete(relativePath);
        continue;
      }

      if (/\..*\.partial$/.test(filePath)) {
        continue;
      }

      if (event.kind !== "remove" && await test(filePath, filters)) {
        continue;
      }

      log.info(`[watch] <${nick}> ${event.kind} \`${relativePath}\``);
      await pinging;
      ping();

      break;
    }
  }

  watcher.close();

  await Promise.all([pinging, pinging, consumer]);
}
