import { FC, useState, useRef } from "react";
import * as spl from "@solana/spl-token";
import * as tokenSwap from "@solana/spl-token-swap";
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

const DEPOSIT_MINT = "DEPOSIT_MINT";
const YIELD_MINT = "YIELD_MINT";
const DEPOSIT_VAULT = "DEPOSIT_VAULT";
const YIELD_VAULT = "YIELD_VAULT";
const VAULT_MANAGER = "VAULT_MANAGER";
const TICKETS = "TICKETS";
const USER_DEPOSIT_ATA = "USER_DEPOSIT_ATA";
const USER_TICKET_ATA = "USER_TICKET_ATA";
const SWAP_YIELD_VAULT = "SWAP_YIELD_VAULT";
const SWAP_DEPOSIT_VAULT = "SWAP_DEPOSIT_VAULT";
const POOL_MINT = "POOL_MINT";
const TOKEN_SWAP_ACCOUNT = "TOKEN_SWAP_ACCOUNT";
const TOKEN_SWAP_ACCOUNT_AUTHORITY = "TOKEN_SWAP_ACCOUNT_AUTHORITY";
const POOL_FEE = "POOL_FEE";

const depositMint = "AUjY2fwuC85NjwF5gK3kJF2JNDjMM835bBsMcwvcktLD";
const yieldMint = "GQvwSBLcKm27ud5Lwe1pA1d3oQdPPmQ3AazMXo6cre4A";
const swapDepositVault = new anchor.web3.PublicKey("DGNFck1MMWwampNN9cRcorCQDVmiGkjaeyMCAACo23jL");
const swapYieldVault = new anchor.web3.PublicKey("2xLgmdNVwkB51o9sMVujgxoKACnjVsj7pxFD7ncG7y1W");
const poolMint = new anchor.web3.PublicKey("BQnR8yQUq2WVLybCsFUvwpodig3xp69wWbDjG2DyDx7b");
const tokenSwapAccount = new anchor.web3.PublicKey("2FQ5MxNAP6AMEFj434uL2CZAgquG4d85uotRY58MABYN");
const tokenSwapAuthority = new anchor.web3.PublicKey("AhCwD3a9KvoZwYukDnVxcx9AjMk68vzv1QxFfvUSd6oG");
const poolFee = new anchor.web3.PublicKey("E9UgGsffnTRxvv4hee7B3JoNinuPZnsYnAZDZnHRWhYE");

async function deriveConfig(
  program: anchor.Program<NoLossLottery>,
  depositMint: anchor.web3.PublicKey,
  yieldMint: anchor.web3.PublicKey): Promise<Config> {

  const [depositVault, _depositVaultBump] = await anchor.web3.PublicKey.findProgramAddress(
    [depositMint.toBuffer()],
    program.programId
  );
  
  const [yieldVault, _yieldVaultBump] = await anchor.web3.PublicKey.findProgramAddress(
    [yieldMint.toBuffer()],
    program.programId
  );
  
  const [vaultMgr, _vaultMgrBump] = await anchor.web3.PublicKey.findProgramAddress(
      [depositMint.toBuffer(), yieldMint.toBuffer(), depositVault.toBuffer(), yieldVault.toBuffer()],
      program.programId
    );

  const [tickets, _ticketsBump] = await anchor.web3.PublicKey.findProgramAddress(
    [depositMint.toBuffer(), yieldMint.toBuffer(), depositVault.toBuffer(), yieldVault.toBuffer(), vaultMgr.toBuffer()],
    program.programId
  );

  const userDepositAta = await spl.getAssociatedTokenAddress(
    depositMint,
    program.provider.wallet.publicKey
  );

  const userTicketsAta = await spl.getAssociatedTokenAddress(
    tickets,
    program.provider.wallet.publicKey,
  );

  let keys = new Map<String, anchor.web3.PublicKey>();
  keys.set(DEPOSIT_MINT, depositMint);
  keys.set(DEPOSIT_VAULT, depositVault);
  keys.set(YIELD_MINT, yieldMint);
  keys.set(YIELD_VAULT, yieldVault);
  keys.set(VAULT_MANAGER, vaultMgr);
  keys.set(TICKETS, tickets);
  keys.set(USER_TICKET_ATA, userTicketsAta);
  keys.set(USER_DEPOSIT_ATA, userDepositAta);

  // token swap keys
  keys.set(SWAP_YIELD_VAULT, swapYieldVault)
  keys.set(SWAP_DEPOSIT_VAULT, swapDepositVault);
  keys.set(POOL_MINT, poolMint);
  keys.set(TOKEN_SWAP_ACCOUNT, tokenSwapAccount);
  keys.set(TOKEN_SWAP_ACCOUNT_AUTHORITY, tokenSwapAuthority);
  keys.set(POOL_FEE, poolFee);

  console.log('depositMint: %s', depositMint.toString());
  console.log('yieldMint: %s', yieldMint.toString());
  console.log('depositVault: %s', depositVault.toString());
  console.log('yieldVault: %s', yieldVault.toString());
  console.log('vaultManager: %s', vaultMgr.toString());
  console.log('tickets: %s', tickets.toString());
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
        depositMint: config.keys.get(DEPOSIT_MINT)!,
        yieldMint: config.keys.get(YIELD_MINT)!,
        depositVault: config.keys.get(DEPOSIT_VAULT)!,
        yieldVault: config.keys.get(YIELD_VAULT)!,
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
        depositMint: config.keys.get(DEPOSIT_MINT)!,
        yieldMint: config.keys.get(YIELD_MINT)!,
        depositVault: config.keys.get(DEPOSIT_VAULT)!,
        yieldVault: config.keys.get(YIELD_VAULT)!,
        tickets: config.keys.get(TICKETS)!,
        vaultManager: config.keys.get(VAULT_MANAGER)!,
        ticket: ticket,
        swapYieldVault: config.keys.get(SWAP_YIELD_VAULT)!,
        swapDepositVault: config.keys.get(SWAP_DEPOSIT_VAULT)!,
        poolMint: config.keys.get(POOL_MINT)!,
        amm: config.keys.get(TOKEN_SWAP_ACCOUNT)!,
        ammAuthority: config.keys.get(TOKEN_SWAP_ACCOUNT_AUTHORITY)!,
        poolFee: config.keys.get(POOL_FEE)!,
        userTicketsAta: config.keys.get(USER_TICKET_ATA)!,
        user: program.provider.wallet.publicKey,
        userDepositAta: config.keys.get(USER_DEPOSIT_ATA)!,
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
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

  const oneRef = useRef<HTMLInputElement>(null);
  const twoRef = useRef<HTMLInputElement>(null);
  const threeRef = useRef<HTMLInputElement>(null);
  const fourRef = useRef<HTMLInputElement>(null);
  const fiveRef = useRef<HTMLInputElement>(null);
  const sixRef = useRef<HTMLInputElement>(null);

  const buyTicket = async () => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);
      console.log("program: %s", program.programId.toString())
      console.log("buy");

      const depositMintPK= new anchor.web3.PublicKey(depositMint); 
      const yieldMintPK = new anchor.web3.PublicKey(yieldMint); 
      const config = await deriveConfig(program, depositMintPK, yieldMintPK);

      const numbers = [
        parseInt(oneRef.current!.value),
        parseInt(twoRef.current!.value),
        parseInt(threeRef.current!.value),
        parseInt(fourRef.current!.value),
        parseInt(fiveRef.current!.value),
        parseInt(sixRef.current!.value),
      ];
      await buy(program, numbers, config);

      oneRef.current!.value = '';
      twoRef.current!.value = '';
      threeRef.current!.value = '';
      fourRef.current!.value = '';
      fiveRef.current!.value = '';
      sixRef.current!.value = '';

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
          offset: 136,
          bytes: wallet.publicKey.toBase58(),
        }
      };
      // Get ticket PDAs by matching with the account size
      const sizeFilter: DataSizeFilter = {
        dataSize: 174,
      }
      const filters = [walletMemcmp, sizeFilter];
      const config: GetProgramAccountsConfig = { filters: filters };
      const accounts = await connection.getProgramAccounts(program.programId, config);
      console.log("accounts %d", accounts.length);

      let newTks = [];

      for (let account of accounts) {
        console.log(account.pubkey.toString());
        const ticket = await program.account.ticket.fetch(account.pubkey);
        console.log("ticket: %v", ticket.numbers);
        const tk = new TicketData(account.pubkey, ticket.numbers);
        newTks.push(tk);
      }

      if (!arraysEqual(newTks, t)) {
        setTickets(newTks);
      }
    }
  };

  function arraysEqual(a1: Array<TicketData>, a2: Array<TicketData>) {
    /* WARNING: arrays must not contain {objects} or behavior may be undefined */
    return JSON.stringify(a1)==JSON.stringify(a2);
  }

  const redeemTicket = async (addr: string) => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);
      console.log("redeem %s", addr);

      const depositMintPK = new anchor.web3.PublicKey(depositMint); 
      const yieldMintPK = new anchor.web3.PublicKey(yieldMint); 
      const ticketPK = new anchor.web3.PublicKey(addr); 
      const config = await deriveConfig(program, depositMintPK, yieldMintPK);
      await redeem(program, config, ticketPK);

      viewTickets();
    }
  };

  viewTickets();

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
        <div className="container mx-auto max-w-6xl p-4 2xl:px-0 divide-y">
          {t.length > 0 ?
            <h1 className="py-2 px-4 mb-1">Tickets</h1>
            : null}
          <div className="tks">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 items-start">
              {t?.map((t) => (
                <TicketCard
                  key={t.pk.toString()}
                  address={t.pk.toString()}
                  numbers={t.numbers}
                  onSelect={(address: string) => { redeemTicket(address) }}
                />
              ))}
            </div>
          </div>
        </div>
        {wallet ?
          <div className="container mx-auto max-w-6xl p-4 2xl:px-0 divide-y">
            <h1 className="py-2 px-4 mb-1">Buy Ticket</h1>
            <div className="p-4">
              <div className="w-full flex items-center justify-center">
                <div className="w-3/4 flex flex-wrap items-center justify-center -mx-3">
                  <div className="w-20 px-3">
                    <input className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none" id="grid-one" type="text" placeholder="0" maxLength={1} ref={oneRef} />
                  </div>
                  <div className="w-20 px-3">
                    <input className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none" id="grid-two" type="text" placeholder="0" maxLength={1} ref={twoRef} />
                  </div>
                  <div className="w-20 px-3">
                    <input className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none" id="grid-three" type="text" placeholder="0" maxLength={1} ref={threeRef} />
                  </div>
                  <div className="w-20 px-3">
                    <input className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none" id="grid-four" type="text" placeholder="0" maxLength={1} ref={fourRef} />
                  </div>
                  <div className="w-20 px-3">
                    <input className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none" id="grid-five" type="text" placeholder="0" maxLength={1} ref={fiveRef} />
                  </div>
                  <div className="w-20 px-3">
                    <input className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none" id="grid-six" type="text" placeholder="0" maxLength={1} ref={sixRef} />
                  </div>
                </div>
              </div>
              <div className="text-center">
                <button className="btn btn-primary normal-case btn-sm" onClick={buyTicket}>
                  Buy
                </button>
              </div>
            </div>
          </div>
          : null}
      </div>
    </div>
  );
};
