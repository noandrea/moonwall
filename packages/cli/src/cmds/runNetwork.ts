import PressToContinuePrompt from "inquirer-press-to-continue";
import inquirer from "inquirer";
import { MoonwallContext, runNetworkOnly } from "../lib/globalContext.js";
import clear from "clear";
import chalk from "chalk";
import { Environment } from "../types/config.js";
import { executeTests } from "./runTests.js";
import { parse } from "yaml";
import fs from "fs/promises";
import { createReadStream, stat } from "node:fs";
import { importJsonConfig } from "../lib/configReader.js";
import { ReadStream, watch } from "fs";
import { ApiPromise } from "@polkadot/api";
import { sendNewBlockRequest } from "../internal/foundations/chopsticksHelpers.js";

inquirer.registerPrompt("press-to-continue", PressToContinuePrompt);

export async function runNetwork(args) {
  process.env.MOON_TEST_ENV = args.envName;
  const globalConfig = await importJsonConfig();
  const testFileDirs = globalConfig.environments.find(
    ({ name }) => name == args.envName
  )!.testFileDir;
  const foundation = globalConfig.environments.find(({ name }) => name == args.envName)!.foundation
    .type;

  const questions = [
    {
      type: "confirm",
      name: "Quit",
      message: "ℹ️  Are you sure you'd like to close network and quit? \n",
      default: false,
    },
    {
      name: "Choice",
      type: "list",
      message: "What would you like todo now",
      choices: ["Chill", "Info", "Test", "Quit"],
    },
    {
      name: "MenuChoice",
      type: "list",
      message:
        `Environment : ${chalk.bgGray.cyanBright(args.envName)}\n` + "Please select a choice: ",
      default: 0,
      pageSize: 10,
      choices: [
        {
          name: "Tail:      Print the logs of the current running node to this console",
          value: 1,
          short: "tail",
        },
        {
          name: `Info:      Display Information about this environment ${args.envName}`,
          value: 2,
          short: "info",
        },
        {
          name:
            foundation !== "dev"
              ? `Not applicable for foundation type (${chalk.bgGrey.cyanBright(foundation)})`
              : `Command:   Run command on network (e.g. createBlock) (${chalk.bgGrey.cyanBright(
                  foundation
                )})`,
          value: 3,
          short: "cmd",
          disabled: foundation !== "dev",
        },
        {
          name:
            testFileDirs.length > 0
              ? "Test:      Execute tests registered for this environment   (" +
                chalk.bgGrey.cyanBright(testFileDirs) +
                ")"
              : chalk.dim("Test:    NO TESTS SPECIFIED"),
          value: 4,
          disabled: testFileDirs.length > 0 ? false : true,
          short: "test",
        },
        {
          name:
            testFileDirs.length > 0
              ? "GrepTest:  Execute individual test(s) based on grepping the name / ID (" +
                chalk.bgGrey.cyanBright(testFileDirs) +
                ")"
              : chalk.dim("Test:    NO TESTS SPECIFIED"),
          value: 5,
          disabled: testFileDirs.length > 0 ? false : true,
          short: "grep",
        },
        new inquirer.Separator(),
        {
          name: "Quit:      Close network and quit the application",
          value: 6,
          short: "quit",
        },
      ],
      filter(val) {
        return val;
      },
    },
    {
      name: "NetworkStarted",
      type: "press-to-continue",
      anyKey: true,
      pressToContinueMessage: "✅  Press any key to continue...\n",
    },
  ];

  await runNetworkOnly(globalConfig);
  clear();
  const portsList = await reportServicePorts();

  portsList.forEach((port) =>
    console.log(`  🖥️   https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A${port}`)
  );

  await inquirer.prompt(questions.find(({ name }) => name == "NetworkStarted"));

  mainloop: while (true) {
    const choice = await inquirer.prompt(questions.find(({ name }) => name == "MenuChoice"));
    const env = globalConfig.environments.find(({ name }) => name === args.envName)!;

    switch (choice.MenuChoice) {
      case 1:
        clear();
        await resolveTailChoice();
        clear();
        break;

      case 2:
        await resolveInfoChoice(env);
        break;

      case 3:
        await resolveCommandChoice();
        break;

      case 4:
        await resolveTestChoice(env);
        break;

      case 5:
        await resolveGrepChoice(env);

      case 6:
        const quit = await inquirer.prompt(questions.find(({ name }) => name == "Quit"));
        if (quit.Quit === true) {
          break mainloop;
        }
        break;
      default:
        throw new Error("invalid value");
    }
  }
  await MoonwallContext.destroy();
  console.log(`Goodbye! 👋`);
  process.exit(0);
}

const reportServicePorts = async () => {
  const ctx = MoonwallContext.getContext();
  const portsList: string[] = [];
  const globalConfig = await importJsonConfig();
  const config = globalConfig.environments.find(({ name }) => name == process.env.MOON_TEST_ENV)!;
  if (config.foundation.type == "dev") {
    const port =
      ctx.environment.nodes[0].args.find((a) => a.includes("ws-port"))!.split("=")[1] || "9944";
    portsList.push(port);
  } else if (config.foundation.type == "chopsticks") {
    portsList.push(
      ...(await Promise.all(
        config.foundation.launchSpec.map(async ({ configPath }) => {
          const yaml = parse((await fs.readFile(configPath)).toString());
          return yaml.port || "8000";
        })
      ))
    );
  } else if (config.foundation.type == "zombie") {
    // TODO: Remove alith hardcoding
    const wsPort = ctx.zombieNetwork.nodesByName.alith.wsUri.split("ws://127.0.0.1:")[1];
    portsList.push(wsPort);
  }
  portsList.forEach((port) =>
    console.log(`  🌐  Node has started, listening on ports - Websocket: ${port}`)
  );

  return portsList;
};

const resolveCommandChoice = async () => {
  const choice = await inquirer.prompt({
    name: "cmd",
    type: "list",
    choices: [
      { name: "1️⃣  Create Block", value: "createblock" },
      { name: "2️⃣  Create Unfinalized Block", value: "createUnfinalizedBlock" },
      { name: "🔢 Create N Blocks", value: "createNBlocks" },
    ],
    message: `What command would you like to run? `,
    default: "createBlock",
  });

  const ctx = await MoonwallContext.getContext().connectEnvironment();
  const api = ctx.providers.find((a) => a.type == "moon" || a.type == "polkadotJs")
    .api as ApiPromise;

  switch (choice.cmd) {
    case "createblock":
      // ctx.foundation == "dev"
        await api.rpc.engine.createBlock(true, true)
        // : ctx.foundation == "chopsticks"
        // ? await sendNewBlockRequest()
        // : undefined;
      break;

    case "createUnfinalizedBlock":
      await api.rpc.engine.createBlock(true, false);
      break;

    case "createNBlocks":
      const result = await new inquirer.prompt({
        name: "n",
        type: "number",
        message: `How many blocks? `,
      });

      const executeSequentially = async (remaining: number) => {
        if (remaining === 0) {
          return;
        }
        await api.rpc.engine.createBlock(true, true);
        await executeSequentially(remaining - 1);
      };

      await executeSequentially(result.n);
      break;
  }
};

const resolveInfoChoice = async (env: Environment) => {
  console.log(chalk.bgWhite.blackBright("Node Launch args:"));
  console.dir(MoonwallContext.getContext().environment, { depth: null });
  console.log(chalk.bgWhite.blackBright("Launch Spec in Config File:"));
  console.dir(env, { depth: null });
  const portsList = await reportServicePorts();
  portsList.forEach((port) =>
    console.log(`  🖥️   https://polkadot.js.org/apps/?rpc=ws%3A%2F%2F127.0.0.1%3A${port}`)
  );
};

const resolveGrepChoice = async (env: Environment) => {
  const choice = await inquirer.prompt({
    name: "grep",
    type: "input",
    message: `What pattern would you like to filter for (ID/Title): `,
    default: "D01T01",
  });
  return await executeTests(env, { testNamePattern: choice.grep });
};

const resolveTestChoice = async (env: Environment) => {
  process.env.MOON_RECYCLE = "true";
  return await executeTests(env);
};

const resolveTailChoice = async () => {
  const ui = new inquirer.ui.BottomBar();

  await new Promise(async (resolve) => {
    const ctx = MoonwallContext.getContext();
    const onData = (chunk: any) => ui.log.write(chunk.toString());

    if (ctx.foundation == "zombie") {
      const logPath = process.env.MOON_COLLATOR_LOG;
      let currentReadPosition = 0;

      const readLog = () => {
        stat(logPath, (err, stats) => {
          if (err) {
            console.error("Error reading log: ", err);
            return;
          }

          const newReadPosition = stats.size;

          if (newReadPosition > currentReadPosition) {
            const stream = createReadStream(logPath, {
              start: currentReadPosition,
              end: newReadPosition,
            });
            stream.on("data", onData);
            stream.on("end", () => {
              currentReadPosition = newReadPosition;
            });
          }
        });
      };

      const watcher = watch(logPath, (eventType) => {
        if (eventType === "change") {
          readLog();
        }
      });

      readLog();
      inquirer
        .prompt({
          name: "exitTail",
          type: "press-to-continue",
          anyKey: true,
          pressToContinueMessage: " Press any key to stop tailing logs and go back  ↩️",
        })
        .then(() => {
          watcher.close();
          resolve("");
        });
    } else {
      const runningNode = ctx.nodes[0];
      runningNode.stderr!.on("data", onData);
      runningNode.stdout!.on("data", onData);
      inquirer
        .prompt({
          name: "exitTail",
          type: "press-to-continue",
          anyKey: true,
          pressToContinueMessage: " Press any key to stop tailing logs and go back  ↩️",
        })
        .then(() => {
          runningNode.stderr!.off("data", onData);
          runningNode.stdout!.off("data", onData);
          resolve("");
        });
    }

    // TODO: Extend W.I.P below so support interactive tests whilst tailing logs

    // ui.updateBottomBar(
    //   `Press ${chalk.bgWhite.bgBlack("Q")} to go back, or ${chalk.bgWhite.bgBlack(
    //     "T"
    //   )} to execute tests ...`
    // );
    // inquirer
    //   .prompt({
    //     name: "char",
    //     type: "input",
    //     filter(val: string) {
    //       const choice = val.toUpperCase();
    //       switch (choice) {
    //         case "Q":
    //           runningNode.stderr!.off("data", onData);
    //           runningNode.stdout!.off("data", onData);
    //           return;

    //         case "T":
    //           new Promise(async (resolve)=>{
    //             const globalConfig = await importJsonConfig();
    //             const env = globalConfig.environments.find(
    //               ({ name }) => name === process.env.MOON_TEST_ENV
    //             )!;
    //             await resolveTestChoice(env);
    //             resolve(true)
    //           })
    //           break;

    //         default:
    //           ui.updateBottomBar(`Invalid input: ${chalk.redBright(choice)}/n`);
    //           break;
    //       }
    //     },
    //   })
    //   .then(() => resolve(true));
  });
};
