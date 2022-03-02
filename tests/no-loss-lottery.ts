import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import * as assert from "assert";
import * as tokenSwap from "@solana/spl-token-swap";
import { Program } from "@project-serum/anchor";
import { NoLossLottery } from "../target/types/no_loss_lottery";

const DEPOSIT_VAULT = "DEPOSIT_VAULT";
const DEPOSIT_MINT = "DEPOSIT_MINT";
const YIELD_VAULT = "YIELD_VAULT";
const YIELD_MINT = "YIELD_MINT";
const VAULT_MANAGER = "VAULT_MANAGER";
const MINT_AUTHORITY = "MINT_AUTHORITY";
const TICKETS = "TICKETS";
const USER_DEPOSIT_ATA = "USER_DEPOSIT_ATA";
const USER_TICKET_ATA = "USER_TICKET_ATA";
const SWAP_YIELD_VAULT = "SWAP_YIELD_VAULT";
const SWAP_DEPOSIT_VAULT = "SWAP_DEPOSIT_VAULT";
const POOL_MINT = "POOL_MINT";
const TOKEN_SWAP_ACCOUNT = "TOKEN_SWAP_ACCOUNT";
const TOKEN_SWAP_ACCOUNT_AUTHORITY = "TOKEN_SWAP_ACCOUNT_AUTHORITY";
const POOL_FEE = "POOL_FEE";

interface Config {
  keys: Map<String, anchor.web3.PublicKey>;
  mintAuthority: anchor.web3.Account;
}

describe("Buy", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Buy ticket", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
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
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds);
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
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds);
    const numbers = [1, 2, 3];

    assert.rejects(async () => await buy(program, numbers, config, null));
  });

  it("Buy ticket with invalid number value", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
    const numbers = [1, 2, 3, 4, 5, 256];

    assert.rejects(async () => await buy(program, numbers, config, null));
  });

  it("Buy ticket with duplicate ticket numbers", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
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
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
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
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
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
});

describe("Redeem", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Redeem ticket", async () => {
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds, 1);
    await tokenSwapInit(program, config);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // balance is 0 after buying a ticket
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 0);

    await redeem(program, config, ticket, ticketBump, null);

    // we get our token back
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 1);
  });

  it("Redeem 2 tickets", async () => {
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds, 2);
    await tokenSwapInit(program, config);

    // choose your lucky numbers!
    const numbers1 = [1, 2, 3, 4, 5, 6];
    const numbers2 = [1, 2, 3, 4, 5, 7];

    const [ticket1, ticketBump1] = await buy(program, numbers1, config, null);
    const [ticket2, ticketBump2] = await buy(program, numbers2, config, null);

    // balance is 0 after buying 2 tickets
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 0);

    await redeem(program, config, ticket1, ticketBump1, null);
    await redeem(program, config, ticket2, ticketBump2, null);

    // we get our tokens back
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 2);
  });

  it("Redeem same ticket twice", async () => {
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds);
    await tokenSwapInit(program, config);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    await redeem(program, config, ticket, ticketBump, null);
    assert.rejects(
      async () => await redeem(program, config, ticket, ticketBump, null)
    );

    // we get our token back
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 100);
  });

  it("Redeem ticket, not enough liquidity in deposit_vault", async () => {
    const drawDurationSeconds = 1;
    const userDepositAtaBalance = 100;
    const config = await initialize(
      program,
      drawDurationSeconds,
      userDepositAtaBalance
    );
    await tokenSwapInit(program, config);

    // choose your lucky numbers!
    // do not clash with buyNTickets
    const numbers = [1, 2, 3, 4, 5, 60];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // buy enough tickets so that stake will work
    const ticketCount = 20;
    await buyNTickets(program, config, ticketCount);

    // balance is 0 after buying a ticket
    // account for 20 tickets purchased + single ticket bought
    const totalTicketsPurchased = userDepositAtaBalance - 1 - ticketCount;
    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      totalTicketsPurchased
    );

    // stake tokens in deposit_vault
    await stake(program, config);

    // redeem now, not enough tokens in deposit_vault
    await redeem(program, config, ticket, ticketBump, null);

    // we get 1 deposit_token back after a single redeem call
    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      totalTicketsPurchased + 1
    );
  });
});

describe("Draw", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Draw numbers", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds, 1);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    await draw(program, config, null);
  });

  it("Draw without any tickets purchased", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds, 1);

    await draw(program, config, program.idl.errors[3].code);
  });

  it("Draw before cutoff_time", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds, 1);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    await buy(program, numbers, config, null);

    await draw(program, config, program.idl.errors[0].code);
  });

  it("Draw multiple times", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds, 1);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    await buy(program, numbers, config, null);

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    await draw(program, config, null);
    await draw(program, config, program.idl.errors[1].code);
  });

  it("Attempt to buy ticket between draw and dispense", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds, 1);

    // choose your lucky numbers!
    const numbers1 = [1, 2, 3, 4, 5, 6];

    await buy(program, numbers1, config, null);

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    await draw(program, config, null);

    // choose your lucky numbers!
    const numbers2 = [1, 2, 3, 4, 5, 7];

    // call buy without calling dispense
    await buy(program, numbers2, config, program.idl.errors[1].code);
  });
});

describe("Dispense", () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Call dispense after draw, winner found", async () => {
    const drawDurationSeconds = 1;
    const userDepositAtaBalance = 1;
    const yieldVaultInitBalance = 10;

    const config = await initialize(
      program,
      drawDurationSeconds,
      userDepositAtaBalance,
      yieldVaultInitBalance
    );
    await tokenSwapInit(program, config);

    // buy winning ticket
    const numbers = [1, 2, 3, 4, 5, 6];
    await buy(program, numbers, config, null);

    await sleep(drawDurationSeconds + 1);

    // draw winning ticket
    await draw(program, config, null);

    // dispense prize to winner
    await dispense(program, config, numbers, null);

    // check the deposit vault only contains the amount from the ticket purchase
    await assertBalance(
      program,
      config.keys.get(DEPOSIT_VAULT),
      userDepositAtaBalance
    );

    // check user received prize amount - fees
    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      yieldVaultInitBalance - 3 // swap fees reduce amount returned as prize
    );
  });

  it("Call dispense after draw, no winner", async () => {
    const drawDurationSeconds = 1;
    const userDepositAtaBalance = 10;
    const config = await initialize(
      program,
      drawDurationSeconds,
      userDepositAtaBalance
    );
    await tokenSwapInit(program, config);

    // deliberatly choose a non winning combination
    const numbers = [7, 8, 9, 10, 11, 12];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    await draw(program, config, null);

    await dispense(program, config, numbers, program.idl.errors[4].code);

    await assertBalance(program, config.keys.get(USER_TICKET_ATA), 1);
    // subtract 1 to account for a ticket purchase
    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      userDepositAtaBalance - 1
    );
  });

  it("Call dispense with no draw", async () => {
    const drawDurationSeconds = 1;
    const userDepositAtaBalance = 10;
    const config = await initialize(
      program,
      drawDurationSeconds,
      userDepositAtaBalance
    );
    await tokenSwapInit(program, config);

    // deliberatly choose a non winning combination
    const numbers = [7, 8, 9, 10, 11, 12];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    await dispense(program, config, numbers, program.idl.errors[4].code);

    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      userDepositAtaBalance - 1
    );
  });

  it("Call dispense twice in a row without winning PDA", async () => {
    const drawDurationSeconds = 1;
    const userDepositAtaBalance = 10;
    const config = await initialize(
      program,
      drawDurationSeconds,
      userDepositAtaBalance
    );
    await tokenSwapInit(program, config);

    // deliberatly choose a non winning combination
    const numbers = [7, 8, 9, 10, 11, 12];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    // calling dispense passing in non winning PDA
    await dispense(program, config, numbers, program.idl.errors[4].code);

    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      userDepositAtaBalance - 1
    );

    // call it again
    await dispense(program, config, numbers, program.idl.errors[4].code);

    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      userDepositAtaBalance - 1
    );
  });

  it("Call dispense twice, first without winning PDA second time with winning PDA", async () => {
    const drawDurationSeconds = 1;
    const userDepositAtaBalance = 10;
    const config = await initialize(
      program,
      drawDurationSeconds,
      userDepositAtaBalance
    );
    await tokenSwapInit(program, config);

    // deliberatly choose a non winning combination
    const numbers = [7, 8, 9, 10, 11, 12];

    const [ticket, ticketBump] = await buy(program, numbers, config, null);

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    await draw(program, config, null);

    // calling dispense passing in non winning PDA
    await dispense(program, config, numbers, program.idl.errors[4].code);

    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      userDepositAtaBalance - 1
    );

    // get winning numbers from vault_manager in prod
    const winningNumbers = [1, 2, 3, 4, 5, 6];

    await dispense(program, config, winningNumbers, null);

    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      userDepositAtaBalance - 1
    );
  });

  it("Winning ticket chosen twice dispense prize twice", async () => {
    const drawDurationSeconds = 1;
    const userDepositAtaBalance = 10;
    const yieldVaultInitBalance = 100;
    const config = await initialize(
      program,
      drawDurationSeconds,
      userDepositAtaBalance,
      yieldVaultInitBalance
    );
    await tokenSwapInit(program, config);

    // choose winning numbers
    const numbers = [1, 2, 3, 4, 5, 6];

    // buy winning ticket
    await buy(program, numbers, config, null);

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    await draw(program, config, null);

    // call dispense with winning pda
    await dispense(program, config, numbers, program.idl.errors[4].code);

    // assert winning user got the prize
    // subtract 1 for the ticket purchase
    // subtract 3 for swap fees
    const expectedUserDepositATABalance =
      yieldVaultInitBalance + userDepositAtaBalance - 1 - 3;
    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      expectedUserDepositATABalance
    );

    // wait for cutoff_time to expire again
    await sleep(drawDurationSeconds + 1);

    // draw for a second time, picking the same winning numbers
    await draw(program, config, null);

    // at this point, there is no prize money left
    await dispense(program, config, numbers, null);

    // balance should remain the same because there is no prize left
    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      expectedUserDepositATABalance
    );
  });
});

describe("Stake", () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Stake successfully after 20 ticket purchases", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
    await tokenSwapInit(program, config);

    // buy several tickets to add funds to deposit_vault
    await buyNTickets(program, config, 20);

    // swap tokens to yield bearing tokens and put in yield vault
    await stake(program, config, null);
  });

  it("Stake unsuccessful, not enough tokens in reserve", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
    await tokenSwapInit(program, config);

    // buy several tickets to add funds to deposit_vault
    await buyNTickets(program, config, 2);

    // swap tokens to yield bearing tokens and put in yield vault
    await stake(program, config, program.idl.errors[5].code);
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

// sleep current thread in seconds
async function sleep(seconds: number) {
  const ms = seconds * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initialize(
  program: Program<NoLossLottery>,
  drawDurationSeconds: number,
  userDepositAtaBalance = 100,
  yieldVaultInitBalance = 0
): Promise<Config> {
  const mintAuthority = await newAccountWithLamports(
    program.provider.connection
  );

  // create deposit mint for testing
  const depositMint = await spl.createMint(
    program.provider.connection,
    mintAuthority,
    mintAuthority.publicKey,
    null,
    9
  );
  console.log("deposit test mint created");

  // create yield mint for testing
  const yieldMint = await spl.createMint(
    program.provider.connection,
    mintAuthority,
    mintAuthority.publicKey,
    null,
    9
  );
  console.log("yield test mint created");

  // get PDAs

  const [depositVault, depositVaultBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [depositMint.toBuffer()],
      program.programId
    );

  const [yieldVault, yieldVaultBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [yieldMint.toBuffer()],
      program.programId
    );

  const [vaultMgr, vaultMgrBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [
        depositMint.toBuffer(),
        yieldMint.toBuffer(),
        depositVault.toBuffer(),
        yieldVault.toBuffer(),
      ],
      program.programId
    );

  const [tickets, ticketsBump] = await anchor.web3.PublicKey.findProgramAddress(
    [
      depositMint.toBuffer(),
      yieldMint.toBuffer(),
      depositVault.toBuffer(),
      yieldVault.toBuffer(),
      vaultMgr.toBuffer(),
    ],
    program.programId
  );

  // ticket price in tokens
  const ticketPrice = new anchor.BN(1);

  // init vault
  const initTxSig = await program.rpc.initialize(
    new anchor.BN(drawDurationSeconds),
    ticketPrice,
    {
      accounts: {
        depositMint: depositMint,
        yieldMint: yieldMint,
        depositVault: depositVault,
        yieldVault: yieldVault,
        vaultManager: vaultMgr,
        tickets: tickets,
        user: program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    }
  );
  console.log("initTxSig:", initTxSig);

  // get user ata
  const userDepositAta = await spl.getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    mintAuthority,
    depositMint,
    program.provider.wallet.publicKey
  );

  // mint tokens to user_ata
  await spl.mintTo(
    program.provider.connection,
    mintAuthority,
    depositMint,
    userDepositAta.address,
    mintAuthority.publicKey,
    userDepositAtaBalance
  );
  console.log("minted %d tokens to user_ata", userDepositAtaBalance);

  // get user tickets ata
  const userTicketsAta = await spl.getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    mintAuthority,
    tickets,
    program.provider.wallet.publicKey
  );

  // mint tokens to yield vault for testing
  await spl.mintTo(
    program.provider.connection,
    mintAuthority,
    yieldMint,
    yieldVault,
    mintAuthority.publicKey,
    yieldVaultInitBalance
  );
  console.log("minted %d tokens to yield vault", yieldVaultInitBalance);

  let keys = new Map<String, anchor.web3.PublicKey>();
  keys.set(DEPOSIT_VAULT, depositVault);
  keys.set(DEPOSIT_MINT, depositMint);
  keys.set(YIELD_VAULT, yieldVault);
  keys.set(YIELD_MINT, yieldMint);
  keys.set(VAULT_MANAGER, vaultMgr);
  keys.set(MINT_AUTHORITY, mintAuthority.publicKey);
  keys.set(TICKETS, tickets);
  keys.set(USER_DEPOSIT_ATA, userDepositAta.address);
  keys.set(USER_TICKET_ATA, userTicketsAta.address);

  const config: Config = {
    keys: keys,
    mintAuthority: mintAuthority,
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
    const buyTxSig = await program.rpc.buy(numbers, {
      accounts: {
        depositMint: config.keys.get(DEPOSIT_MINT),
        depositVault: config.keys.get(DEPOSIT_VAULT),
        yieldMint: config.keys.get(YIELD_MINT),
        yieldVault: config.keys.get(YIELD_VAULT),
        vaultManager: config.keys.get(VAULT_MANAGER),
        tickets: config.keys.get(TICKETS),
        ticket: ticket,
        userTicketsAta: config.keys.get(USER_TICKET_ATA),
        user: program.provider.wallet.publicKey,
        userDepositAta: config.keys.get(USER_DEPOSIT_ATA),
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
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
    const redeemTxSig = await program.rpc.redeem({
      accounts: {
        depositMint: config.keys.get(DEPOSIT_MINT),
        depositVault: config.keys.get(DEPOSIT_VAULT),
        yieldMint: config.keys.get(YIELD_MINT),
        yieldVault: config.keys.get(YIELD_VAULT),
        swapYieldVault: config.keys.get(SWAP_YIELD_VAULT),
        swapDepositVault: config.keys.get(SWAP_DEPOSIT_VAULT),
        poolMint: config.keys.get(POOL_MINT),
        amm: config.keys.get(TOKEN_SWAP_ACCOUNT),
        ammAuthority: config.keys.get(TOKEN_SWAP_ACCOUNT_AUTHORITY),
        poolFee: config.keys.get(POOL_FEE),
        tickets: config.keys.get(TICKETS),
        vaultManager: config.keys.get(VAULT_MANAGER),
        ticket: ticket,
        userTicketsAta: config.keys.get(USER_TICKET_ATA),
        user: program.provider.wallet.publicKey,
        userDepositAta: config.keys.get(USER_DEPOSIT_ATA),
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
    console.log("redeemTxSig:", redeemTxSig);
  } catch (e) {
    if (error) {
      assert.equal(e.code, error);
    } else {
      throw e;
    }
  }
}

async function draw(
  program: Program<NoLossLottery>,
  config: Config,
  error: number | null
) {
  try {
    // draw winner
    const drawTxSig = await program.rpc.draw({
      accounts: {
        depositMint: config.keys.get(DEPOSIT_MINT),
        depositVault: config.keys.get(DEPOSIT_VAULT),
        yieldMint: config.keys.get(YIELD_MINT),
        yieldVault: config.keys.get(YIELD_VAULT),
        tickets: config.keys.get(TICKETS),
        vaultManager: config.keys.get(VAULT_MANAGER),
        user: program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
    console.log("drawTxSig:", drawTxSig);
  } catch (e) {
    if (error) {
      assert.equal(e.code, error);
    } else {
      throw e;
    }
  }
}

async function dispense(
  program: Program<NoLossLottery>,
  config: Config,
  numbers: Array<number>,
  error = null
) {
  try {
    // fetch winning numbers
    const vaultMgrAccount = await program.account.vaultManager.fetch(
      config.keys.get(VAULT_MANAGER)
    );

    // create winning ticket PDA
    const [ticket, ticketBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Uint8Array.from(numbers), config.keys.get(VAULT_MANAGER).toBuffer()],
      program.programId
    );

    // dispense prize to winner
    const dispenseTxSig = await program.rpc.dispense(numbers, {
      accounts: {
        depositMint: config.keys.get(DEPOSIT_MINT),
        depositVault: config.keys.get(DEPOSIT_VAULT),
        yieldMint: config.keys.get(YIELD_MINT),
        yieldVault: config.keys.get(YIELD_VAULT),
        tickets: config.keys.get(TICKETS),
        vaultManager: config.keys.get(VAULT_MANAGER),
        ticket: ticket,
        swapYieldVault: config.keys.get(SWAP_YIELD_VAULT),
        swapDepositVault: config.keys.get(SWAP_DEPOSIT_VAULT),
        poolMint: config.keys.get(POOL_MINT),
        amm: config.keys.get(TOKEN_SWAP_ACCOUNT),
        ammAuthority: config.keys.get(TOKEN_SWAP_ACCOUNT_AUTHORITY),
        poolFee: config.keys.get(POOL_FEE),
        user: program.provider.wallet.publicKey,
        userDepositAta: config.keys.get(USER_DEPOSIT_ATA),
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      },
    });
    console.log("dispenseTxSig:", dispenseTxSig);
  } catch (e) {
    if (error) {
      assert.equal(e.code, error);
    } else {
      throw e;
    }
  }
}

async function stake(
  program: Program<NoLossLottery>,
  config: Config,
  error = null
) {
  try {
    const stakeTxSig = await program.rpc.stake({
      accounts: {
        vaultManager: config.keys.get(VAULT_MANAGER),
        depositMint: config.keys.get(DEPOSIT_MINT),
        depositVault: config.keys.get(DEPOSIT_VAULT),
        yieldMint: config.keys.get(YIELD_MINT),
        yieldVault: config.keys.get(YIELD_VAULT),
        swapYieldVault: config.keys.get(SWAP_YIELD_VAULT),
        swapDepositVault: config.keys.get(SWAP_DEPOSIT_VAULT),
        poolMint: config.keys.get(POOL_MINT),
        amm: config.keys.get(TOKEN_SWAP_ACCOUNT),
        ammAuthority: config.keys.get(TOKEN_SWAP_ACCOUNT_AUTHORITY),
        poolFee: config.keys.get(POOL_FEE),
        user: program.provider.wallet.publicKey,
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
    console.log("stakeTxSig:", stakeTxSig);
  } catch (e) {
    if (error) {
      assert.equal(e.code, error);
    } else {
      throw e;
    }
  }
}

async function tokenSwapInit(program: Program<NoLossLottery>, config: Config) {
  // Pool fees
  const TRADING_FEE_NUMERATOR = 25;
  const TRADING_FEE_DENOMINATOR = 10000;
  const OWNER_TRADING_FEE_NUMERATOR = 5;
  const OWNER_TRADING_FEE_DENOMINATOR = 10000;
  const OWNER_WITHDRAW_FEE_NUMERATOR = 0;
  const OWNER_WITHDRAW_FEE_DENOMINATOR = 0;
  const HOST_FEE_NUMERATOR = 20;
  const HOST_FEE_DENOMINATOR = 100;

  const tokenSwapAccount = new anchor.web3.Account();

  const [tokenSwapAccountAuthority, tokenSwapAccountAuthorityBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [tokenSwapAccount.publicKey.toBuffer()],
      tokenSwap.TOKEN_SWAP_PROGRAM_ID
    );

  // create pool mint

  const tokenPoolMint = await spl.createMint(
    program.provider.connection,
    config.mintAuthority,
    tokenSwapAccountAuthority,
    null,
    2
  );
  console.log("created pool mint");

  const feeAccount = await spl.getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    config.mintAuthority,
    tokenPoolMint,
    new anchor.web3.PublicKey("HfoTxFR1Tm6kGmWgYWD6J7YHVy1UwqSULUGVLXkJqaKN"),
    true
  );
  console.log("fee account created");

  // create swap token accounts
  const swapPoolMintTokenAccount = await spl.getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    config.mintAuthority,
    tokenPoolMint,
    config.mintAuthority.publicKey,
    false
  );
  const swapDepositVault = await spl.getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    config.mintAuthority,
    config.keys.get(DEPOSIT_MINT),
    tokenSwapAccountAuthority,
    true
  );
  const swapYieldVault = await spl.getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    config.mintAuthority,
    config.keys.get(YIELD_MINT),
    tokenSwapAccountAuthority,
    true
  );
  console.log("created swap pool mint token accounts");

  // mint initial tokens to swap token accounts
  await spl.mintTo(
    program.provider.connection,
    config.mintAuthority,
    config.keys.get(DEPOSIT_MINT),
    swapDepositVault.address,
    config.mintAuthority,
    100000
  );
  await spl.mintTo(
    program.provider.connection,
    config.mintAuthority,
    config.keys.get(YIELD_MINT),
    swapYieldVault.address,
    config.mintAuthority,
    100000
  );
  console.log("minted initial tokens to swap token accounts");

  await tokenSwap.TokenSwap.createTokenSwap(
    program.provider.connection,
    config.mintAuthority,
    tokenSwapAccount,
    tokenSwapAccountAuthority,
    swapDepositVault.address,
    swapYieldVault.address,
    tokenPoolMint,
    config.keys.get(DEPOSIT_MINT),
    config.keys.get(YIELD_MINT),
    feeAccount.address,
    swapPoolMintTokenAccount.address,
    tokenSwap.TOKEN_SWAP_PROGRAM_ID,
    spl.TOKEN_PROGRAM_ID,
    tokenSwapAccountAuthorityBump,
    TRADING_FEE_NUMERATOR,
    TRADING_FEE_DENOMINATOR,
    OWNER_TRADING_FEE_NUMERATOR,
    OWNER_TRADING_FEE_DENOMINATOR,
    OWNER_WITHDRAW_FEE_NUMERATOR,
    OWNER_WITHDRAW_FEE_DENOMINATOR,
    HOST_FEE_NUMERATOR,
    HOST_FEE_DENOMINATOR,
    tokenSwap.CurveType.ConstantProduct
  );
  console.log("tokenSwap pool created");

  // set token swap keys
  config.keys.set(SWAP_YIELD_VAULT, swapYieldVault.address);
  config.keys.set(SWAP_DEPOSIT_VAULT, swapDepositVault.address);
  config.keys.set(POOL_MINT, tokenPoolMint);
  config.keys.set(TOKEN_SWAP_ACCOUNT, tokenSwapAccount.publicKey);
  config.keys.set(TOKEN_SWAP_ACCOUNT_AUTHORITY, tokenSwapAccountAuthority);
  config.keys.set(POOL_FEE, feeAccount.address);
}

async function assertBalance(
  program: Program<NoLossLottery>,
  account: anchor.web3.PublicKey,
  expectedBalance: number
) {
  const balance = await (
    await program.provider.connection.getTokenAccountBalance(account)
  ).value.amount.valueOf();
  assert.equal(balance, expectedBalance);
}

async function assertAtLeastBalance(
  program: Program<NoLossLottery>,
  account: anchor.web3.PublicKey,
  expectedBalance: number
) {
  const balance = await (
    await program.provider.connection.getTokenAccountBalance(account)
  ).value.amount.valueOf();
  assert.ok(Number(balance) >= expectedBalance);
}

function assertPublicKey(
  f: Function,
  key1: anchor.web3.PublicKey,
  key2: anchor.web3.PublicKey
) {
  return f(key1.toString(), key2.toString());
}

async function buyNTickets(
  program: Program<NoLossLottery>,
  config: Config,
  count: Number
) {
  // buy a bunch of tickets
  let buyPromises = [];
  for (let i = 0; i < count; i++) {
    buyPromises.push(buy(program, [1 + i, 2, 3, 4, 5, 6], config, null));
  }
  await Promise.all(buyPromises);

  console.log("%d tickets purchased", count);
}
