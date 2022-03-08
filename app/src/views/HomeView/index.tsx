import { FC, useState } from "react";
import * as spl from "@solana/spl-token";
import { Program } from "@project-serum/anchor";
import { AnchorWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import * as anchor from '@project-serum/anchor';
import { NoLossLottery } from "../../../../target/types/no_loss_lottery";
import { TicketCard } from "./ticketcard";
import styles from "./index.module.css";
import {
  ConfirmOptions,
  MemcmpFilter,
  GetProgramAccountsConfig,
  DataSizeFilter,
} from "@solana/web3.js";

export type Maybe<T> = T | null;

const IDL = require("../../../../target/idl/no_loss_lottery.json");

export default function useProgram(connection: anchor.web3.Connection, wallet: AnchorWallet): Program<NoLossLottery> {
  // Use confirmed to ensure that blockchain state is valid
  const opts: ConfirmOptions = {
    preflightCommitment: "confirmed",
    commitment: "confirmed",
  };
  const provider = new anchor.Provider(
    connection,
    wallet,
    opts
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

const mint = "7Bwd6FV3SwewtgjkQuw6BrSRWBg4Sm1oq33JuwmxkyvD";

let tks: Array<TicketData> = new Array();

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

class TicketData {
  pk: anchor.web3.PublicKey;
  numbers: Array<number>;

  constructor(pk: anchor.web3.PublicKey, numbers: Array<number>) {
    this.pk = pk;
    this.numbers = numbers;
  }
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

async function redeem(
  program: Program<NoLossLottery>,
  config: Config,
  ticket: anchor.web3.PublicKey,
) {
  try {
    // user redeem token
    const redeemTxSig = await program.rpc.redeem({
      accounts: {
        mint: config.keys.get(MINT)!,
        vault: config.keys.get(VAULT)!,
        tickets: config.keys.get(TICKETS)!,
        vaultManager: config.keys.get(VAULT_MANAGER)!,
        ticket: ticket,
        prize: config.keys.get(PRIZE)!,
        userTicketsAta: config.keys.get(USER_TICKET_ATA)!,
        user: program.provider.wallet.publicKey,
        userDepositAta: config.keys.get(USER_DEPOSIT_ATA)!,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
    console.log("redeemTxSig:", redeemTxSig);
  } catch (e) {
    console.log(e);
  }
}

export const HomeView: FC = ({}) => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [t, setTickets] = useState<TicketData[]>([]);

  const buyTicket = async () => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);
      console.log("program: %s", program.programId.toString())
      console.log("buy");

      const mintPK = new anchor.web3.PublicKey(mint); 
      const config = await deriveConfig(program, mintPK);

      const numbers = [2, 3, 6, 10, 11, 12];
      const [ticket, ticketBump] = await buy(program, numbers, config);

      viewTickets();
    }
  };

  const viewTickets = async () => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);
      console.log("program: %s", program.programId.toString())

      // Get accounts associated with the connected wallet
      const walletMemcmp: MemcmpFilter = {
        memcmp: {
          offset: 104,
          bytes: wallet.publicKey.toBase58(),
        }
      };
      // Get ticket PDAs by matching with the account size
      const sizeFilter: DataSizeFilter = {
        dataSize: 142,
      }
      const filters = [walletMemcmp, sizeFilter];
      const config: GetProgramAccountsConfig = { filters: filters };
      const accounts = await connection.getProgramAccounts(program.programId, config);
      console.log("accounts %d", accounts.length);

      tks = [];

      for (let account of accounts) {
        console.log(account.pubkey.toString());
        const ticket = await program.account.ticket.fetch(account.pubkey);
        console.log("ticket: %v", ticket.numbers);
        const tk = new TicketData(account.pubkey, ticket.numbers);
        tks.push(tk);
      }

      setTickets(tks);
    }
  };

  const redeemTicket = async (address: string) => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);
      console.log("redeem %s", address);

      const mintPK = new anchor.web3.PublicKey(mint); 
      const ticketPK = new anchor.web3.PublicKey(address); 
      const config = await deriveConfig(program, mintPK);
      await redeem(program, config, ticketPK);

      viewTickets();
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
          {wallet ?
          <>
          <button className="btn btn-primary normal-case btn-xs" onClick={buyTicket} >
            Buy Ticket
          </button>
          <button className="btn btn-primary normal-case btn-xs" onClick={viewTickets} >
            View Tickets
          </button>
          </> 
          : null}
          <div className="container mx-auto max-w-6xl p-8 2xl:px-0">
            <div className="tks">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
                {tks?.map((tk) => (
                  <TicketCard
                    key={tk.pk.toString()}
                    address={tk.pk.toString()}
                    numbers={tk.numbers}
                    onSelect={(address: string) => { redeemTicket(address) }}
                    />
                ))}
              </div>
            </div>
          </div>
       </div>
      </div>
    </div>
  );
};
