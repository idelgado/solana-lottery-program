import { FC, useEffect, useState, useRef, ChangeEvent } from "react";
import * as spl from "@solana/spl-token";
import * as tokenSwap from "@solana/spl-token-swap";
import { Program } from "@project-serum/anchor";
import { AnchorWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import * as anchor from "@project-serum/anchor";
import { NoLossLottery } from "../../../../target/types/no_loss_lottery";
import { TicketCard } from "./ticketcard";
import styles from "./index.module.css";
import CountDownTimer from "components/CountDownTimer";
import {
  ConfirmOptions,
  MemcmpFilter,
  GetProgramAccountsConfig,
  DataSizeFilter,
} from "@solana/web3.js";
import {
  MetadataProgram,
  Metadata,
  Edition,
} from "@metaplex-foundation/mpl-token-metadata";

export type Maybe<T> = T | null;

const IDL = require("../../../../target/idl/no_loss_lottery.json");

export default function useProgram(
  connection: anchor.web3.Connection,
  wallet: AnchorWallet
): Program<NoLossLottery> {
  // Use confirmed to ensure that blockchain state is valid
  const opts: ConfirmOptions = {
    preflightCommitment: "confirmed",
    commitment: "confirmed",
  };
  const provider = new anchor.Provider(connection, wallet, opts);
  const programId = new anchor.web3.PublicKey(IDL.metadata.address);
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

// collection
const COLLECTION_MINT = "COLLECTION_MINT";
const COLLECTION_METADATA = "COLLECTION_METADATA";
const COLLECTION_MASTER_EDITION = "COLLECTION_MASTER_EDITION";
const COLLECTION_ATA = "COLLECTION_ATA";

const collectionMint = new anchor.web3.PublicKey(
  process.env.NEXT_PUBLIC_collectionMint!
);
const collectionMetadata = new anchor.web3.PublicKey(
  process.env.NEXT_PUBLIC_collectionMetadata!
);
const collectionMasterEdition = new anchor.web3.PublicKey(
  process.env.NEXT_PUBLIC_collectionMasterEdition!
);
const collectionAta = new anchor.web3.PublicKey(
  process.env.NEXT_PUBLIC_collectionAta!
);

const depositMint = process.env.NEXT_PUBLIC_depositMint!;
const yieldMint = process.env.NEXT_PUBLIC_yieldMint!;
const swapDepositVault = new anchor.web3.PublicKey(
  process.env.NEXT_PUBLIC_swapDepositVault!
);
const swapYieldVault = new anchor.web3.PublicKey(
  process.env.NEXT_PUBLIC_swapYieldVault!
);
const poolMint = new anchor.web3.PublicKey(process.env.NEXT_PUBLIC_poolMint!);
const tokenSwapAccount = new anchor.web3.PublicKey(
  process.env.NEXT_PUBLIC_amm!
);
const tokenSwapAuthority = new anchor.web3.PublicKey(
  process.env.NEXT_PUBLIC_ammAuthority!
);
const poolFee = new anchor.web3.PublicKey(process.env.NEXT_PUBLIC_poolFee!);

let hoursMinSecs = { hours: 0, minutes: 0, seconds: 0 };

function getTimeRemaining(endtime: number) {
  const now = Date.parse(new Date().toUTCString()) / 1000;
  const total = endtime - now;
  const seconds = total > 0 ? Math.floor(total % 60) : 0;
  const minutes = total > 0 ? Math.floor((total / 60) % 60) : 0;
  const hours = total > 0 ? Math.floor((total / (60 * 60)) % 24) : 0;
  const days = total > 0 ? Math.floor(total / (60 * 60 * 24)) : 0;

  return { total, days, hours, minutes, seconds };
}

async function deriveConfig(
  program: anchor.Program<NoLossLottery>,
  depositMint: anchor.web3.PublicKey,
  yieldMint: anchor.web3.PublicKey
): Promise<Config> {
  const [depositVault, _depositVaultBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [depositMint.toBuffer()],
      program.programId
    );

  const [yieldVault, _yieldVaultBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [yieldMint.toBuffer()],
      program.programId
    );

  const [vaultMgr, _vaultMgrBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [
        depositMint.toBuffer(),
        yieldMint.toBuffer(),
        depositVault.toBuffer(),
        yieldVault.toBuffer(),
      ],
      program.programId
    );

  const [tickets, _ticketsBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [
        depositMint.toBuffer(),
        yieldMint.toBuffer(),
        depositVault.toBuffer(),
        yieldVault.toBuffer(),
        vaultMgr.toBuffer(),
      ],
      program.programId
    );

  const userDepositAta = await spl.getAssociatedTokenAddress(
    depositMint,
    program.provider.wallet.publicKey
  );

  const userTicketsAta = await spl.getAssociatedTokenAddress(
    tickets,
    program.provider.wallet.publicKey
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

  // collection info
  keys.set(COLLECTION_MINT, collectionMint);
  keys.set(COLLECTION_METADATA, collectionMetadata);
  keys.set(COLLECTION_MASTER_EDITION, collectionMasterEdition);
  keys.set(COLLECTION_ATA, collectionAta);

  // token swap keys
  keys.set(SWAP_YIELD_VAULT, swapYieldVault);
  keys.set(SWAP_DEPOSIT_VAULT, swapDepositVault);
  keys.set(POOL_MINT, poolMint);
  keys.set(TOKEN_SWAP_ACCOUNT, tokenSwapAccount);
  keys.set(TOKEN_SWAP_ACCOUNT_AUTHORITY, tokenSwapAuthority);
  keys.set(POOL_FEE, poolFee);

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
  config: Config
): Promise<[anchor.web3.PublicKey, number]> {
  // create ticket PDA
  const [ticket, ticketBump] = await anchor.web3.PublicKey.findProgramAddress(
    [Uint8Array.from(numbers), config.keys.get(VAULT_MANAGER)!.toBuffer()],
    program.programId
  );

  const ticketMint = anchor.web3.Keypair.generate();

  const lamports = await spl.getMinimumBalanceForRentExemptMint(
    program.provider.connection
  );

  const transaction = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: program.provider.wallet.publicKey,
      newAccountPubkey: ticketMint.publicKey,
      space: spl.MINT_SIZE,
      lamports,
      programId: spl.TOKEN_PROGRAM_ID,
    }),
    spl.createInitializeMintInstruction(
      ticketMint.publicKey,
      0,
      config.keys.get(VAULT_MANAGER)!,
      null,
      spl.TOKEN_PROGRAM_ID
    )
  );

  const createMintTxSig = await program.provider.send(transaction, [
    ticketMint,
  ]);
  console.log("createMintTxSig:", createMintTxSig);

  const userTicketAta = await spl.getAssociatedTokenAddress(
    ticketMint.publicKey,
    program.provider.wallet.publicKey
  );

  const ticketMetadata = await Metadata.getPDA(ticketMint.publicKey);
  const ticketMasterEdition = await Edition.getPDA(ticketMint.publicKey);

  try {
    // buy a ticket
    const buyTxSig = await program.rpc.buy(numbers, {
      accounts: {
        depositMint: config.keys.get(DEPOSIT_MINT)!,
        yieldMint: config.keys.get(YIELD_MINT)!,
        depositVault: config.keys.get(DEPOSIT_VAULT)!,
        yieldVault: config.keys.get(YIELD_VAULT)!,
        vaultManager: config.keys.get(VAULT_MANAGER)!,
        collectionMint: config.keys.get(COLLECTION_MINT)!,
        collectionMasterEdition: config.keys.get(COLLECTION_MASTER_EDITION)!,
        collectionMetadata: config.keys.get(COLLECTION_METADATA)!,
        ticket: ticket,
        ticketMint: ticketMint.publicKey,
        ticketMetadata: ticketMetadata,
        ticketMasterEdition: ticketMasterEdition,
        userTicketAta: userTicketAta,
        user: program.provider.wallet.publicKey,
        userDepositAta: config.keys.get(USER_DEPOSIT_ATA)!,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        metadataProgram: MetadataProgram.PUBKEY,
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
  ticket: anchor.web3.PublicKey
) {
  const ticketAccount = await program.account.ticket.fetch(ticket);

  const userTicketAta = await spl.getAssociatedTokenAddress(
    ticketAccount.ticketMint,
    program.provider.wallet.publicKey
  );

  try {
    // user redeem token
    const redeemTxSig = await program.rpc.redeem({
      accounts: {
        depositMint: config.keys.get(DEPOSIT_MINT)!,
        yieldMint: config.keys.get(YIELD_MINT)!,
        depositVault: config.keys.get(DEPOSIT_VAULT)!,
        yieldVault: config.keys.get(YIELD_VAULT)!,
        ticketMint: ticketAccount.ticketMint,
        vaultManager: config.keys.get(VAULT_MANAGER)!,
        collectionMint: config.keys.get(COLLECTION_MINT)!,
        ticket: ticket,
        swapYieldVault: config.keys.get(SWAP_YIELD_VAULT)!,
        swapDepositVault: config.keys.get(SWAP_DEPOSIT_VAULT)!,
        poolMint: config.keys.get(POOL_MINT)!,
        amm: config.keys.get(TOKEN_SWAP_ACCOUNT)!,
        ammAuthority: config.keys.get(TOKEN_SWAP_ACCOUNT_AUTHORITY)!,
        poolFee: config.keys.get(POOL_FEE)!,
        userTicketAta: userTicketAta,
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
  const [d, setDashboard] = useState<Array<String>>([]);

  // Temporary workaround in lieu of subscriptions
  useEffect(() => {
    const interval = setInterval(() => {
      viewDashboard();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const oneRef = useRef<HTMLInputElement>(null);
  const twoRef = useRef<HTMLInputElement>(null);
  const threeRef = useRef<HTMLInputElement>(null);
  const fourRef = useRef<HTMLInputElement>(null);
  const fiveRef = useRef<HTMLInputElement>(null);
  const sixRef = useRef<HTMLInputElement>(null);

  const buyTicket = async () => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);
      console.log("buy");

      const depositMintPK = new anchor.web3.PublicKey(depositMint);
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

      oneRef.current!.value = "";
      twoRef.current!.value = "";
      threeRef.current!.value = "";
      fourRef.current!.value = "";
      fiveRef.current!.value = "";
      sixRef.current!.value = "";

      viewDashboard();
      viewTickets();
    }
  };

  const viewTickets = async () => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);

      const tokenMints: Array<anchor.web3.PublicKey> = [];
      const accountsCtx =
        await program.provider.connection.getParsedTokenAccountsByOwner(
          program.provider.wallet.publicKey,
          {
            programId: spl.TOKEN_PROGRAM_ID,
          }
        );
      accountsCtx.value.map(({ pubkey, account }) => {
        let parsedData = account.data as anchor.web3.ParsedAccountData;
        tokenMints.push(parsedData.parsed.info.mint as anchor.web3.PublicKey);
      });

      let newTks = [];
      for (let mint of tokenMints) {
        // Get accounts associated with the connected wallet
        const walletMemcmp: MemcmpFilter = {
          memcmp: {
            offset: 72,
            bytes: mint.toString(),
          },
        };
        // Get ticket PDAs by matching with the account size
        const sizeFilter: DataSizeFilter = {
          dataSize: 110,
        };
        const filters = [walletMemcmp, sizeFilter];
        const config: GetProgramAccountsConfig = { filters: filters };
        const accounts = await connection.getProgramAccounts(
          program.programId,
          config
        );
        console.log("accounts %d", accounts.length);

        for (let account of accounts) {
          const ticket = await program.account.ticket.fetch(account.pubkey);
          console.log("ticket: %v", ticket.numbers);
          const tk = new TicketData(account.pubkey, ticket.numbers);
          newTks.push(tk);
        }
      }

      if (!arraysEqual(newTks, t)) {
        setTickets(newTks);
      }
    }
  };

  const viewDashboard = async () => {
    if (connection && wallet) {
      const program = useProgram(connection, wallet);

      const deposit = new anchor.web3.PublicKey(
        process.env.NEXT_PUBLIC_depositVault!
      );
      const depositTokenBalance =
        await program.provider.connection.getTokenAccountBalance(deposit);
      console.log("deposit vault: %s", depositTokenBalance.value.amount);

      const yieldVault = new anchor.web3.PublicKey(
        process.env.NEXT_PUBLIC_yieldVault!
      );
      const yieldTokenBalance =
        await program.provider.connection.getTokenAccountBalance(yieldVault);
      console.log("yield vault: %s", yieldTokenBalance.value.amount);

      const vaultManager = new anchor.web3.PublicKey(
        process.env.NEXT_PUBLIC_vaultManager!
      );
      const vaultManagerAccount = await program.account.vaultManager.fetch(
        vaultManager
      );

      const timeValues = getTimeRemaining(
        vaultManagerAccount.cutoffTime.toNumber()
      );
      hoursMinSecs = {
        hours: timeValues.days * 24 + timeValues.hours,
        minutes: timeValues.minutes,
        seconds: timeValues.seconds,
      };

      let newDashboard = [];
      let drawing = "N/A";
      if (
        vaultManagerAccount.previousWinningNumbers.toString() !== "0,0,0,0,0,0"
      ) {
        drawing = vaultManagerAccount.previousWinningNumbers.join(" ");
      }
      newDashboard = [
        depositTokenBalance.value.amount,
        yieldTokenBalance.value.amount,
        drawing,
      ];

      if (JSON.stringify(newDashboard) !== JSON.stringify(d)) {
        setDashboard(newDashboard);
      }
    }
  };

  function arraysEqual(a1: Array<TicketData>, a2: Array<TicketData>) {
    /* WARNING: arrays must not contain {objects} or behavior may be undefined */
    return JSON.stringify(a1) == JSON.stringify(a2);
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

      viewDashboard();
      viewTickets();
    }
  };

  const onChange = (e: ChangeEvent) => {
    const target = e.target as HTMLInputElement;
    const is_valid = /^\d{1}$/.test(target.value);
    console.log("onChange %d", is_valid);
    if (!is_valid) {
      target.value = "";
    }
  };

  viewDashboard();
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

        {wallet ? (
          <div className="container mx-auto max-w-6xl p-4 2xl:px-0 divide-y">
            <h1 className="py-2 px-4 mb-1">Dashboard</h1>
            <div className="flex flex-col w-full">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-1 my-3 w-full">
                <div className="metric-card bg-gray-900 bg-opacity-40 rounded-lg p-4 max-w-72 w-full">
                  <div className="flex items-center text-white dark:text-black">
                    Draw Time
                  </div>
                  <div className="mt-2 text-3xl font-bold spacing-sm text-white text-center dark:text-black">
                    <CountDownTimer hoursMinSecs={hoursMinSecs} />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 my-3 w-full">
                <div className="metric-card bg-gray-900 bg-opacity-40 rounded-lg p-4 max-w-72 w-full">
                  <div className="flex items-center text-white dark:text-black">
                    Deposit Vault
                  </div>
                  <p className="mt-2 text-3xl font-bold spacing-sm text-white dark:text-black">
                    {d[0]}
                  </p>
                </div>
                <div className="metric-card bg-gray-900 bg-opacity-40 rounded-lg p-4 max-w-72 w-full">
                  <div className="flex items-center text-white dark:text-black">
                    Yield Vault
                  </div>
                  <p className="mt-2 text-3xl font-bold spacing-sm text-white dark:text-black">
                    {d[1]}
                  </p>
                </div>
                <div className="metric-card bg-gray-900 bg-opacity-40 rounded-lg p-4 max-w-72 w-full">
                  <div className="flex items-center text-white dark:text-black">
                    Winning Numbers
                  </div>
                  <p className="mt-2 text-3xl font-bold spacing-sm text-white dark:text-black">
                    {d[2]}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="container mx-auto max-w-6xl p-4 2xl:px-0 divide-y">
          {t.length > 0 ? <h1 className="py-2 px-4 mb-1">Tickets</h1> : null}
          <div className="tks">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 items-start">
              {t?.map((t) => (
                <TicketCard
                  key={t.pk.toString()}
                  address={t.pk.toString()}
                  numbers={t.numbers}
                  onSelect={(address: string) => {
                    redeemTicket(address);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        {wallet ? (
          <div className="container mx-auto max-w-6xl p-4 2xl:px-0 divide-y">
            <h1 className="py-2 px-4 mb-1">Buy Ticket</h1>
            <div className="p-4">
              <div className="w-full flex items-center justify-center">
                <div className="w-3/4 flex flex-wrap items-center justify-center -mx-3">
                  <div className="w-20 px-3">
                    <input
                      className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none"
                      id="grid-one"
                      type="text"
                      placeholder="0"
                      maxLength={1}
                      ref={oneRef}
                      onChange={(e) => onChange(e)}
                    />
                  </div>
                  <div className="w-20 px-3">
                    <input
                      className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none"
                      id="grid-two"
                      type="text"
                      placeholder="0"
                      maxLength={1}
                      ref={twoRef}
                      onChange={(e) => onChange(e)}
                    />
                  </div>
                  <div className="w-20 px-3">
                    <input
                      className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none"
                      id="grid-three"
                      type="text"
                      placeholder="0"
                      maxLength={1}
                      ref={threeRef}
                      onChange={(e) => onChange(e)}
                    />
                  </div>
                  <div className="w-20 px-3">
                    <input
                      className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none"
                      id="grid-four"
                      type="text"
                      placeholder="0"
                      maxLength={1}
                      ref={fourRef}
                      onChange={(e) => onChange(e)}
                    />
                  </div>
                  <div className="w-20 px-3">
                    <input
                      className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none"
                      id="grid-five"
                      type="text"
                      placeholder="0"
                      maxLength={1}
                      ref={fiveRef}
                      onChange={(e) => onChange(e)}
                    />
                  </div>
                  <div className="w-20 px-3">
                    <input
                      className="block w-full bg-gray-200 text-gray-700 border rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white appearance-none"
                      id="grid-six"
                      type="text"
                      placeholder="0"
                      maxLength={1}
                      ref={sixRef}
                      onChange={(e) => onChange(e)}
                    />
                  </div>
                </div>
              </div>
              <div className="text-center">
                <button
                  className="btn btn-primary normal-case btn-sm"
                  onClick={buyTicket}
                >
                  Buy
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
