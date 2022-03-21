import * as client from "../client";
import * as anchor from "@project-serum/anchor";
// Avoid linking to switchboard spl-token dependency
import * as spl from "../../node_modules/@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import { NoLossLottery } from "../../target/types/no_loss_lottery";
import {
  Callback,
  OracleQueueAccount,
  PermissionAccount,
  SwitchboardPermission,
  VrfAccount,
} from "@switchboard-xyz/switchboard-v2";
import {
  MetadataProgram,
} from "@metaplex-foundation/mpl-token-metadata";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { VrfClient } from "./vrf/types";
import {
  buffer2string,
  loadKeypair,
  loadSwitchboardProgram,
  loadVrfClientProgram,
  toAccountString,
  toPermissionString,
} from "./vrf/utils";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";
import { DEFAULT_CLUSTER, DEFAULT_RPC_URL } from "./vrf/const";
import { ClientAccounts } from "../client";

async function init(argv: any) {
  const lotteryClient = new client.Client();
  await lotteryClient.initialize(argv);
}

async function initialize() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  yargs(hideBin(process.argv))
    .command(
      `init [queueKey] [userAddress]`,
      "init a new lottery account",
      (yarg) => {
        yarg.option("queueKey", {
          type: "string",
          describe:
            "public key of the oracle queue that the aggregator will belong to",
          demand: true,
        });
        yarg.option("userAddress", {
          type: "string",
          describe:
            "filesystem path to keypair that will store the vrf account",
          demand: true,
        });
        yarg.option("keypair", {
          type: "string",
          describe:
            "filesystem path to keypair that will store the vrf account",
        });
        yarg.option("maxResult", {
          type: "string",
          describe: "maximum result returned from vrf buffer",
          default: "999999",
        });
        yarg.option("ticketPrice", {
          type: "number",
          describe: "price of ticket",
          default: 1,
        });
        yarg.option("drawDuration", {
          type: "number",
          describe: "draw duration in seconds",
          default: 100,
        });
        yarg.option("lotteryName", {
          type: "string",
          describe: "lottery name",
          default: "test-lottery",
        });
      },
      init
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
    .example("$0 create", "test")
    .parse();
  
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function create(program: Program<NoLossLottery>, clientAccounts: ClientAccounts, argv: any): Promise<void> {
  const { payer, cluster, rpcUrl, queueKey, keypair, maxResult, drawDuration, ticketPrice, lotteryName } = argv;
  const payerKeypair = loadKeypair(payer);
  const switchboardProgram = await loadSwitchboardProgram(
    payerKeypair,
    cluster,
    rpcUrl
  );
  const vrfclientProgram = await loadVrfClientProgram(
    payerKeypair,
    cluster,
    rpcUrl
  );

  const vaultManager = new PublicKey(clientAccounts.vaultManager);

  const vrfSecret = keypair
    ? loadKeypair(keypair)
    : anchor.web3.Keypair.generate();

  // create state account but dont send instruction
  // need public key for VRF CPI
  const [stateAccount, stateBump] = VrfClient.fromSeed(
    vrfclientProgram,
    vrfSecret.publicKey,
    payerKeypair.publicKey // client state authority
  );
  try {
    await stateAccount.loadData();
  } catch {}

  console.log(`client bump: ${stateBump}`);

  console.log(chalk.yellow("######## CREATE VRF ACCOUNT ########"));

  const queue = new OracleQueueAccount({
    program: switchboardProgram,
    publicKey: new PublicKey(queueKey),
  });
  const { unpermissionedVrfEnabled, authority } = await queue.loadData();

  const ixCoder = new anchor.BorshInstructionCoder(vrfclientProgram.idl);

  const callback: Callback = {
    programId: vrfclientProgram.programId,
    accounts: [
      // ensure all accounts in updateResult are populated
      { pubkey: stateAccount.publicKey, isSigner: false, isWritable: true },
      { pubkey: vrfSecret.publicKey, isSigner: false, isWritable: false },
      { pubkey: vaultManager, isSigner: false, isWritable: true },
    ],
    ixData: ixCoder.encode("updateResult", ""), // pass any params for instruction here
  };

  console.log(
    toAccountString(
      "Callback",
      JSON.stringify(
        callback,
        (key, value) => {
          if (value instanceof PublicKey) {
            return value.toString();
          }
          if (key === "ixData" || value instanceof Buffer) {
            return buffer2string(value);
          }
          return value;
        },
        2
      )
    )
  );

  const vrfAccount = await VrfAccount.create(switchboardProgram, {
    queue,
    callback,
    authority: stateAccount.publicKey, // vrf authority
    keypair: vrfSecret,
  });
  console.log(toAccountString(`VRF Account`, vrfAccount.publicKey));

  const permissionAccount = await PermissionAccount.create(switchboardProgram, {
    authority: (await queue.loadData()).authority,
    granter: queue.publicKey,
    grantee: vrfAccount.publicKey,
  });
  console.log(toAccountString(`VRF Permission`, permissionAccount.publicKey));

  if (!unpermissionedVrfEnabled) {
    if (!payerKeypair.publicKey.equals(authority)) {
      throw new Error(
        `queue requires PERMIT_VRF_REQUESTS and wrong queue authority provided`
      );
    }
    await permissionAccount.set({
      authority: payerKeypair,
      permission: SwitchboardPermission.PERMIT_VRF_REQUESTS,
      enable: true,
    });
  }
  const permissionData = await permissionAccount.loadData();

  console.log(
    toAccountString(
      `     Permissions`,
      toPermissionString(permissionData.permissions)
    )
  );

  console.log(chalk.yellow("######## INIT PROGRAM STATE ########"));

  await program.rpc.initState(
    {
      clientStateBump: stateBump,
      maxResult: new anchor.BN(maxResult),
      drawDuration: new anchor.BN(drawDuration),
      ticketPrice: new anchor.BN(ticketPrice),
      lotteryName: lotteryName 
    },
    {
      accounts: {
        state: stateAccount.publicKey,
        authority: payerKeypair.publicKey,
        payer: payerKeypair.publicKey,
        vrf: vrfAccount.publicKey,
        depositMint: clientAccounts.depositMint,
        yieldMint: clientAccounts.yieldMint,
        depositVault: clientAccounts.depositVault,
        yieldVault: clientAccounts.yieldVault,
        vaultManager: clientAccounts.vaultManager,
        collectionMint: clientAccounts.collectionMint,
        collectionMetadata: clientAccounts.collectionMetadata,
        collectionMasterEdition: clientAccounts.collectionMasterEdition,
        collectionAta: clientAccounts.collectionAta,
        user: program.provider.wallet.publicKey,
        metadataProgram: MetadataProgram.PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
 
      signers: [payerKeypair, payerKeypair],
    }
  );
  console.log(toAccountString("Program State", stateAccount.publicKey));
  const state = await stateAccount.loadData();
  const permission = await permissionAccount.loadData();

  console.log(
    `${chalk.blue(
      "Run the following command to watch the Switchboard vrf:"
    )}\n\t${chalk.white(
      "ts-node ./sdk/scripts/watch.ts watch",
      vrfAccount.publicKey.toString(),
      "--rpcUrl",
      rpcUrl,
      "--cluster",
      cluster
    )}`
  );
  console.log(
    `${chalk.blue(
      "Run the following command to watch the client program:"
    )}\n\t${chalk.white(
      "ts-node ./sdk/scripts/watch.ts watch",
      stateAccount.publicKey.toString(),
      "--rpcUrl",
      rpcUrl,
      "--cluster",
      cluster
    )}`
  );
  console.log(
    `${chalk.blue(
      "Run the following command to request a new ranomness value:"
    )}\n\t${chalk.white(
      "ts-node ./sdk/scripts/request.ts request",
      vrfAccount.publicKey.toString(),
      "--payer",
      payer,
      "--rpcUrl",
      rpcUrl,
      "--cluster",
      cluster
    )}`
  );

  if (!keypair) {
    fs.writeFileSync(
      path.join(
        process.cwd(),
        `./secrets/vrf_account_${vrfSecret.publicKey}-keypair.json`
      ),
      `[${vrfSecret.secretKey}]`
    );
  }

  const outFile = path.join(
    process.cwd(),
    `state_${stateAccount.publicKey}.json`
  );
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        programState: stateAccount.publicKey.toString(),
        maxResult: state.maxResult.toString(),
        vrf: {
          publicKey: vrfAccount.publicKey.toString(),
          authority: state.authority.toString(),
          permissionPubkey: permissionAccount.publicKey.toString(),
          permissions: toPermissionString(permission.permissions),
        },
      },
      undefined,
      2
    )
  );
}

initialize().then(
  () => {
    return;
  },
  (error) => {
    console.error(error);
    return;
  }
);
