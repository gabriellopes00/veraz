import { createAI } from "./ai";
import { createApp, websocket } from "./app";
import { VerdictCache } from "./cache";
import { config } from "./config";

const app = createApp(createAI(), new VerdictCache(config.dbPath, config.cache.ttlMs));

console.log(`Veraz API on :${config.port} (${config.mock ? "MOCK" : "OpenAI"} mode)`);

export default {
  port: config.port,
  hostname: "0.0.0.0", // reachable from the phone over the LAN
  fetch: app.fetch,
  websocket,
  idleTimeout: 255, // seconds; long-lived sockets
};
