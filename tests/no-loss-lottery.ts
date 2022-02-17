import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import * as assert from "assert";
import { Program, ProgramError } from "@project-serum/anchor";
import { NoLossLottery } from "../target/types/no_loss_lottery";

const VAULT = "VAULT";
const VAULT_MANAGER = "VAULT_MANAGER";
const MINT = "MINT";
const MINT_AUTHORITY = "MINT_AUTHORITY";
const TICKETS = "TICKETS";
const PRIZE = "PRIZE";
const USER_MINT_ATA = "USER_MINT_ATA";
const USER_TICKET_ATA = "USER_TICKET_ATA";

const DRAW_MS = 1 * 1000;

interface Config {
  keys: Map<String, anchor.web3.PublicKey>;
  bumps: Map<String, number>;
}

describe("Buy", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Buy ticket", async () => {
    const config = await initialize(program);
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);
    await assertBalance(program, config.keys.get(USER_TICKET_ATA), 1);

    const userKey = await program.account.ticket.fetch(ticket);
    assertPublicKey(
      assert.equal,
      program.provider.wallet.publicKey,
      userKey.owner
    );
  });

  it("Buy ticket with invalid number values", async () => {
    const config = await initialize(program);
    const numbers = [0, 0, 0, 0, 0, 0];

    const [ticket, ticketBump] = await buy(
      program,
      numbers,
      config,
      program.idl.errors[2].code
    );
    assert.rejects(
      async () =>
        await assertBalance(program, config.keys.get(USER_TICKET_ATA), 0)
    );
  });

  it("Buy ticket with invalid input size", async () => {
    const config = await initialize(program);
    const numbers = [1, 2, 3];

    assert.rejects(async () => await buy(program, numbers, config, null));
  });

  it("Buy ticket with invalid number value", async () => {
    const config = await initialize(program);
    const numbers = [1, 2, 3, 4, 5, 256];

    assert.rejects(async () => await buy(program, numbers, config, null));
  });

  it("Buy ticket with duplicate ticket numbers", async () => {
    const config = await initialize(program);
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);
    await assertBalance(program, config.keys.get(USER_TICKET_ATA), 1);

    const userKey = await program.account.ticket.fetch(ticket);
    assertPublicKey(
      assert.equal,
      program.provider.wallet.publicKey,
      userKey.owner
    );

    assert.rejects(async () => await buy(program, numbers, config, null));
  });

  it("Buy ticket with different numbers", async () => {
    const config = await initialize(program);
    const numbersA = [1, 2, 3, 4, 5, 6];
    const numbersB = [7, 8, 9, 10, 11, 12];

    const [ticketA, ticketBumpA] = await buy(program, numbersA, config, null);
    await assertBalance(program, config.keys.get(USER_TICKET_ATA), 1);
    const userKeyA = await program.account.ticket.fetch(ticketA);
    assertPublicKey(
      assert.equal,
      program.provider.wallet.publicKey,
      userKeyA.owner
    );

    const [ticketB, ticketBumpB] = await buy(program, numbersB, config, null);
    await assertBalance(program, config.keys.get(USER_TICKET_ATA), 2);
    const userKeyB = await program.account.ticket.fetch(ticketB);
    assertPublicKey(
      assert.equal,
      program.provider.wallet.publicKey,
      userKeyB.owner
    );

    assertPublicKey(assert.equal, userKeyA.owner, userKeyB.owner);
  });

  it("Buy second ticket with insufficient funds", async () => {
    const config = await initialize(program, 1);
    const numbersA = [1, 2, 3, 4, 5, 6];
    const numbersB = [7, 8, 9, 10, 11, 12];

    const [ticketA, ticketBumpA] = await buy(program, numbersA, config, null);
    await assertBalance(program, config.keys.get(USER_TICKET_ATA), 1);
    const userKeyA = await program.account.ticket.fetch(ticketA);
    assertPublicKey(
      assert.equal,
      program.provider.wallet.publicKey,
      userKeyA.owner
    );

    assert.rejects(async () => await buy(program, numbersB, config, null));
  });

  it("Smoke", async () => {
    const config = await initialize(program);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // wait for draw to expire
    await sleep(DRAW_MS + 500);

    // draw winner
    const drawTxSig = await program.rpc.draw(
      config.bumps.get(VAULT),
      config.bumps.get(VAULT_MANAGER),
      config.bumps.get(TICKETS),
      {
        accounts: {
          mint: config.keys.get(MINT),
          vault: config.keys.get(VAULT),
          tickets: config.keys.get(TICKETS),
          vaultManager: config.keys.get(VAULT_MANAGER),
          user: program.provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
    console.log("drawTxSig:", drawTxSig);

    // fetch winning numbers
    const vaultMgrAccount = await program.account.vaultManager.fetch(
      config.keys.get(VAULT_MANAGER)
    );

    // create winning ticket PDA
    const [winningTicket, winningTicketBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Uint8Array.from(vaultMgrAccount.winningNumbers),
          config.keys.get(VAULT_MANAGER).toBuffer(),
        ],
        program.programId
      );

    // find winner
    const findTxSig = await program.rpc.find(
      config.bumps.get(VAULT),
      config.bumps.get(VAULT_MANAGER),
      config.bumps.get(TICKETS),
      vaultMgrAccount.winningNumbers,
      winningTicketBump,
      {
        accounts: {
          mint: config.keys.get(MINT),
          vault: config.keys.get(VAULT),
          tickets: config.keys.get(TICKETS),
          vaultManager: config.keys.get(VAULT_MANAGER),
          ticket: winningTicket,
          prize: config.keys.get(PRIZE),
          user: program.provider.wallet.publicKey,
          userAta: config.keys.get(USER_MINT_ATA),
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        },
      }
    );
    console.log("findTxSig:", findTxSig);

    // user redeem tokens + any winnings
    const redeemTxSig = await program.rpc.redeem(
      config.bumps.get(VAULT),
      config.bumps.get(VAULT_MANAGER),
      config.bumps.get(TICKETS),
      ticketBump,
      config.bumps.get(PRIZE),
      {
        accounts: {
          mint: config.keys.get(MINT),
          vault: config.keys.get(VAULT),
          tickets: config.keys.get(TICKETS),
          vaultManager: config.keys.get(VAULT_MANAGER),
          ticket: ticket,
          prize: config.keys.get(PRIZE),
          userTicketsAta: config.keys.get(USER_TICKET_ATA),
          user: program.provider.wallet.publicKey,
          userAta: config.keys.get(USER_MINT_ATA),
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
    console.log("redeemTxSig:", redeemTxSig);
  });
});

describe("Redeem", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Redeem ticket", async () => {
    const config = await initialize(program, 1);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // balance is 0 after buying a ticket
    await assertBalance(program, config.keys.get(USER_MINT_ATA), 0);

    await redeem(program, config, ticket, ticketBump, null);

    // we get our token back
    await assertBalance(program, config.keys.get(USER_MINT_ATA), 1);
  });

  it("Redeem 2 tickets", async () => {
    const config = await initialize(program, 2);

    // choose your lucky numbers!
    const numbers1 = [1, 2, 3, 4, 5, 6];
    const numbers2 = [1, 2, 3, 4, 5, 7];

    const [ticket1, ticketBump1] = await buy(program, numbers1, config, null);
    const [ticket2, ticketBump2] = await buy(program, numbers2, config, null);

    // balance is 0 after buying 2 tickets
    await assertBalance(program, config.keys.get(USER_MINT_ATA), 0);

    await redeem(program, config, ticket1, ticketBump1, null);
    await redeem(program, config, ticket2, ticketBump2, null);

    // we get our tokens back
    await assertBalance(program, config.keys.get(USER_MINT_ATA), 2);
  });

  it("Redeem same ticket twice", async () => {
    const config = await initialize(program);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    await redeem(program, config, ticket, ticketBump, null);
    assert.rejects(
      async () => await redeem(program, config, ticket, ticketBump, null)
    );

    // we get our token back
    await assertBalance(program, config.keys.get(USER_MINT_ATA), 100);
  });
});

// create new Account and seed with lamports
async function newAccountWithLamports(
  connection: anchor.web3.Connection,
  lamports: number = 100_000_000
): Promise<anchor.web3.Account> {
  // generate keypair
  const account = new anchor.web3.Account();

  // airdrop lamports
  let txSig = await connection.requestAirdrop(account.publicKey, lamports);
  await connection.confirmTransaction(txSig);
  console.log("airdropTxSig:", txSig);

  // check account balance
  const lamportsBalance = await connection.getBalance(account.publicKey);
  console.log("lamports balance:", lamportsBalance);

  return account;
}

// sleep current thread in milliseconds
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initialize(
  program: Program<NoLossLottery>,
  userAtaBalance = 100
): Promise<Config> {
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

  const [tickets, ticketsBump] = await anchor.web3.PublicKey.findProgramAddress(
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
  const now = new Date().getTime();
  const drawTime = new anchor.BN(new Date(now + DRAW_MS).getTime() / 1000);

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
  await mint.mintTo(
    userAta.address,
    mintAuthority.publicKey,
    [],
    userAtaBalance
  );
  console.log("minted 100 tokens to user_ata");

  // get user tickets ata
  const userTicketsAta = await spl.Token.getAssociatedTokenAddress(
    spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    spl.TOKEN_PROGRAM_ID,
    tickets,
    program.provider.wallet.publicKey
  );

  // mint tokens to prize for testing
  await mint.mintTo(prize, mintAuthority.publicKey, [], 100);
  console.log("minted 100 tokens to prize ata, dont actually do this in prod");

  let keys = new Map<String, anchor.web3.PublicKey>();
  keys.set(VAULT, vault);
  keys.set(VAULT_MANAGER, vaultMgr);
  keys.set(MINT, mint.publicKey);
  keys.set(MINT_AUTHORITY, mintAuthority.publicKey);
  keys.set(TICKETS, tickets);
  keys.set(PRIZE, prize);
  keys.set(USER_MINT_ATA, userAta.address);
  keys.set(USER_TICKET_ATA, userTicketsAta);

  let bumps = new Map<String, number>();
  bumps.set(VAULT, vaultBump);
  bumps.set(VAULT_MANAGER, vaultMgrBump);
  bumps.set(TICKETS, ticketsBump);

  const config: Config = {
    keys: keys,
    bumps: bumps,
  };

  return config;
}

async function buy(
  program: Program<NoLossLottery>,
  numbers: Array<number>,
  config: Config,
  error: number | null
): Promise<[anchor.web3.PublicKey, number]> {
  // create ticket PDA
  const [ticket, ticketBump] = await anchor.web3.PublicKey.findProgramAddress(
    [Uint8Array.from(numbers), config.keys.get(VAULT_MANAGER).toBuffer()],
    program.programId
  );

  // buy a ticket
  try {
    const buyTxSig = await program.rpc.buy(
      config.bumps.get(VAULT),
      config.bumps.get(VAULT_MANAGER),
      config.bumps.get(TICKETS),
      ticketBump,
      numbers,
      {
        accounts: {
          mint: config.keys.get(MINT),
          vault: config.keys.get(VAULT),
          vaultManager: config.keys.get(VAULT_MANAGER),
          tickets: config.keys.get(TICKETS),
          ticket: ticket,
          userTicketsAta: config.keys.get(USER_TICKET_ATA),
          user: program.provider.wallet.publicKey,
          userAta: config.keys.get(USER_MINT_ATA),
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
    console.log("buySigTx:", buyTxSig);
  } catch (e) {
    if (error) {
      assert.equal(e.code, error);
    } else {
      throw e;
    }
  }
  return [ticket, ticketBump];
}

async function redeem(
  program: Program<NoLossLottery>,
  config: Config,
  ticket: anchor.web3.PublicKey,
  ticketBump: number,
  error: number | null
) {
  try {
    // user redeem token
    const redeemTxSig = await program.rpc.redeem(
      config.bumps.get(VAULT),
      config.bumps.get(VAULT_MANAGER),
      config.bumps.get(TICKETS),
      ticketBump,
      config.bumps.get(PRIZE),
      {
        accounts: {
          mint: config.keys.get(MINT),
          vault: config.keys.get(VAULT),
          tickets: config.keys.get(TICKETS),
          vaultManager: config.keys.get(VAULT_MANAGER),
          ticket: ticket,
          prize: config.keys.get(PRIZE),
          userTicketsAta: config.keys.get(USER_TICKET_ATA),
          user: program.provider.wallet.publicKey,
          userAta: config.keys.get(USER_MINT_ATA),
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
    console.log("redeemTxSig:", redeemTxSig);
  } catch (e) {
    if (error) {
      assert.equal(e.code, error);
    } else {
      throw e;
    }
  }
}

async function assertBalance(
  program: Program<NoLossLottery>,
  account: anchor.web3.PublicKey,
  expectedBalance: number
) {
  const balance = (await (
    await program.provider.connection.getTokenAccountBalance(account)
  ).value.amount) as unknown as number;
  assert.equal(balance, expectedBalance);
}

function assertPublicKey(
  f: Function,
  key1: anchor.web3.PublicKey,
  key2: anchor.web3.PublicKey
) {
  return f(key1.toString(), key2.toString());
}
