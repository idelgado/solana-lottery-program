import * as anchor from "@project-serum/anchor";
import { AccountInfo, Context, PublicKey } from "@solana/web3.js";
import { VrfAccount } from "@switchboard-xyz/switchboard-v2";
import { DEFAULT_KEYPAIR } from "./vrf/const";
import { VrfClient } from "./vrf/types";
import {
  anchorBNtoDateTimeString,
  loadSwitchboardProgram,
  loadVrfClientProgram,
  toVrfStatus,
  waitForever,
} from "./vrf/utils";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { DEFAULT_CLUSTER, DEFAULT_RPC_URL } from "./vrf/const";

type AccountType = "VrfAccountData" | "VrfClient";

async function watch() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  yargs(hideBin(process.argv))
    .command(
      `watch [pubkey]`,
      "watch VRF account onchain",
      (yarg) => {
        yarg.positional("pubkey", {
          type: "string",
          describe: "public key of the account to watch",
          demand: true,
        });
      },
      watchAccount
    )
    .options({
      payer: {
        type: "string",
        describe: "filesystem path of keypair",
        demand: true,
        default: "secrets/payer-keypair.json",
      },
      rpcUrl: {
        type: "string",
        describe: "override default RPC server",
        demand: true,
        default: DEFAULT_RPC_URL,
      },
      cluster: {
        type: "string",
        describe: "Solana cluster to interact with",
        demand: true,
        default: DEFAULT_CLUSTER,
      },
    })
    .parse();
}


// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function watchAccount(argv: any): Promise<void> {
  const { cluster, rpcUrl, pubkey } = argv;
  const publicKey = new PublicKey(pubkey);
  let program: anchor.Program;
  let accountType: AccountType;
  try {
    program = await loadSwitchboardProgram(DEFAULT_KEYPAIR, cluster, rpcUrl);
    const vrfAccount = new VrfAccount({ program, publicKey });
    await vrfAccount.loadData();
    accountType = "VrfAccountData";
  } catch {
    try {
      program = await loadVrfClientProgram(DEFAULT_KEYPAIR, cluster, rpcUrl);
      const account = new VrfClient(program, publicKey);
      await account.loadData();
      accountType = "VrfClient";
    } catch {
      throw new Error(
        `pubkey is not a Switchboard or VrfclientProgram account`
      );
    }
  }
  if (!program) {
    throw new Error(`pubkey is not a Switchboard or VrfclientProgram account`);
  }
  const coder = new anchor.BorshAccountsCoder(program.idl);

  program.provider.connection.onAccountChange(
    publicKey,
    (accountInfo: AccountInfo<Buffer>, context: Context) => {
      if (accountType === "VrfAccountData") {
        const vrfAccount = coder.decode(accountType, accountInfo.data);
        const data = {
          status: toVrfStatus(vrfAccount.status),
          counter: vrfAccount.counter.toString(),
          producer: vrfAccount.builders[0].producer.toString() ?? "",
          txRemaining: vrfAccount.builders[0].txRemaining,
          result: vrfAccount.currentRound.result
            ? `[${(vrfAccount.currentRound.result as number[]).join(",")}]`
            : "",
        };
        console.log(JSON.stringify(data, undefined, 2));
      } else if (accountType === "VrfClient") {
        const state = coder.decode(accountType, accountInfo.data);
        const data = {
          result: state.result.toString(),
          lastTimestamp: anchorBNtoDateTimeString(state.lastTimestamp),
        };
        console.log(JSON.stringify(data, undefined, 2));
      }
    }
  );

  await waitForever();
  console.log("exiting");
}

watch().then(
  () => {
    return;
  },
  (error) => {
    console.error(error);
    return;
  }
);
