import { FC } from "react";
import * as spl from "@solana/spl-token";
import { Program } from "@project-serum/anchor";
import { AnchorWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import * as anchor from '@project-serum/anchor';
import { NoLossLottery } from "../../../../target/types/no_loss_lottery"
import * as assert from "assert";
import styles from "./index.module.css";
import { publicKey } from "@project-serum/anchor/dist/cjs/utils";

export type Maybe<T> = T | null;

const IDL = require("../../../../target/idl/no_loss_lottery.json");

export default function useProgram(connection: anchor.web3.Connection, wallet: AnchorWallet): Program<NoLossLottery> {
  const provider = new anchor.Provider(
    connection,
    wallet,
    anchor.Provider.defaultOptions(),
  );
  const programId = new anchor.web3.PublicKey(IDL.metadata.address);
  console.log("programId: %s", programId.toString());
  return new anchor.Program(IDL, programId, provider);
}

const VAULT = "VAULT";
const VAULT_MANAGER = "VAULT_MANAGER";
const MINT = "MINT";
const TICKETS = "TICKETS";
const PRIZE = "PRIZE";
const USER_DEPOSIT_ATA = "USER_DEPOSIT_ATA";
const USER_TICKET_ATA = "USER_TICKET_ATA";

const mint = "5Rk5GXgcvFoYePsivWGzFsWHpaqn9Y7hsJsGsn9Fp7oa";

async function deriveConfig(
  program: anchor.Program<NoLossLottery>,
  mint: anchor.web3.PublicKey): Promise<Config> {

  const [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
    [mint.toBuffer()],
    program.programId
  );
  
  const [vaultMgr, vaultMgrBump] = await anchor.web3.PublicKey.findProgramAddress(
      [mint.toBuffer(), vault.toBuffer()],
      program.programId
    );

  const [tickets, ticketsBump] = await anchor.web3.PublicKey.findProgramAddress(
    [mint.toBuffer(), vault.toBuffer(), vaultMgr.toBuffer()],
    program.programId
  );

  const [prize, prizeBump] = await anchor.web3.PublicKey.findProgramAddress(
    [
      mint.toBuffer(),
      vault.toBuffer(),
      vaultMgr.toBuffer(),
      tickets.toBuffer(),
    ],
    program.programId
  );

  const userDepositAta = await spl.getAssociatedTokenAddress(
    mint,
    program.provider.wallet.publicKey
  );

  const userTicketsAta = await spl.getAssociatedTokenAddress(
    tickets,
    program.provider.wallet.publicKey,
  );

  let keys = new Map<String, anchor.web3.PublicKey>();
  keys.set(VAULT, vault);
  keys.set(VAULT_MANAGER, vaultMgr);
  keys.set(MINT, mint);
  keys.set(TICKETS, tickets);
  keys.set(PRIZE, prize);
  keys.set(USER_TICKET_ATA, userTicketsAta);
  keys.set(USER_DEPOSIT_ATA, userDepositAta);

  console.log('mint: %s', mint.toString());
  console.log('vault: %s', vault.toString());
  console.log('vaultManager: %s', vaultMgr.toString());
  console.log('tickets: %s', tickets.toString());
  console.log('prize: %s', prize.toString());
  console.log('userTicketsAta: %s', userTicketsAta.toString());
  console.log('userDepositAta: %s', userDepositAta.toString());

  console.log(keys);

  return {
    keys: keys,
  };
}

interface Config {
  keys: Map<String, anchor.web3.PublicKey>;
}

async function buy(
  program: Program<NoLossLottery>,
  numbers: Array<number>,
  config: Config,
): Promise<[anchor.web3.PublicKey, number]> {
  // create ticket PDA
  const [ticket, ticketBump] = await anchor.web3.PublicKey.findProgramAddress(
    [Uint8Array.from(numbers), config.keys.get(VAULT_MANAGER)!.toBuffer()],
    program.programId
  );

  console.log("ticket: %s", ticket.toString());

  try {
    // buy a ticket
    const buyTxSig = await program.rpc.buy(numbers, {
      accounts: {
        mint: config.keys.get(MINT)!,
        vault: config.keys.get(VAULT)!,
        vaultManager: config.keys.get(VAULT_MANAGER)!,
        tickets: config.keys.get(TICKETS)!,
        ticket: ticket,
        userTicketsAta: config.keys.get(USER_TICKET_ATA)!,
        user: program.provider.wallet.publicKey,
        userDepositAta: config.keys.get(USER_DEPOSIT_ATA)!,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
    console.log("buySigTx:", buyTxSig);
  } catch (e) {
    console.log(e);
  }
  return [ticket, ticketBump];
}

function assertPublicKey(
  f: Function,
  key1: anchor.web3.PublicKey,
  key2: anchor.web3.PublicKey
) {
  return f(key1.toString(), key2.toString());
}

export const HomeView: FC = ({}) => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const buyTicket = async () => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);
      console.log("program: %s", program.programId.toString())
      console.log("buy");

      const mintPK = new anchor.web3.PublicKey(mint); 
      const config = await deriveConfig(program, mintPK);

      const numbers = [4, 8, 9, 10, 11, 12];
      const [ticket, ticketBump] = await buy(program, numbers, config);
      const userKey = await program.account.ticket.fetch(ticket);
    assertPublicKey(
      assert.equal,
      program.provider.wallet.publicKey,
      userKey.owner
    );
    }
  };

  return (
    <div className="container mx-auto max-w-6xl p-8 2xl:px-0">
      <div className={styles.container}>
        <div className="navbar mb-2 shadow-lg bg-neutral text-neutral-content rounded-box">
          <div className="flex-none">
            <button className="btn btn-square btn-ghost">
              <span className="text-4xl">🎰</span>
            </button>
          </div>
          <div className="flex-1 px-2 mx-2">
            <span className="text-lg font-bold">No Loss Lottery</span>
          </div>
          <div className="flex-none">
            <WalletMultiButton className="btn btn-ghost" />
          </div>
        </div>

        <div className="text-center pt-2">
          <div className="hero min-h-16 py-4">
            <div className="text-center hero-content">
              <div className="max-w-lg">
                <h1 className="mb-5 text-5xl font-bold">
                  No Loss Lottery
                </h1>
                <p className="mb-5">
                  Solana wallet adapter is connected and ready.
                </p>
                <p>
                  {wallet ? <>Your address: {wallet.publicKey.toBase58()}</> : null}
                </p>
              </div>
            </div>
          </div>
        <button className="btn btn-primary normal-case btn-xs" onClick={buyTicket} >
          Buy Ticket
        </button>

       </div>
      </div>
    </div>
  );
};
