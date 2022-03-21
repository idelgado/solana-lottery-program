import * as spl from "@solana/spl-token";
import { PublicKey, SYSVAR_RECENT_BLOCKHASHES_PUBKEY } from "@solana/web3.js";
import {
  OracleQueueAccount,
  PermissionAccount,
  ProgramStateAccount,
  VrfAccount,
} from "@switchboard-xyz/switchboard-v2";
import { VrfClient } from "./vrf/types";
import {
  loadKeypair,
  loadSwitchboardProgram,
  loadVrfClientProgram,
} from "./vrf/utils";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import * as dotenv from "dotenv";
import { DEFAULT_CLUSTER, DEFAULT_RPC_URL } from "./vrf/const";

async function request() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  yargs(hideBin(process.argv))
    .command(
      `request [vrfKey]`,
      "Request randomness with a CPI call",
      (yarg) => {
        yarg.positional("vrfKey", {
          type: "string",
          describe: "public key",
          demand: true,
        });
      },
      RequestRandomnessCPI
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
export async function RequestRandomnessCPI(argv: any): Promise<void> {
  const { payer, cluster, rpcUrl, vrfKey } = argv;
  const payerKeypair = loadKeypair(payer);
  const clientProgram = await loadVrfClientProgram(
    payerKeypair,
    cluster,
    rpcUrl
  );

  const switchboardProgram = await loadSwitchboardProgram(
    payerKeypair,
    cluster,
    rpcUrl
  );
  const vrfPubkey = new PublicKey(vrfKey);
  const vrfAccount = new VrfAccount({
    program: switchboardProgram,
    publicKey: vrfPubkey,
  });

  const [vrfClient, vrfBump] = VrfClient.fromSeed(
    clientProgram,
    vrfPubkey,
    payerKeypair.publicKey
  );
  try {
    await vrfClient.loadData();
  } catch {
    console.log(`vrf client account has not been initialized ${vrfBump}`);
  }

  const state = await vrfClient.loadData();

  const vrf = await vrfAccount.loadData();
  const queueAccount = new OracleQueueAccount({
    program: switchboardProgram,
    publicKey: vrf.oracleQueue,
  });
  const queue = await queueAccount.loadData();
  const queueAuthority = queue.authority;
  const dataBuffer = queue.dataBuffer;
  const escrow = vrf.escrow;
  const [programStateAccount, programStateBump] =
    ProgramStateAccount.fromSeed(switchboardProgram);
  const [permissionAccount, permissionBump] = PermissionAccount.fromSeed(
    switchboardProgram,
    queueAuthority,
    queueAccount.publicKey,
    state.vrf
  );
  try {
    await permissionAccount.loadData();
  } catch {
    throw new Error(
      "A requested permission pda account has not been initialized."
    );
  }
  const switchTokenMint = await programStateAccount.getTokenMint();
  const payerTokenAccount =
    await switchTokenMint.getOrCreateAssociatedAccountInfo(
      payerKeypair.publicKey
    );

  dotenv.config({ path: "clientaccounts.env" });
  const vaultManager = new PublicKey(process.env.vaultManager);

  const requestTxn = await clientProgram.rpc.requestResult(
    {
      clientStateBump: vrfBump,
      switchboardStateBump: programStateBump,
      permissionBump,
    },
    {
      accounts: {
        state: vrfClient.publicKey,
        vaultManager: vaultManager,
        authority: payerKeypair.publicKey,
        switchboardProgram: switchboardProgram.programId,
        vrf: state.vrf,
        oracleQueue: queueAccount.publicKey,
        queueAuthority,
        dataBuffer,
        permission: permissionAccount.publicKey,
        escrow,
        payerWallet: payerTokenAccount.address,
        payerAuthority: payerKeypair.publicKey,
        recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
        programState: programStateAccount.publicKey,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      },
      signers: [payerKeypair, payerKeypair],
    }
  );
  console.log(`https://solscan.io/tx/${requestTxn}?cluster=${cluster}`);
}

request().then(
  () => {
    return;
  },
  (error) => {
    console.error(error);
    return;
  }
);
