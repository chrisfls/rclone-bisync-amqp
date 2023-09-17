import { sync } from "./sync/mod.ts";

await sync({
  connection: {
    hostname: "hostname",
    port: 5672,
    username: "username",
    password: "password",
    vhost: "vhost",
  },
  hosts: {
    "HOSTNAME": {
      "remote:path/in/remote": {
        path: "/home/username/path/in/local",
      },
    }
  },
});
