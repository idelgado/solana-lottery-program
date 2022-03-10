import * as client from "../client";

async function initialize() {
  const lotteryClient = new client.Client();

  // replace with your own
  const userAddress = "9E5uwGf8vYqrkTyaA7r6NxXjNZena4RHB7MPq6MQuBgi";

  const initializeTxSig = await lotteryClient.initialize(1, 1, userAddress);
  console.log("initializeTxSig:", initializeTxSig);
}

initialize();
