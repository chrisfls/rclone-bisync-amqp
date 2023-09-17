import { bisync } from "./_bisync.ts";
import { AmqpConnection, delay, Logger, path, useDebounce } from "./deps.ts";
import { ensure } from "./_ensure.ts";
import { hash } from "./_hash.ts";
import { test } from "./_test.ts";
import { Folder } from "./types.ts";
import { remove } from "./_remove.ts";

const DEFAULT_RETRY_WAIT = 5000;
const MAX_RETRY_WAIT = 5 * 60 * 1000;
const hostname = Deno.hostname();

export type Watch = {
  log: Logger;
  connection: AmqpConnection;
  metadata: string;
  filters: string[];
  debounce: number;
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

export async function watch(remote: string, folder: Folder, config: Watch) {
  const { log, connection } = config;

  const channel = await connection.openChannel();
  const checksum = await hash(remote);

  const exchangeName = `exchange.${checksum}`;
  const queueName = `queue.${hostname}.${checksum}`;

  const local = path.normalize(folder.path);
  const nick = checksum.slice(0, 6);

  log.info(`[sync]  <${nick}> \`${folder}\` -> \`${remote}\``);

  const filters = await getFiltersFile(checksum, folder, config);
  const debounce = folder.debounce ?? config.debounce;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const gitkeep = path.join(local, ".gitkeep");

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

  let pinging: Promise<void> | undefined;
  let ponging: Promise<void> | undefined;

  const ping = useDebounce(
    () => {
      log.info(`[queue] <${nick}> ping`);
      pinging = notify();
    },
    debounce,
  );

  const pong = useDebounce(
    () => {
      ponging = sync();
    },
    debounce * 3,
  );

  const notify = async () => {
    await channel.publish(
      { exchange: exchangeName },
      { contentType: "application/json" },
      encoder.encode(hostname),
    );
  };

  const sync = async () => {
    log.info(`[sync]  <${nick}> syncing `);

    const result = await bisync(local, remote, filters, resync);

    if (result.success && result.code === 0) {
      log.info(`[sync]  <${nick}> finished`);
      retry = false;
      resync = false;
      wait = DEFAULT_RETRY_WAIT;
      await ensure(gitkeep);
      return;
    }

    if (result.code == 1) {
      log.warning(`[sync]  <${nick}> minor error: syncing again`);
    } else {
      log.warning(`[sync]  <${nick}> fatal error: resync on next try`);
      await remove(gitkeep);
      resync = true;
    }

    if (retry) {
      wait = Math.min(+(wait * 1.5), MAX_RETRY_WAIT);
      log.warning(`[sync]  <${nick}> retry in ${wait}ms`);
      delay(wait);
    }

    log.warning(`[sync]  <${nick}> retrying now`);
    await remove(gitkeep);
    retry = true;

    pong();
  };

  const consumer = channel.consume(
    { queue: queueName },
    async (args, _props, data) => {
      if (decoder.decode(data) === hostname) {
        log.info(`[queue] <${nick}> pong (self)`);
        await channel.ack({ deliveryTag: args.deliveryTag });
        return;
      }

      log.info(`[queue] <${nick}> pong`);
      await ponging;
      pong();
      await delay(debounce); // allow other hosts to receive the message
      await channel.ack({ deliveryTag: args.deliveryTag });
    },
  );

  log.info(`[sync]  <${nick}> startup sync`);
  ponging = sync();
  await ponging;

  const events = [
    "remove",
    "create",
    "modify",
  ];

  const watcher = Deno.watchFs(local);

  for await (const event of watcher) {
    if (!events.includes(event.kind)) continue;
    for (const path of event.paths) {
      if (event.kind !== "remove" && await test(path, filters)) continue;
      log.info(`[watch] <${nick}> ${event.kind} \`${path}\``);
      await ponging;
      pong();
      await pinging;
      ping();
      break;
    }
  }

  await Promise.all([ponging, pinging, consumer]);
}
