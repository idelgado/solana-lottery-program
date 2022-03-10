import * as client from "../client";

async function initialize() {
  const lotteryClient = new client.Client();

  // read from env var
  const userAddress = process.env.PHANTOM_WALLET;

  const initializeTxSig = await lotteryClient.initialize(1, 1, userAddress);
  console.log("initializeTxSig:", initializeTxSig);
}

initialize();
