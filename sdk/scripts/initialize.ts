import * as client from "../client";

async function initialize() {
  const lotteryClient = new client.Client();

  // read from env var
  const userAddress = process.env.PHANTOM_WALLET;

  await lotteryClient.initialize(120, 1, userAddress);
  console.log("init complete");
}

initialize();
