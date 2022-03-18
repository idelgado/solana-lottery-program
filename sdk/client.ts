import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import * as tokenSwap from "@solana/spl-token-swap";
import { Program } from "@project-serum/anchor";
import { NoLossLottery } from "../target/types/no_loss_lottery";
import * as dotenv from "dotenv";
import * as envfile from "envfile";
import * as fs from "fs";
import {
  MetadataProgram,
  Metadata,
  Edition,
} from "@metaplex-foundation/mpl-token-metadata";

interface ClientAccounts {
  depositMint: anchor.web3.PublicKey;
  depositVault: anchor.web3.PublicKey;
  yieldMint: anchor.web3.PublicKey;
  yieldVault: anchor.web3.PublicKey;
  vaultManager: anchor.web3.PublicKey;
  userDepositAta: anchor.web3.PublicKey;
  swapDepositVault: anchor.web3.PublicKey;
  swapYieldVault: anchor.web3.PublicKey;
  poolMint: anchor.web3.PublicKey;
  amm: anchor.web3.PublicKey;
  ammAuthority: anchor.web3.PublicKey;
  poolFee: anchor.web3.PublicKey;
  collectionMint: anchor.web3.PublicKey;
  collectionMetadata: anchor.web3.PublicKey;
  collectionMasterEdition: anchor.web3.PublicKey;
  collectionAta: anchor.web3.PublicKey;
  mintAuthority: anchor.web3.Account;
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
    lotteryName: string,
    drawDurationSeconds: number,
    ticketPrice: number,
    userDepositAta: string
  ): Promise<void> {
    // init accounts
    const accounts = await this.createClientAccounts(
      new anchor.web3.PublicKey(userDepositAta)
    );

    // init lottery
    await this.program.rpc.initialize(
      lotteryName,
      new anchor.BN(drawDurationSeconds),
      new anchor.BN(ticketPrice),
      {
        accounts: {
          depositMint: accounts.depositMint,
          depositVault: accounts.depositVault,
          yieldMint: accounts.yieldMint,
          yieldVault: accounts.yieldVault,
          vaultManager: accounts.vaultManager,
          collectionMint: accounts.collectionMint,
          collectionMetadata: accounts.collectionMetadata,
          collectionMasterEdition: accounts.collectionMasterEdition,
          collectionAta: accounts.collectionAta,
          user: this.program.provider.wallet.publicKey,
          metadataProgram: MetadataProgram.PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
      }
    );

    await spl.mintTo(
      this.program.provider.connection,
      accounts.mintAuthority,
      accounts.depositMint,
      accounts.depositVault,
      accounts.mintAuthority.publicKey,
      1000
    );
  }

  // buy lottery ticket
  public async buy(count: number) {
    const accounts = await this.readClientAccounts();

    for (let i = 1; i <= count; i++) {
      let numbers: Array<number> = [i, 12, 2, 3, 4, 5];

      // create ticket PDA
      const [ticket, _ticketBump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [Uint8Array.from(numbers), accounts.vaultManager.toBuffer()],
          this.program.programId
        );

      const ticketMint = await spl.createMint(
        this.program.provider.connection,
        accounts.mintAuthority,
        accounts.vaultManager,
        accounts.vaultManager,
        0
      );

      const userTicketAta = await spl.getAssociatedTokenAddress(
        ticketMint,
        this.program.provider.wallet.publicKey
      );

      const ticketMetadata = await Metadata.getPDA(ticketMint);
      const ticketMasterEdition = await Edition.getPDA(ticketMint);

      await this.program.rpc.buy(numbers, {
        accounts: {
          depositMint: accounts.depositMint,
          depositVault: accounts.depositVault,
          yieldMint: accounts.yieldMint,
          yieldVault: accounts.yieldVault,
          vaultManager: accounts.vaultManager,
          collectionMint: accounts.collectionMint,
          collectionMetadata: accounts.collectionMetadata,
          collectionMasterEdition: accounts.collectionMasterEdition,
          ticketMint: ticketMint,
          ticketMetadata: ticketMetadata,
          ticketMasterEdition: ticketMasterEdition,
          ticket: ticket,
          userTicketAta: userTicketAta,
          user: this.program.provider.wallet.publicKey,
          userDepositAta: accounts.userDepositAta,
          systemProgram: anchor.web3.SystemProgram.programId,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          metadataProgram: MetadataProgram.PUBKEY,
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

    // create payer
    const payer = await newAccountWithLamports(this.program.provider.connection);

    // fetch vault manager data
    const vaultManagerAccount = await this.program.account.vaultManager.fetch(
      accounts.vaultManager
    );

    // find winning ticket PDA
    const [ticket, _ticketBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Uint8Array.from(vaultManagerAccount.winningNumbers),
          accounts.vaultManager.toBuffer(),
        ],
        this.program.programId
      );

    // get owner of ticket nft

    // set owner to user wallet as default
    // if a winning ticket exists this will be overwritten with the ticket owner's pubkey
    let winningTicketOwner = new anchor.web3.PublicKey(
      this.program.provider.wallet.publicKey
    );

    let ticketMint = await spl.createMint(
      this.program.provider.connection,
      payer,
      accounts.vaultManager,
      accounts.vaultManager,
      0
    );

    let depositMint = await spl.createMint(
      this.program.provider.connection,
      payer,
      accounts.vaultManager,
      accounts.vaultManager,
      0
    );

    try {
      const ticketAccount = await this.program.account.ticket.fetch(ticket);
      // get largest token account holders of nft, there should only be 1 with an amount of 1
      const largestAccounts =
        await this.program.provider.connection.getTokenLargestAccounts(
          ticketAccount.ticketMint
        );
      // get parsed data of the largest account
      const largestAccountInfo =
        await this.program.provider.connection.getParsedAccountInfo(
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
      this.program.provider.connection,
      payer,
      ticketMint,
      winningTicketOwner
    );

    const winnerDepositAta = await spl.getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      payer,
      depositMint,
      winningTicketOwner
    );

    // dispense prize to winner
    return this.program.rpc.dispense(vaultManagerAccount.winningNumbers, {
      accounts: {
        depositMint: accounts.depositMint,
        depositVault: accounts.depositVault,
        yieldMint: accounts.yieldMint,
        yieldVault: accounts.yieldVault,
        vaultManager: accounts.vaultManager,
        ticket: ticket,
        swapYieldVault: accounts.swapYieldVault,
        swapDepositVault: accounts.swapDepositVault,
        poolMint: accounts.poolMint,
        amm: accounts.amm,
        ammAuthority: accounts.ammAuthority,
        poolFee: accounts.poolFee,
        collectionMint: accounts.collectionMint,
        user: this.program.provider.wallet.publicKey,
        winnerDepositAta: winnerDepositAta.address,
        winnerTicketAta: winnerTicketAta.address,
        tokenSwapProgram: tokenSwap.TOKEN_SWAP_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
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

    const [collectionMint, _collectionMintBump] =
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

    const collectionMetadata = await Metadata.getPDA(collectionMint);
    const collectionMasterEdition = await Edition.getPDA(collectionMint);

    const [collectionAta, _collectionAtaBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [collectionMint.toBuffer()],
        this.program.programId
      );
    console.log("collection accounts created");

    // get deployer
    const userDeployerAta = await spl.getOrCreateAssociatedTokenAccount(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      userDepositAtaAddress
    );

    // mint tokens to deployer
    await spl.mintTo(
      this.program.provider.connection,
      mintAuthority,
      depositMint,
      userDeployerAta.address,
      mintAuthority.publicKey,
      1000
    );

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
      vaultManager: vaultMgr,
      userDepositAta: userDeployerAta.address,
      swapDepositVault: swapDepositVault.address,
      swapYieldVault: swapYieldVault.address,
      collectionMint: collectionMint,
      collectionMetadata: collectionMetadata,
      collectionMasterEdition: collectionMasterEdition,
      collectionAta: collectionAta,
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
      NEXT_PUBLIC_vaultManager: vaultMgr,
      NEXT_PUBLIC_userDepositAta: userDeployerAta.address,
      NEXT_PUBLIC_swapDepositVault: swapDepositVault.address,
      NEXT_PUBLIC_swapYieldVault: swapYieldVault.address,
      NEXT_PUBLIC_poolMint: tokenPoolMint,
      NEXT_PUBLIC_amm: tokenSwapAccount.publicKey,
      NEXT_PUBLIC_ammAuthority: tokenSwapAccountAuthority,
      NEXT_PUBLIC_poolFee: feeAccount.address,
      NEXT_PUBLIC_collectionMint: collectionMint,
      NEXT_PUBLIC_collectionMetadata: collectionMetadata,
      NEXT_PUBLIC_collectionMasterEdition: collectionMasterEdition,
      NEXT_PUBLIC_collectionAta: collectionAta,
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
      vaultManager: new anchor.web3.PublicKey(process.env.vaultManager),
      userDepositAta: new anchor.web3.PublicKey(process.env.userDepositAta),
      swapDepositVault: new anchor.web3.PublicKey(process.env.swapDepositVault),
      swapYieldVault: new anchor.web3.PublicKey(process.env.swapYieldVault),
      poolMint: new anchor.web3.PublicKey(process.env.poolMint),
      amm: new anchor.web3.PublicKey(process.env.amm),
      ammAuthority: new anchor.web3.PublicKey(process.env.ammAuthority),
      poolFee: new anchor.web3.PublicKey(process.env.poolFee),
      collectionMint: new anchor.web3.PublicKey(process.env.collectionMint),
      collectionMetadata: new anchor.web3.PublicKey(
        process.env.collectionMetadata
      ),
      collectionMasterEdition: new anchor.web3.PublicKey(
        process.env.collectionMasterEdition
      ),
      collectionAta: new anchor.web3.PublicKey(process.env.collectionAta),
      mintAuthority: new anchor.web3.Account(),
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
