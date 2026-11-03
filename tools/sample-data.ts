// Writes data/generated/: a sample of the simulation's 2194 sales (src/simulation/sample-data.ts). With --check,
// fails if the committed files differ. The simulation's imports need Vite's resolution, so it loads through Vite.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { runnerImport } from "vite";

const started = performance.now();
const root = new URL("../", import.meta.url);
const directory = new URL("data/generated/", root);
try {
  const { module } = await runnerImport<typeof import("../src/simulation/sample-data.ts")>(
    "/src/simulation/sample-data.ts",
    {
      root: new URL(".", root).pathname,
      configFile: false,
      logLevel: "error",
      resolve: { tsconfigPaths: true },
    },
  );
  const files = module.sampleFiles();
  if (process.argv.includes("--check")) {
    const committed = readdirSync(directory)
      .filter((name) => name.endsWith(".csv"))
      .sort();
    if (
      JSON.stringify(committed) !== JSON.stringify(Object.keys(files).sort()) ||
      Object.entries(files).some(
        ([name, text]) => readFileSync(new URL(name, directory), "utf8") !== text,
      )
    ) {
      throw new Error("The sample of generated data is stale; run npm run data:sample");
    }
  } else {
    mkdirSync(directory, { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(new URL(name, directory), text);
  }
  console.log(
    JSON.stringify({
      event: "sample_data_generated",
      outcome: "success",
      durationMs: Math.round(performance.now() - started),
      files: Object.fromEntries(
        Object.entries(files).map(([name, text]) => [name, text.split("\n").length - 2]),
      ),
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      event: "sample_data_generated",
      outcome: "failure",
      durationMs: Math.round(performance.now() - started),
    }),
  );
  throw error;
}
