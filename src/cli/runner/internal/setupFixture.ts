import { afterAll, beforeAll } from "vitest";
import { globalConfig } from "../../../../moonwall.config.js";
import { MoonwallContext, contextCreator } from "./globalContext.js";

beforeAll(async () => {
  const ctx = await contextCreator(globalConfig, process.env.TEST_ENV);
  await Promise.all(ctx.providers.map(async ({ greet }) => greet()));
});

afterAll(async () => {
  MoonwallContext.destroy();
});
