import { describeSuite, expect, beforeAll } from "@moonsong-labs/moonwall-cli";
import { xcAssetAbi } from "@moonsong-labs/moonwall-util";

describeSuite({
  id: "W3",
  title: "Web3 test suite",
  foundationMethods: "read_only",
  testCases: ({ it, context }) => {
    let web3;

    beforeAll(() => {
      web3 = context.getWeb3();
    });

    it({
      id: "T1",
      title: "Calling chain data",
      test: async function () {
        console.log(`The latest block is ${(await web3.eth.getBlock("latest")).number}`);
        const bal = await web3.eth.getBalance("0x506172656E740000000000000000000000000000");
        console.log(web3.utils.fromWei(bal, "ether"));
        expect(bal > 0n).to.be.true;
      },
    });

    it({
      id: "T2",
      title: "Calling contract methods",
      test: async function () {
        const address = "0xFFFFFFfFea09FB06d082fd1275CD48b191cbCD1d";
        const contract = new web3.eth.Contract(xcAssetAbi, address);
        const totalSupply = Number(await contract.methods.totalSupply().call());
        console.log(await contract.methods.symbol().call());

        console.log(
          `Total supply of ${await contract.methods.symbol().call()} is ${web3.utils.fromWei(
            totalSupply,
            "micro"
          )}`
        );
        expect(totalSupply > 0).to.be.true;
      },
    });
  },
});
