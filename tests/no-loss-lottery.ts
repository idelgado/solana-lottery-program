import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import * as assert from "assert";
import * as switchboard from "@switchboard-xyz/switchboard-api";
import { Program } from "@project-serum/anchor";
import { NoLossLottery } from "../target/types/no_loss_lottery";

describe("no-loss-lottery", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Smoke", async () => {
    const mintAuthority = await newAccountWithLamports(
      program.provider.connection
    );

    // create mint for testing
    const mint = await spl.Token.createMint(
      program.provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      9,
      spl.TOKEN_PROGRAM_ID
    );
    console.log("test mint created");

    // get PDAs

    const [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [mint.publicKey.toBuffer()],
      program.programId
    );

    const [vaultMgr, vaultMgrBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mint.publicKey.toBuffer(), vault.toBuffer()],
        program.programId
      );

    const [tickets, ticketsBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [mint.publicKey.toBuffer(), vault.toBuffer(), vaultMgr.toBuffer()],
        program.programId
      );

    const [prize, prizeBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        mint.publicKey.toBuffer(),
        vault.toBuffer(),
        vaultMgr.toBuffer(),
        tickets.toBuffer(),
      ],
      program.programId
    );

    // lottery draw timestamp (future)
    const drawMs = 3 * 1000;
    const now = new Date().getTime();
    const drawTime = new anchor.BN(new Date(now + drawMs).getTime() / 1000);

    // ticket price in tokens
    const ticketPrice = new anchor.BN(1);

    // init vault
    const initTxSig = await program.rpc.initialize(
      vaultBump,
      vaultMgrBump,
      ticketsBump,
      prizeBump,
      drawTime,
      ticketPrice,
      {
        accounts: {
          mint: mint.publicKey,
          vault: vault,
          vaultManager: vaultMgr,
          tickets: tickets,
          prize: prize,
          user: program.provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
    console.log("initTxSig:", initTxSig);

    // get user ata
    const userAta = await mint.getOrCreateAssociatedAccountInfo(
      program.provider.wallet.publicKey
    );

    // mint tokens to user_ata
    await mint.mintTo(userAta.address, mintAuthority.publicKey, [], 100);
    console.log("minted 100 tokens to user_ata");

    // get user tickets ata
    const userTicketsAta = await spl.Token.getAssociatedTokenAddress(
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      spl.TOKEN_PROGRAM_ID,
      tickets,
      program.provider.wallet.publicKey
    );

    // choose your lucky numbers!
    let numbers: Array<number>;
    numbers = [1, 2, 3, 4, 5, 6];

    // create ticket PDA
    const [ticket, ticketBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Uint8Array.from(numbers)],
      program.programId
    );

    // buy a ticket
    const buyTxSig = await program.rpc.buy(
      vaultBump,
      vaultMgrBump,
      ticketsBump,
      ticketBump,
      numbers,
      {
        accounts: {
          mint: mint.publicKey,
          vault: vault,
          vaultManager: vaultMgr,
          tickets: tickets,
          ticket: ticket,
          userTicketsAta: userTicketsAta,
          user: program.provider.wallet.publicKey,
          userAta: userAta.address,
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
    console.log("buySigTx:", buyTxSig);

    // wait for draw to expire
    await sleep(drawMs + 500);

    // draw winner
    const drawTxSig = await program.rpc.draw(
      vaultBump,
      vaultMgrBump,
      ticketsBump,
      {
        accounts: {
          mint: mint.publicKey,
          vault: vault,
          tickets: tickets,
          vaultManager: vaultMgr,
          user: program.provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
    console.log("drawTxSig:", drawTxSig);

    // find winner
    const findTxSig = await program.rpc.find(
      vaultBump,
      vaultMgrBump,
      ticketsBump,
      {
        accounts: {
          mint: mint.publicKey,
          vault: vault,
          vaultManager: vaultMgr,
          tickets: tickets,
          ticket: ticket,
          user: program.provider.wallet.publicKey,
        },
      }
    );
    console.log("findTxSig:", findTxSig);

    // mint tokens to prize for testing
    await mint.mintTo(prize, mintAuthority.publicKey, [], 100);
    console.log(
      "minted 100 tokens to prize ata, dont actually do this in prod"
    );

    // user withdraw tokens + any winnings
    const withdrawTxSig = await program.rpc.withdraw(
      vaultBump,
      vaultMgrBump,
      ticketsBump,
      prizeBump,
      new anchor.BN(1),
      {
        accounts: {
          mint: mint.publicKey,
          vault: vault,
          vaultManager: vaultMgr,
          tickets: tickets,
          prize: prize,
          user: program.provider.wallet.publicKey,
          userAta: userAta.address,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
    console.log("withdrawTxSig:", withdrawTxSig);
  });
});

// create new Account and seed with lamports
async function newAccountWithLamports(
  connection: anchor.web3.Connection,
  lamports: number = 100_000_000_000_000
): Promise<anchor.web3.Account> {
  // generate keypair
  const account = new anchor.web3.Account();

  // airdrop lamports
  let txSig = await connection.requestAirdrop(account.publicKey, lamports);
  await connection.confirmTransaction(txSig);
  console.log("airdropTxSig:", txSig);

  return account;
}

// slep current thread in milliseconds
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
