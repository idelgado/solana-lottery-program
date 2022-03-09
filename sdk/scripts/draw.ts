import * as client from "../client";

async function draw() {
  const lotteryClient = new client.Client();

  const drawTxSig = await lotteryClient.draw();
  console.log("drawTxSig:", drawTxSig);
}

draw();
