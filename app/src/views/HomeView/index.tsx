import Link from "next/link";
import { FC, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import useProgram from "components/program";
import { Program } from "@project-serum/anchor";
import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import { NoLossLottery } from "../../../../target/types/no_loss_lottery"

import styles from "./index.module.css";
import { useEffect } from "react";

const VAULT = "VAULT";
const VAULT_MANAGER = "VAULT_MANAGER";
const MINT = "MINT";
const TICKETS = "TICKETS";
const USER_DEPOSIT_ATA = "USER_DEPOSIT_ATA";
const USER_TICKET_ATA = "USER_TICKET_ATA";

export const buyOneTicket = async (

  ): Promise<string> => {
    return "";
};

interface Config {
  keys: Map<String, anchor.web3.PublicKey>;
  bumps: Map<String, number>;
}

async function buy(
  program: Program<NoLossLottery>,
  numbers: Array<number>,
  config: Config,
): Promise<[anchor.web3.PublicKey, number]> {
  return [new anchor.web3.PublicKey(0),0] 
}

export const HomeView: FC = ({}) => {
  const { publicKey } = useWallet();
  const { program, loadProgram } = useProgram();

  const buyTicket = async () => {
    console.log("buy");
    buy();
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
          <div className="hero min-h-16 py-4">
            <div className="text-center hero-content">
              <div className="max-w-lg">
                <h1 className="mb-5 text-5xl font-bold">
                  No Loss Lottery
                </h1>
                <p className="mb-5">
                  Solana wallet adapter is connected and ready to use.
                </p>
                <p>
                  {publicKey ? <>Your account address: {publicKey.toBase58()}</> : null}
                </p>
              </div>
            </div>
          </div>

          <button className="btn btn-primary normal-case btn-xs" onClick={buyTicket} >
            Buy Ticket
          </button>
        </div>
      </div>
    </div>
  );
};
