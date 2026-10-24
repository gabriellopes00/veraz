import { config } from "./config.ts";
import { createContainer } from "./container.ts";
import { buildServer } from "./server.ts";

const container = createContainer(config);
container.metrics.watchEventLoop();
const app = await buildServer(container);

await app.listen({ host: config.host, port: config.port });
console.log(`Veraz API on ${config.host}:${config.port} (${config.mock ? "MOCK" : "OpenAI"} mode)`);

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void app.close());
