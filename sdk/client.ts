import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import * as tokenSwap from "@solana/spl-token-swap";
import { Program } from "@project-serum/anchor";
import { NoLossLottery } from "../target/types/no_loss_lottery";
import * as dotenv from "dotenv";
import * as envfile from "envfile";
import * as fs from "fs";

interface ClientAccounts {
  depositMint: anchor.web3.PublicKey;
  depositVault: anchor.web3.PublicKey;
  yieldMint: anchor.web3.PublicKey;
  yieldVault: anchor.web3.PublicKey;
  tickets: anchor.web3.PublicKey;
  vaultManager: anchor.web3.PublicKey;
  userDepositAta: anchor.web3.PublicKey;
  swapDepositVault: anchor.web3.PublicKey;
  swapYieldVault: anchor.web3.PublicKey;
  poolMint: anchor.web3.PublicKey;
  amm: anchor.web3.PublicKey;
  ammAuthority: anchor.web3.PublicKey;
  poolFee: anchor.web3.PublicKey;
}

// filepath where env file lives
const envFilePath: string = "clientaccounts.env";

export class Client {
  private program: Program<NoLossLottery>;

  constructor() {
    const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;
    this.program = program;
  }

  // initialize lottery
  public async initialize(
    drawDurationSeconds: number,
    ticketPrice: number
  ): Promise<string> {
    // init accounts
    const accounts = await this.createClientAccounts();

    // init lottery
    return this.program.rpc.initialize(
      new anchor.BN(drawDurationSeconds),
      new anchor.BN(ticketPrice),
      {
        accounts: {
          depositMint: accounts.depositMint,
          depositVault: accounts.depositVault,
          yieldMint: accounts.yieldMint,
          yieldVault: accounts.yieldVault,
          vaultManager: accounts.vaultManager,
          tickets: accounts.tickets,
          user: this.program.provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );
  }

  // buy lottery ticket
  public async buy(count: number) {
    const accounts = await this.readClientAccounts();

    // get tickets ATA for user
    const userTicketsAta = await spl.getAssociatedTokenAddress(
      accounts.tickets,
      this.program.provider.wallet.publicKey
    );

    for (let i = 0; i < count; i++) {
      let numbers: Array<number> = [i, 1, 2, 3, 4, 5];

      // create ticket PDA
      const [ticket, _ticketBump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [Uint8Array.from(numbers), accounts.vaultManager.toBuffer()],
          this.program.programId
        );

      await this.program.rpc.buy(numbers, {
        accounts: {
          depositMint: accounts.depositMint,
          depositVault: accounts.depositVault,
          yieldMint: accounts.yieldMint,
          yieldVault: accounts.yieldVault,
          vaultManager: accounts.vaultManager,
          tickets: accounts.tickets,
          ticket: ticket,
          userTicketsAta: userTicketsAta,
          user: this.program.provider.wallet.publicKey,
          userDepositAta: accounts.userDepositAta,
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      });
    }
    console.log("%d tickets purchased", count);
  }

  // draw winning numbers
  public async draw(): Promise<string> {
    const accounts = await this.readClientAccounts();

    return this.program.rpc.draw({
      accounts: {
        depositMint: accounts.depositMint,
        depositVault: accounts.depositVault,
        yieldMint: accounts.yieldMint,
        yieldVault: accounts.yieldVault,
        tickets: accounts.tickets,
        vaultManager: accounts.vaultManager,
        user: this.program.provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
  }

  // stake deposit tokens
  public async stake() {
    const accounts = await this.readClientAccounts();

    return this.program.rpc.stake({
      accounts: {
        depositMint: accounts.depositMint,
        depositVault: accounts.depositVault,
        yieldMint: accounts.yieldMint,
        yieldVault: accounts.yieldVault,
        vaultManager: accounts.vaultManager,
        swapYieldVault: accounts.swapYieldVault,
        swapDepositVault: accounts.swapDepositVault,
        poolMint: accounts.poolMint,
        amm: accounts.amm,
        ammAuthority: accounts.ammAuthority,
        poolFee: accounts.poolFee,
        user: this.program.provider.wallet.publicKey,
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
  }

  // dispense prize to winner
  public async dispense() {
    const accounts = await this.readClientAccounts();

    // fetch winning numbers
    const vaultMgrAccount = await this.program.account.vaultManager.fetch(
      accounts.vaultManager
    );

    // create winning ticket PDA
    const [ticket, ticketBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        Uint8Array.from(vaultMgrAccount.winningNumbers),
        accounts.vaultManager.toBuffer(),
      ],
      this.program.programId
    );

    // dispense prize to winner
    return this.program.rpc.dispense(vaultMgrAccount.winningNumbers, {
      accounts: {
        depositMint: accounts.depositMint,
        depositVault: accounts.depositVault,
        yieldMint: accounts.yieldMint,
        yieldVault: accounts.yieldVault,
        tickets: accounts.tickets,
        vaultManager: accounts.vaultManager,
        ticket: ticket,
        swapYieldVault: accounts.swapYieldVault,
        swapDepositVault: accounts.swapDepositVault,
        poolMint: accounts.poolMint,
        amm: accounts.amm,
        ammAuthority: accounts.ammAuthority,
        poolFee: accounts.poolFee,
        user: this.program.provider.wallet.publicKey,
        userDepositAta: accounts.userDepositAta,
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
      },
    });
  }

  // create no loss lottery program accounts
  private async createClientAccounts(): Promise<ClientAccounts> {
    const mintAuthority = await newAccountWithLamports(
      this.program.provider.connection
    );

    // create deposit mint for testing
    const depositMint = await spl.createMint(
      this.program.provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      9
    );

    // create yield mint for testing
    const yieldMint = await spl.createMint(
      this.program.provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      9
    );

    // get PDAs

    const [depositVault, _depositVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [depositMint.toBuffer()],
        this.program.programId
      );

    const [yieldVault, _yieldVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [yieldMint.toBuffer()],
        this.program.programId
      );

    const [vaultMgr, _vaultMgrBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          depositMint.toBuffer(),
          yieldMint.toBuffer(),
          depositVault.toBuffer(),
          yieldVault.toBuffer(),
        ],
        this.program.programId
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
        this.program.programId
      );

    // get user ata
    const userDepositAta = await spl.getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      this.program.provider.wallet.publicKey
    );

    // mint tokens to user_ata
    await spl.mintTo(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      userDepositAta.address,
      mintAuthority.publicKey,
      100
    );

    // init swap pool
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
      this.program.provider.connection,
      mintAuthority,
      tokenSwapAccountAuthority,
      null,
      2
    );

    const feeAccount = await spl.getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      mintAuthority,
      tokenPoolMint,
      new anchor.web3.PublicKey("HfoTxFR1Tm6kGmWgYWD6J7YHVy1UwqSULUGVLXkJqaKN"),
      true
    );

    // create swap token accounts
    const swapPoolMintTokenAccount =
      await spl.getOrCreateAssociatedTokenAccount(
        this.program.provider.connection,
        mintAuthority,
        tokenPoolMint,
        mintAuthority.publicKey,
        false
      );
    const swapDepositVault = await spl.getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      tokenSwapAccountAuthority,
      true
    );
    const swapYieldVault = await spl.getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      mintAuthority,
      yieldMint,
      tokenSwapAccountAuthority,
      true
    );

    // mint initial tokens to swap token accounts
    await spl.mintTo(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      swapDepositVault.address,
      mintAuthority,
      100000
    );
    await spl.mintTo(
      this.program.provider.connection,
      mintAuthority,
      yieldMint,
      swapYieldVault.address,
      mintAuthority,
      100000
    );

    await tokenSwap.TokenSwap.createTokenSwap(
      this.program.provider.connection,
      mintAuthority,
      tokenSwapAccount,
      tokenSwapAccountAuthority,
      swapDepositVault.address,
      swapYieldVault.address,
      tokenPoolMint,
      depositMint,
      yieldMint,
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

    const accounts = {
      depositMint: depositMint,
      depositVault: depositVault,
      yieldMint: yieldMint,
      yieldVault: yieldVault,
      tickets: tickets,
      vaultManager: vaultMgr,
      userDepositAta: userDepositAta.address,
      swapDepositVault: swapDepositVault.address,
      swapYieldVault: swapYieldVault.address,
      poolMint: tokenPoolMint,
      amm: tokenSwapAccount.publicKey,
      ammAuthority: tokenSwapAccountAuthority,
      poolFee: feeAccount.address,
    };

    const envFileString = await envfile.stringify(accounts);
    fs.writeFileSync(envFilePath, envFileString, "utf-8");
    console.log(envFileString);

    return accounts;
  }

  // read client accounts from env file
  private readClientAccounts(): ClientAccounts {
    dotenv.config({ path: envFilePath });

    const accounts = {
      depositMint: new anchor.web3.PublicKey(process.env.depositMint),
      depositVault: new anchor.web3.PublicKey(process.env.depositVault),
      yieldMint: new anchor.web3.PublicKey(process.env.yieldMint),
      yieldVault: new anchor.web3.PublicKey(process.env.yieldVault),
      tickets: new anchor.web3.PublicKey(process.env.tickets),
      vaultManager: new anchor.web3.PublicKey(process.env.vaultManager),
      userDepositAta: new anchor.web3.PublicKey(process.env.userDepositAta),
      swapDepositVault: new anchor.web3.PublicKey(
        process.env.swapDepositVault
      ),
      swapYieldVault: new anchor.web3.PublicKey(process.env.swapYieldVault),
      poolMint: new anchor.web3.PublicKey(process.env.poolMint),
      amm: new anchor.web3.PublicKey(process.env.amm),
      ammAuthority: new anchor.web3.PublicKey(process.env.ammAuthority),
      poolFee: new anchor.web3.PublicKey(process.env.poolFee),
    };

    return accounts;
  }
}

async function newAccountWithLamports(
  connection: anchor.web3.Connection,
  lamports: number = 100_000_000
): Promise<anchor.web3.Account> {
  // generate keypair
  const account = new anchor.web3.Account();

  // airdrop lamports
  let txSig = await connection.requestAirdrop(account.publicKey, lamports);
  await connection.confirmTransaction(txSig);

  return account;
}
