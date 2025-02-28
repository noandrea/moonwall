import type { MoonwallConfig } from "@moonwall/types";
import chalk from "chalk";
import clear from "clear";
import colors from "colors";
import fs from "node:fs";
import inquirer from "inquirer";
import PressToContinuePrompt from "inquirer-press-to-continue";
import path from "node:path";
import { SemVer, lt } from "semver";
import pkg from "../../package.json" assert { type: "json" };
import {
  createFolders,
  deriveTestIds,
  executeScript,
  fetchArtifact,
  generateConfig,
  getVersions,
} from "../internal";
import { configExists, importAsyncConfig } from "../lib/configReader";
import { allReposAsync, standardRepos } from "../lib/repoDefinitions";
import { runNetworkCmd } from "./runNetwork";
import { testCmd } from "./runTests";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  baseUrl: "https://api.github.com",
  log: {
    debug: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error,
  },
});

inquirer.registerPrompt("press-to-continue", PressToContinuePrompt);

export async function main() {
  for (;;) {
    const globalConfig = (await configExists()) ? await importAsyncConfig() : undefined;
    clear();
    await printIntro();
    if (await mainMenu(globalConfig)) {
      break;
    }
  }

  process.stdout.write("Goodbye! 👋\n");
}

async function mainMenu(config?: MoonwallConfig) {
  const configPresent = config !== undefined;
  const questionList = {
    name: "MenuChoice",
    type: "list",
    message: "Main Menu - Please select one of the following:",
    default: 0,
    pageSize: 12,
    choices: !configPresent
      ? [
          {
            name: !configPresent
              ? "1) Initialise:                         Generate a new Moonwall Config File"
              : chalk.dim("1) Initialise:                       ✅  CONFIG ALREADY GENERATED"),
            value: "init",
          },
          {
            name: "2) Artifact Downloader:                Fetch artifacts (x86) from GitHub repos",
            value: "download",
          },
          {
            name: "3) Quit Application",
            value: "quit",
          },
        ]
      : [
          {
            name: "1) Execute Script:                     Run scripts placed in your config defined script directory",
            value: "exec",
          },
          {
            name: "2) Network Launcher & Toolbox:         Launch network, access tools: tail logs, interactive tests etc",
            value: "run",
          },
          {
            name: "3) Test Suite Execution:               Run automated tests, start network if needed",
            value: "test",
          },

          {
            name: "4) Artifact Downloader:                Fetch artifacts (x86) from GitHub repos",
            value: "download",
          },

          {
            name: "5) Rename TestIDs:                     Rename test id prefixes based on position in the directory tree",
            value: "derive",
          },

          {
            name: "6) Quit Application",
            value: "quit",
          },
        ],
    filter(val) {
      return val;
    },
  } as const;

  const answers = await inquirer.prompt(questionList);

  switch (answers.MenuChoice) {
    case "init":
      await generateConfig();
      await createFolders();
      return false;
    case "run": {
      if (!config) {
        throw new Error("Config not defined, this is a defect please raise it.");
      }

      const chosenRunEnv = await chooseRunEnv(config);
      process.env.MOON_RUN_SCRIPTS = "true";
      if (chosenRunEnv.envName !== "back") {
        await runNetworkCmd(chosenRunEnv);
      }
      return true;
    }
    case "test": {
      if (!config) {
        throw new Error("Config not defined, this is a defect please raise it.");
      }

      const chosenTestEnv = await chooseTestEnv(config);
      if (chosenTestEnv.envName !== "back") {
        process.env.MOON_RUN_SCRIPTS = "true";
        await testCmd(chosenTestEnv.envName);
        await inquirer.prompt({
          name: "test complete",
          type: "press-to-continue",
          anyKey: true,
          pressToContinueMessage: `ℹ️  Test run for ${chalk.bgWhiteBright.black(
            chosenTestEnv.envName
          )} has been completed. Press any key to continue...\n`,
        });
      }
      return true;
    }
    case "download":
      await resolveDownloadChoice();
      return false;

    case "quit":
      return await resolveQuitChoice();

    case "exec": {
      if (!config) {
        throw new Error("Config not defined, this is a defect please raise it.");
      }
      return await resolveExecChoice(config);
    }

    case "derive": {
      clear();
      const { rootDir } = await inquirer.prompt({
        name: "rootDir",
        type: "input",
        message: "Enter the root testSuites directory to process:",
        default: "suites",
      });
      await deriveTestIds({ rootDir });

      await inquirer.prompt({
        name: "test complete",
        type: "press-to-continue",
        anyKey: true,
        pressToContinueMessage: `ℹ️  Renaming task for ${chalk.bold(
          `/${rootDir}`
        )} has been completed. Press any key to continue...\n`,
      });

      return false;
    }

    default:
      throw new Error("Invalid choice");
  }
}

async function resolveExecChoice(config: MoonwallConfig) {
  const scriptDir = config.scriptsDir;

  if (!scriptDir) {
    await inquirer.prompt({
      name: "test complete",
      type: "press-to-continue",
      anyKey: true,
      pressToContinueMessage: `ℹ️  No scriptDir property defined at ${chalk.bgWhiteBright.black(
        "moonwall.config.json"
      )}\n Press any key to continue...\n`,
    });
    return false;
  }

  if (!fs.existsSync(scriptDir)) {
    await inquirer.prompt({
      name: "test complete",
      type: "press-to-continue",
      anyKey: true,
      pressToContinueMessage: `ℹ️  No scriptDir found at at ${chalk.bgWhiteBright.black(
        path.join(process.cwd(), scriptDir)
      )}\n Press any key to continue...\n`,
    });
    return false;
  }

  const files = await fs.promises.readdir(scriptDir);

  if (!files) {
    await inquirer.prompt({
      name: "test complete",
      type: "press-to-continue",
      anyKey: true,
      pressToContinueMessage: `ℹ️  No scripts found at ${chalk.bgWhiteBright.black(
        path.join(process.cwd(), config.scriptsDir || "")
      )}\n Press any key to continue...\n`,
    });
  }

  const choices = files.map((file) => {
    const ext = getExtString(file);
    return { name: `${ext}:    ${path.basename(file, "")}`, value: file };
  });

  for (;;) {
    const result = await inquirer.prompt({
      name: "selections",
      message: "Select which scripts you'd like to run (press ↩️ with none selected to go 🔙)\n",
      type: "checkbox",
      choices,
    });

    if (result.selections.length === 0) {
      const result = await inquirer.prompt({
        name: "none-selected",
        message: "No scripts have been selected to run, do you wish to exit?",
        type: "confirm",
        default: true,
      });

      if (result["none-selected"]) {
        return false;
      }
      continue;
    }

    for (const script of result.selections) {
      const result = await inquirer.prompt({
        name: "args",
        message: `Enter any arguments for ${chalk.bgWhiteBright.black(
          script
        )} (press enter for none)`,
        type: "input",
      });

      await executeScript(script, result.args);
    }

    await inquirer.prompt({
      name: "test complete",
      type: "press-to-continue",
      anyKey: true,
      pressToContinueMessage: "Press any key to continue...\n",
    });
    return false;
  }
}

async function resolveDownloadChoice() {
  const repos = (await configExists()) ? await allReposAsync() : standardRepos();
  const binList = repos.reduce((acc, curr) => {
    acc.push(...curr.binaries.flatMap((bin) => bin.name));
    acc.push(new inquirer.Separator());
    acc.push("Back");
    acc.push(new inquirer.Separator());
    return acc;
  }, [] as any[]);

  for (;;) {
    const firstChoice = await inquirer.prompt({
      name: "artifact",
      type: "list",
      message: "Download - which artifact?",
      choices: binList,
    });
    if (firstChoice.artifact === "Back") {
      return;
    }

    const versions = await getVersions(
      firstChoice.artifact,
      firstChoice.artifact.includes("runtime")
    );

    const chooseversion = await inquirer.prompt({
      name: "binVersion",
      type: "list",
      default: "latest",
      message: "Download - which version?",
      choices: [...versions, new inquirer.Separator(), "Back", new inquirer.Separator()],
    });

    if (chooseversion.binVersion === "Back") {
      continue;
    }
    const chooseLocation = await inquirer.prompt({
      name: "path",
      type: "input",
      message: "Download - where would you like it placed?",
      default: "./tmp",
    });

    const result = await inquirer.prompt({
      name: "continue",
      type: "confirm",
      message: `You are about to download ${chalk.bgWhite.blackBright(
        firstChoice.artifact
      )} v-${chalk.bgWhite.blackBright(chooseversion.binVersion)} to: ${chalk.bgWhite.blackBright(
        chooseLocation.path
      )}.\n Would you like to continue? `,
      default: true,
    });

    if (result.continue === false) {
      continue;
    }

    await fetchArtifact({
      bin: firstChoice.artifact,
      ver: chooseversion.binVersion,
      path: chooseLocation.path,
    });
    await inquirer.prompt({
      name: "NetworkStarted",
      type: "press-to-continue",
      anyKey: true,
      pressToContinueMessage: "Press any key to continue...\n",
    });
    return;
  }
}

const chooseTestEnv = async (config: MoonwallConfig) => {
  const envs = config.environments
    .map((a) => ({
      name: `[${a.foundation.type}] ${a.name}${a.description ? `: \t\t${a.description}` : ""}`,
      value: a.name,
      disabled: false,
    }))
    .sort((a, b) => (a.name > b.name ? -1 : +1));
  envs.push(
    ...([
      new inquirer.Separator(),
      { name: "Back", value: "back" },
      new inquirer.Separator(),
    ] as any)
  );
  const result = await inquirer.prompt({
    name: "envName",
    message: "Select a environment to run",
    type: "list",
    pageSize: 12,
    choices: envs,
  });

  return result;
};

const chooseRunEnv = async (config: MoonwallConfig) => {
  const envs = config.environments.map((a) => {
    const result = { name: "", value: a.name, disabled: false };
    if (
      a.foundation.type === "dev" ||
      a.foundation.type === "chopsticks" ||
      a.foundation.type === "zombie"
    ) {
      result.name = `[${a.foundation.type}] ${a.name}${
        a.description ? `: \t\t${a.description}` : ""
      }`;
    } else {
      result.name = chalk.dim(`[${a.foundation.type}] ${a.name}     NO NETWORK TO RUN`);
      result.disabled = true;
    }
    return result;
  });

  const choices = [
    ...envs.filter(({ disabled }) => disabled === false).sort((a, b) => (a.name > b.name ? 1 : -1)),
    new inquirer.Separator(),
    ...envs.filter(({ disabled }) => disabled === true).sort((a, b) => (a.name > b.name ? 1 : -1)),
    new inquirer.Separator(),
    { name: "Back", value: "back" },
    new inquirer.Separator(),
  ];

  const result = await inquirer.prompt({
    name: "envName",
    message: "Select a environment to run",
    type: "list",
    pageSize: 12,
    choices,
  });

  return result;
};

const resolveQuitChoice = async () => {
  const result = await inquirer.prompt({
    name: "Quit",
    type: "confirm",
    message: "Are you sure you want to Quit?",
    default: false,
  });
  return result.Quit;
};

const printIntro = async () => {
  const currentVersion = new SemVer(pkg.version);

  let remoteVersion = "";
  try {
    const releases = await octokit.rest.repos.listReleases({
      owner: "moonsong-labs",
      repo: "moonwall",
    });

    if (releases.status !== 200 || releases.data.length === 0) {
      throw new Error("No releases found for moonsong-labs.moonwall, try again later.");
    }
    const json = releases.data;

    remoteVersion =
      json.find((a) => a.tag_name.includes("@moonwall/cli@"))?.tag_name.split("@")[2] || "unknown";
  } catch (error) {
    remoteVersion = "unknown";
    console.error(`Fetch Error: ${error}`);
  }

  const logo =
    chalk.cyan(`\n                                                                                                                  
                                      ####################                      
                                  ############################                  
                               ###################################              
                            ########################################            
                           ###########################################          
                         ##############################################         
                        ################################################        
                       .#################################################       
                       ##################################################       
                       ##################################################       
`) +
    chalk.red(`                                                                                
🧱🧱🧱   🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱  🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱
  🧱🧱🧱🧱  🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱
              🧱🧱🧱   🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱
      🧱🧱   🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱   🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱
        🧱🧱   🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱    🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱
                                       🧱🧱🧱  🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱
                      🧱🧱🧱🧱  🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱🧱      
                                                                                                                                                              
\n`);
  process.stdout.write(logo);
  process.stdout.write(
    colors.rainbow(
      "================================================================================\n"
    )
  );

  if (remoteVersion !== "unknown" && lt(currentVersion, new SemVer(remoteVersion))) {
    process.stdout.write(
      chalk.bgCyan.white(
        `                 MOONWALL   V${currentVersion.version}   (New version ${remoteVersion} available!)             \n`
      )
    );
  } else {
    process.stdout.write(
      chalk.bgCyan.white(
        `                                MOONWALL  V${currentVersion.version}                                \n`
      )
    );
  }

  process.stdout.write(
    colors.rainbow(
      "================================================================================\n"
    )
  );
};

const getExtString = (file: string) => {
  const ext = path.extname(file);
  switch (ext) {
    case ".js":
      return chalk.bgYellow.black(ext);
    case ".ts":
      return chalk.bgBlue.black(ext);
    case ".sh":
      return chalk.bgGreen.black(ext);
    default:
      return chalk.bgRed.black(ext);
  }
};
