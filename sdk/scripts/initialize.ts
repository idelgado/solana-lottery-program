import * as client from "../client";

async function initialize() {
  const lotteryClient = new client.Client();

  const initializeTxSig = await lotteryClient.initialize(1, 1);
  console.log("initializeTxSig:", initializeTxSig);
}

initialize();
