import "@moonbeam-network/api-augment";
import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { fetchArtifact, deriveTestIds, generateConfig, fetchArtifactArgs } from "../internal";
import { main } from "./main";
import { runNetworkCmd } from "./runNetwork";
import { testCmd } from "./runTests";
import { configSetup } from "../lib/configReader";
dotenv.config();

configSetup(process.argv);

yargs(hideBin(process.argv))
  .wrap(null)
  .usage("Usage: $0")
  .version("2.0.0")
  .options({
    configFile: {
      type: "string",
      alias: "c",
      description: "path to MoonwallConfig file",
      default: "moonwall.config.json",
    },
  })
  .command("init", "Run tests for a given Environment", async () => {
    await generateConfig();
  })
  .command<fetchArtifactArgs>(
    "download <bin> [ver] [path]",
    "Download x86 artifact from GitHub",
    (yargs) => {
      return yargs
        .positional("bin", {
          describe: "Name of artifact to download\n[ moonbeam | polkadot | *-runtime ]",
          type: "string",
        })
        .positional("ver", {
          describe: "Artifact version to download",
          type: "string",
          default: "latest",
        })
        .positional("path", {
          describe: "Path where to save artifacts",
          type: "string",
          default: "./",
        })
        .option("overwrite", {
          describe: "If file exists, should it be overwritten?",
          type: "boolean",
          alias: "d",
          default: false,
        })
        .option("output-name", {
          describe: "Rename downloaded file to this name",
          alias: "o",
          type: "string",
        });
    },
    async (argv) => {
      await fetchArtifact(argv);
    }
  )
  .command(
    "test <envName> [GrepTest]",
    "Run tests for a given Environment",
    (yargs) => {
      return yargs
        .positional("envName", {
          describe: "Network environment to run tests against",
          array: true,
          string: true,
        })
        .positional("GrepTest", {
          type: "string",
          description: "Pattern to grep test ID/Description to run",
        });
    },
    async (args) => {
      if (args.envName) {
        process.env.MOON_RUN_SCRIPTS = "true";
        if (
          !(await testCmd(args.envName.toString(), {
            testNamePattern: args.GrepTest,
          }))
        ) {
          process.exitCode = 1;
        }
      } else {
        console.log("❌ No environment specified");
        console.log(`👉 Run 'pnpm moonwall --help' for more information`);
        process.exitCode = 1;
      }
    }
  )
  .command(
    "run <envName> [GrepTest]",
    "Start new network found in global config",
    (yargs) => {
      return yargs
        .positional("envName", {
          describe: "Network environment to start",
        })
        .positional("GrepTest", {
          type: "string",
          description: "Pattern to grep test ID/Description to run",
        });
    },
    async (argv) => {
      process.env.MOON_RUN_SCRIPTS = "true";
      await runNetworkCmd(argv as any);
    }
  )
  .command<{ suitesRootDir: string }>(
    "derive <suitesRootDir>",
    "Derive test IDs based on positional order in the directory tree",
    (yargs) => {
      return yargs.positional("suitesRootDir", {
        describe: "Root directory of the suites",
        type: "string",
      });
    },
    async (argv) => {
      await deriveTestIds(argv.suitesRootDir);
    }
  )
  .demandCommand(1)
  .fail(async (msg) => {
    console.log(msg);
    await main();
  })
  .help("h")
  .alias("h", "help")
  .parseAsync()
  .then(async () => {
    if (process.env.MOON_EXIT) {
      process.exit();
    }
  });
