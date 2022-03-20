import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import * as assert from "assert";
import * as tokenSwap from "@solana/spl-token-swap";
import {
  MetadataProgram,
  Metadata,
  Edition,
} from "@metaplex-foundation/mpl-token-metadata";
import { Program } from "@project-serum/anchor";
import { NoLossLottery } from "../target/types/no_loss_lottery";

const DEPOSIT_VAULT = "DEPOSIT_VAULT";
const DEPOSIT_MINT = "DEPOSIT_MINT";
const YIELD_VAULT = "YIELD_VAULT";
const YIELD_MINT = "YIELD_MINT";
const VAULT_MANAGER = "VAULT_MANAGER";
const MINT_AUTHORITY = "MINT_AUTHORITY";
const USER_DEPOSIT_ATA = "USER_DEPOSIT_ATA";
const SWAP_YIELD_VAULT = "SWAP_YIELD_VAULT";
const SWAP_DEPOSIT_VAULT = "SWAP_DEPOSIT_VAULT";
const POOL_MINT = "POOL_MINT";
const TOKEN_SWAP_ACCOUNT = "TOKEN_SWAP_ACCOUNT";
const TOKEN_SWAP_ACCOUNT_AUTHORITY = "TOKEN_SWAP_ACCOUNT_AUTHORITY";
const POOL_FEE = "POOL_FEE";
const COLLECTION_MINT = "COLLECTION_MINT";
const COLLECTION_METADATA = "COLLECTION_METADATA";
const COLLECTION_MASTER_EDITION = "COLLECTION_MASTER_EDITION";
const COLLECTION_ATA = "COLLECTION_ATA";

interface Config {
  keys: Map<String, anchor.web3.PublicKey>;
  mintAuthority: anchor.web3.Account;
}

describe("Initialize", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Init success", async () => {
    const drawDurationSeconds = 1;
    await initialize(program, drawDurationSeconds);
  });
});

describe("Buy", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;

  it("Buy ticket", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);

    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, userTicketAta] = await buy(program, numbers, config, null);
    await assertBalance(program, userTicketAta, 1);
  });

  it("Buy ticket with invalid number values", async () => {
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds);
    const numbers = [0, 0, 0, 0, 0, 0];

    const [ticket, userTicketAta] = await buy(
      program,
      numbers,
      config,
      program.idl.errors[2].code
    );
    assert.rejects(async () => await assertBalance(program, userTicketAta, 0));
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

    const [ticket, userTicketAta] = await buy(program, numbers, config, null);
    await assertBalance(program, userTicketAta, 1);

    assert.rejects(async () => await buy(program, numbers, config, null));
  });

  it("Buy ticket with different numbers", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
    const numbersA = [1, 2, 3, 4, 5, 6];
    const numbersB = [7, 8, 9, 10, 11, 12];

    const [ticketA, userTicketAAta] = await buy(
      program,
      numbersA,
      config,
      null
    );
    await assertBalance(program, userTicketAAta, 1);

    const [ticketB, userTicketBAta] = await buy(
      program,
      numbersB,
      config,
      null
    );
    await assertBalance(program, userTicketBAta, 1);
  });

  it("Buy second ticket with insufficient funds", async () => {
    const drawDurationSeconds = 1;

    const config = await initialize(program, drawDurationSeconds);
    const numbersA = [1, 2, 3, 4, 5, 6];
    const numbersB = [7, 8, 9, 10, 11, 12];

    const [ticketA, userTicketAAta] = await buy(
      program,
      numbersA,
      config,
      null
    );
    await assertBalance(program, userTicketAAta, 1);

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

    const [ticket, userTicketAta] = await buy(program, numbers, config, null);

    // balance is 0 after buying a ticket
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 0);

    await redeem(program, config, ticket, null);

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

    const [ticket1, userTicketAta1] = await buy(
      program,
      numbers1,
      config,
      null
    );
    const [ticket2, userTicketAta2] = await buy(
      program,
      numbers2,
      config,
      null
    );

    // balance is 0 after buying 2 tickets
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 0);

    await redeem(program, config, ticket1, null);
    await redeem(program, config, ticket2, null);

    // we get our tokens back
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 2);
  });

  it("Redeem same ticket twice", async () => {
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds);
    await tokenSwapInit(program, config);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, userTicketAta] = await buy(program, numbers, config, null);

    await redeem(program, config, ticket, null);
    assert.rejects(async () => await redeem(program, config, ticket, null));

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

    const [ticket, userTicketAta] = await buy(program, numbers, config, null);

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
    await redeem(program, config, ticket, null);

    // we get 1 deposit_token back after a single redeem call
    await assertBalance(
      program,
      config.keys.get(USER_DEPOSIT_ATA),
      totalTicketsPurchased + 1
    );
  });

  it("Buy ticket, redeem it and buy the same ticket again", async () => {
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds);
    await tokenSwapInit(program, config);

    // buy ticket and redeem
    const numbers = [1, 2, 3, 4, 5, 6];
    const [ticketFirst, userTicketAtaFirst] = await buy(
      program,
      numbers,
      config,
      null
    );
    await redeem(program, config, ticketFirst, null);

    // buy same ticket again
    const [ticketSecond, userTicketAtaSecond] = await buy(
      program,
      numbers,
      config,
      null
    );
    await redeem(program, config, ticketSecond, null);
  });

  it("Redeem ticket, trade it to userB, userB redeems for the deposit token back", async () => {
    const drawDurationSeconds = 1;
    const config = await initialize(program, drawDurationSeconds, 1);
    await tokenSwapInit(program, config);

    // choose your lucky numbers!
    const numbers = [1, 2, 3, 4, 5, 6];

    const [ticket, userTicketAta] = await buy(program, numbers, config, null);

    // balance is 0 after buying a ticket
    await assertBalance(program, config.keys.get(USER_DEPOSIT_ATA), 0);

    // get ticketMint
    const ticketMint = (await program.account.ticket.fetch(ticket)).ticketMint;

    // create new user and ATA
    const userB = await newAccountWithLamports(program.provider.connection);
    const userBATA = await spl.getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      userB,
      ticketMint,
      userB.publicKey
    );

    // transfer NFT to UserB
    const tx = new anchor.web3.Transaction();
    const transferIx = spl.createTransferInstruction(
      userTicketAta,
      userBATA.address,
      program.provider.wallet.publicKey,
      1
    );
    tx.add(transferIx);
    await program.provider.send(tx);
    console.log("NFT transferred");

    // userB redeem ticket
    const userDepositAta = await redeemAnyUser(
      program,
      config,
      ticket,
      userB,
      null
    );

    // we get our token back
    await assertBalance(program, userDepositAta, 1);
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

    // choose a non winning combination
    const numbers = [7, 8, 9, 10, 11, 12];

    const [ticketMint, _userTicketAta] = await buy(
      program,
      numbers,
      config,
      null
    );

    // wait for cutoff_time to expire
    await sleep(drawDurationSeconds + 1);

    await draw(program, config, null);

    // get winning numbers from vault_manager, set by draw
    const vaultMgrAccount = await program.account.vaultManager.fetch(
      config.keys.get(VAULT_MANAGER)
    );

    await dispense(program, config, vaultMgrAccount.winningNumbers, null);

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

    const [ticketMint, userTicketAta] = await buy(
      program,
      numbers,
      config,
      null
    );

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

  const [collectionMint, _collectionMintBump] =
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

  const collectionMetadata = await Metadata.getPDA(collectionMint);
  const collectionMasterEdition = await Edition.getPDA(collectionMint);

  const [collectionAta, _collectionAtaBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [collectionMint.toBuffer()],
      program.programId
    );
  console.log("collection accounts created");

  // ticket price in tokens
  const ticketPrice = new anchor.BN(1);

  // init vault
  const initTxSig = await program.rpc.initialize(
    "test-lottery",
    new anchor.BN(drawDurationSeconds),
    ticketPrice,
    {
      accounts: {
        depositMint: depositMint,
        yieldMint: yieldMint,
        depositVault: depositVault,
        yieldVault: yieldVault,
        vaultManager: vaultMgr,
        collectionMint: collectionMint,
        collectionMetadata: collectionMetadata,
        collectionMasterEdition: collectionMasterEdition,
        collectionAta: collectionAta,
        user: program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        metadataProgram: MetadataProgram.PUBKEY,
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

  //// get user tickets ata
  //const userTicketsAta = await spl.getOrCreateAssociatedTokenAccount(
  //  program.provider.connection,
  //  mintAuthority,
  //  tickets,
  //  program.provider.wallet.publicKey
  //);

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
  keys.set(USER_DEPOSIT_ATA, userDepositAta.address);
  keys.set(COLLECTION_MINT, collectionMint);
  keys.set(COLLECTION_METADATA, collectionMetadata);
  keys.set(COLLECTION_MASTER_EDITION, collectionMasterEdition);
  keys.set(COLLECTION_ATA, collectionAta);

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
): Promise<[anchor.web3.PublicKey, anchor.web3.PublicKey]> {
  // create ticket PDA
  const [ticket, _ticketBump] = await anchor.web3.PublicKey.findProgramAddress(
    [Uint8Array.from(numbers), config.keys.get(VAULT_MANAGER).toBuffer()],
    program.programId
  );

  const ticketMint = await spl.createMint(
    program.provider.connection,
    config.mintAuthority,
    config.keys.get(VAULT_MANAGER),
    config.keys.get(VAULT_MANAGER),
    0
  );

  const userTicketAta = await spl.getAssociatedTokenAddress(
    ticketMint,
    program.provider.wallet.publicKey
  );

  const ticketMetadata = await Metadata.getPDA(ticketMint);
  const ticketMasterEdition = await Edition.getPDA(ticketMint);

  // buy a ticket
  try {
    const buyTxSig = await program.rpc.buy(numbers, {
      accounts: {
        depositMint: config.keys.get(DEPOSIT_MINT),
        depositVault: config.keys.get(DEPOSIT_VAULT),
        yieldMint: config.keys.get(YIELD_MINT),
        yieldVault: config.keys.get(YIELD_VAULT),
        vaultManager: config.keys.get(VAULT_MANAGER),
        collectionMint: config.keys.get(COLLECTION_MINT),
        collectionMetadata: config.keys.get(COLLECTION_METADATA),
        collectionMasterEdition: config.keys.get(COLLECTION_MASTER_EDITION),
        ticketMint: ticketMint,
        ticketMetadata: ticketMetadata,
        ticketMasterEdition: ticketMasterEdition,
        ticket: ticket,
        userTicketAta: userTicketAta,
        user: program.provider.wallet.publicKey,
        userDepositAta: config.keys.get(USER_DEPOSIT_ATA),
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        metadataProgram: MetadataProgram.PUBKEY,
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
  return [ticket, userTicketAta];
}

async function redeem(
  program: Program<NoLossLottery>,
  config: Config,
  ticket: anchor.web3.PublicKey,
  error: number | null
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
        vaultManager: config.keys.get(VAULT_MANAGER),
        collectionMint: config.keys.get(COLLECTION_MINT),
        ticketMint: ticketAccount.ticketMint,
        ticket: ticket,
        userTicketAta: userTicketAta,
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

async function redeemAnyUser(
  program: Program<NoLossLottery>,
  config: Config,
  ticket: anchor.web3.PublicKey,
  user: anchor.web3.Account,
  error: number | null
): Promise<anchor.web3.PublicKey> {
  const ticketAccount = await program.account.ticket.fetch(ticket);

  const userTicketAta = await spl.getAssociatedTokenAddress(
    ticketAccount.ticketMint,
    user.publicKey
  );

  const userDepositAta = await spl.getOrCreateAssociatedTokenAccount(
    program.provider.connection,
    user,
    config.keys.get(DEPOSIT_MINT),
    user.publicKey
  );

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
        vaultManager: config.keys.get(VAULT_MANAGER),
        collectionMint: config.keys.get(COLLECTION_MINT),
        ticketMint: ticketAccount.ticketMint,
        ticket: ticket,
        userTicketAta: userTicketAta,
        user: user.publicKey,
        userDepositAta: userDepositAta.address,
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [user],
    });
    console.log("redeemTxSig:", redeemTxSig);
  } catch (e) {
    if (error) {
      assert.equal(e.code, error);
    } else {
      throw e;
    }
  }

  return userDepositAta.address;
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
    // find winning ticket PDA
    const [ticket, _ticketBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Uint8Array.from(numbers), config.keys.get(VAULT_MANAGER).toBuffer()],
        program.programId
      );

    // get owner of ticket nft

    // set owner to user wallet as default
    // if a winning ticket exists this will be overwritten with the ticket owner's pubkey
    let winningTicketOwner = new anchor.web3.PublicKey(
      program.provider.wallet.publicKey
    );

    let ticketMint = await spl.createMint(
      program.provider.connection,
      config.mintAuthority,
      config.keys.get(VAULT_MANAGER),
      config.keys.get(VAULT_MANAGER),
      0
    );

    let depositMint = await spl.createMint(
      program.provider.connection,
      config.mintAuthority,
      config.keys.get(VAULT_MANAGER),
      config.keys.get(VAULT_MANAGER),
      0
    );

    try {
      const ticketAccount = await program.account.ticket.fetch(ticket);
      // get largest token account holders of nft, there should only be 1 with an amount of 1
      const largestAccounts =
        await program.provider.connection.getTokenLargestAccounts(
          ticketAccount.ticketMint
        );
      // get parsed data of the largest account
      const largestAccountInfo =
        await program.provider.connection.getParsedAccountInfo(
          largestAccounts.value[0].address
        );
      winningTicketOwner = new anchor.web3.PublicKey(
        (
          largestAccountInfo.value?.data as anchor.web3.ParsedAccountData
        ).parsed.info.owner
      );

      ticketMint = ticketAccount.ticketMint;
      depositMint = ticketAccount.depositMint;
    } catch (e) {
      console.log(e);
    }

    const winnerTicketAta = await spl.getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      config.mintAuthority,
      ticketMint,
      winningTicketOwner
    );

    const winnerDepositAta = await spl.getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      config.mintAuthority,
      depositMint,
      winningTicketOwner
    );

    // dispense prize to winner
    const dispenseTxSig = await program.rpc.dispense(numbers, {
      accounts: {
        depositMint: config.keys.get(DEPOSIT_MINT),
        depositVault: config.keys.get(DEPOSIT_VAULT),
        yieldMint: config.keys.get(YIELD_MINT),
        yieldVault: config.keys.get(YIELD_VAULT),
        vaultManager: config.keys.get(VAULT_MANAGER),
        collectionMint: config.keys.get(COLLECTION_MINT),
        ticket: ticket,
        winnerTicketAta: winnerTicketAta.address,
        swapYieldVault: config.keys.get(SWAP_YIELD_VAULT),
        swapDepositVault: config.keys.get(SWAP_DEPOSIT_VAULT),
        poolMint: config.keys.get(POOL_MINT),
        amm: config.keys.get(TOKEN_SWAP_ACCOUNT),
        ammAuthority: config.keys.get(TOKEN_SWAP_ACCOUNT_AUTHORITY),
        poolFee: config.keys.get(POOL_FEE),
        user: program.provider.wallet.publicKey,
        winnerDepositAta: winnerDepositAta.address,
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
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
