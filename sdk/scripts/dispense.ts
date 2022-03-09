import * as client from "../client";

async function dispense() {
  const lotteryClient = new client.Client();

  const dispenseTxSig = await lotteryClient.dispense();
  console.log("dispenseTxSig:", dispenseTxSig);
}

dispense();
