## Description
![moonwall](./moonwall.jpg)

Test framework for testing on Moonbeam, Moonriver and more

## Installation

### NPM Installation
```
pnpm -g i @moonwall/cli
```
> Or whichever way you prefer to install via your favourite package manager

### Local Installation

> Package manager `pnpm` is required for this repo. You can install it with `npm install -g pnpm` or otherwise following [their instructions](https://pnpm.io/installation).

1. `pnpm i` to install all dependencies.
2. `pnpm build` to build the application locally.
3. `pnpm start` to check that the application runs
4. (In your project dir) `npm i <path_to_moonwall_repo>` to locally add moonwall to your other repo

From here you can import the items you need from moonwall packages in your code:
```
import { describeSuite , beforeAll, expect, ALITH_ADDRESS } from "@moonwall/cli";
import { ALITH_ADDRESS } from "@moonwall/util";
```

## Functions

- Init: Generates a new config file.
- Run: Runs a network.
- Test: Executes tests, and runs a network if neccesary.
- Download: Gets node binaries for polkadot, moonbeam from GH.

> :information_source: Use `--help` for more information about arguments for each command

### Usage Examples (non-exhaustive)

- `moonwall` : If you have globally installed moonwall, here is the most minimal entrypoint

- `pnpm moonwall` : This can be used if locally installed, and will launch the main menu..

- `pnpx @moonwall/cli run <ENV_NAME>` : To download and run the latest moonwall binary from npm.js repository, and run a network specified in your config file.

- `pnpm exec moonwall test <ENV_NAME>` : To run the locally compiled version of the binary, to start network and run tests against it.

- `pnpm moonwall download <ARTIFACT NAME> <VERSION> <PATH>` : To run the locally compiled version of the binary, to download an artifact directly from github.


The combinations are endless, for more information you can see the pnpm docs [here](https://pnpm.io/cli/run).