import * as client from "../client";

async function stake() {
  const lotteryClient = new client.Client();

  const stakeTxSig = await lotteryClient.stake();
  console.log("stakeTxSig:", stakeTxSig);
}

stake();
