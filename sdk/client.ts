import * as anchor from "@project-serum/anchor";
// Avoid linking to switchboard spl-token dependency
import * as spl from "../node_modules/@solana/spl-token";
import * as tokenSwap from "@solana/spl-token-swap";
import { Program, Provider } from "@project-serum/anchor";
import { NoLossLottery } from "../target/types/no_loss_lottery";
import * as dotenv from "dotenv";
import * as envfile from "envfile";
import * as fs from "fs";
import { createVrfAccount } from "./scripts/initialize";
import { ConfirmOptions } from "@solana/web3.js";
import { requestRandomnessCPI } from "./scripts/draw";

export interface ClientAccounts {
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
  mintAuthority: anchor.web3.Account;
}

// filepath where env file lives
const envFilePath: string = "clientaccounts.env";

export class Client {
  private program: Program<NoLossLottery>;

  constructor() {
    // Use confirmed to ensure that blockchain state is valid
    const opts: ConfirmOptions = {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    };
    const url = process.env.ANCHOR_PROVIDER_URL;
    if (url === undefined) {
      throw new Error("ANCHOR_PROVIDER_URL is not defined");
    }
    const providerAnchor = Provider.local(url, opts);

    console.log("provider %s", providerAnchor.connection);
    anchor.setProvider(providerAnchor);
    const program = anchor.workspace.NoLossLottery as Program<NoLossLottery>;
    this.program = program;
  }

  // initialize lottery
  public async initialize(argv: any): Promise<void> {
    console.log("argv % s", argv);
    const { userAddress} = argv;
    console.log("userAddress", userAddress);
    // init accounts
    const accounts = await this.createClientAccounts(
      new anchor.web3.PublicKey(userAddress)
    );

    console.log("accounts", accounts);

    await createVrfAccount(this.program, accounts, argv);

    await spl.mintTo(
      this.program.provider.connection,
      accounts.mintAuthority,
      accounts.depositMint,
      accounts.depositVault,
      accounts.mintAuthority.publicKey,
      1000
    )
  }

  // buy lottery ticket
  public async buy(count: number) {
    const accounts = await this.readClientAccounts();

    // get tickets ATA for user
    const userTicketsAta = await spl.getAssociatedTokenAddress(
      accounts.tickets,
      this.program.provider.wallet.publicKey
    );

    for (let i = 1; i <= count; i++) {
      let numbers: Array<number> = [i, 12, 2, 3, 4, 5];

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

  public async draw(argv: any): Promise<void> {
    await requestRandomnessCPI(argv); 
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
  private async createClientAccounts(
    userDepositAtaAddress?: anchor.web3.PublicKey
  ): Promise<ClientAccounts> {
    const mintAuthority = await newAccountWithLamports(
      this.program.provider.connection
    );
    console.log("mintAuthority", mintAuthority);

    // create deposit mint for testing
    const depositMint = await spl.createMint(
      this.program.provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      9
    );
    console.log("depositMint", depositMint);

    // create yield mint for testing
    const yieldMint = await spl.createMint(
      this.program.provider.connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      9
    );
    console.log("yieldMint", yieldMint);

    // get PDAs

    const [depositVault, _depositVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [depositMint.toBuffer()],
        this.program.programId
      );
    console.log("depositVault", depositVault);

    const [yieldVault, _yieldVaultBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [yieldMint.toBuffer()],
        this.program.programId
      );
    console.log("yieldVault", yieldVault);

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
    console.log("vaultMgr", vaultMgr);

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
    console.log("tickets", tickets);

    // get deployer
    const userDeployerAta = await spl.getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      userDepositAtaAddress
    );
    console.log("userDeployerAta", userDeployerAta);

    // mint tokens to deployer
    await spl.mintTo(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      userDeployerAta.address,
      mintAuthority.publicKey,
      1000
    );
    console.log("minted tokens to deployer");

    // get user ata
    const userDepositAta = await spl.getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      userDepositAtaAddress
    );

    // mint tokens to user_ata
    await spl.mintTo(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      userDepositAta.address,
      mintAuthority.publicKey,
      1000
    );
    console.log("minted tokens to user ata");

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
    console.log("tokenSwapAccountAuthority %s", tokenSwapAccountAuthority);

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
    console.log("swapYield minting");

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
    console.log("token swap created");

    const accounts = {
      depositMint: depositMint,
      depositVault: depositVault,
      yieldMint: yieldMint,
      yieldVault: yieldVault,
      tickets: tickets,
      vaultManager: vaultMgr,
      userDepositAta: userDeployerAta.address,
      swapDepositVault: swapDepositVault.address,
      swapYieldVault: swapYieldVault.address,
      poolMint: tokenPoolMint,
      amm: tokenSwapAccount.publicKey,
      ammAuthority: tokenSwapAccountAuthority,
      poolFee: feeAccount.address,
      mintAuthority: mintAuthority,
    };

    const envFileString = await envfile.stringify(accounts);
    fs.writeFileSync(envFilePath, envFileString, "utf-8");
    console.log(envFileString);

    // for the web application
    const browserAccounts = {
      NEXT_PUBLIC_depositMint: depositMint,
      NEXT_PUBLIC_depositVault: depositVault,
      NEXT_PUBLIC_yieldMint: yieldMint,
      NEXT_PUBLIC_yieldVault: yieldVault,
      NEXT_PUBLIC_tickets: tickets,
      NEXT_PUBLIC_vaultManager: vaultMgr,
      NEXT_PUBLIC_userDepositAta: userDeployerAta.address,
      NEXT_PUBLIC_swapDepositVault: swapDepositVault.address,
      NEXT_PUBLIC_swapYieldVault: swapYieldVault.address,
      NEXT_PUBLIC_poolMint: tokenPoolMint,
      NEXT_PUBLIC_amm: tokenSwapAccount.publicKey,
      NEXT_PUBLIC_ammAuthority: tokenSwapAccountAuthority,
      NEXT_PUBLIC_poolFee: feeAccount.address,
    };

    const browserEnvFile = await envfile.stringify(browserAccounts);
    fs.writeFileSync("./app/.env.local", browserEnvFile, "utf-8");

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
      swapDepositVault: new anchor.web3.PublicKey(process.env.swapDepositVault),
      swapYieldVault: new anchor.web3.PublicKey(process.env.swapYieldVault),
      poolMint: new anchor.web3.PublicKey(process.env.poolMint),
      amm: new anchor.web3.PublicKey(process.env.amm),
      ammAuthority: new anchor.web3.PublicKey(process.env.ammAuthority),
      poolFee: new anchor.web3.PublicKey(process.env.poolFee),
      mintAuthority: new anchor.web3.Account,
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
