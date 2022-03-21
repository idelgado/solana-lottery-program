import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export interface VrfClientState {
  authority: PublicKey;
  maxResult: anchor.BN;
  vrf: PublicKey;
  resultBuffer: number[];
  result: anchor.BN;
  lastTimestamp: anchor.BN;
}

export class VrfClient {
  program: anchor.Program;

  publicKey: PublicKey;

  constructor(program: anchor.Program, publicKey: PublicKey) {
    this.program = program;
    this.publicKey = publicKey;
  }

  /**
   * @return account size of the global ProgramStateAccount.
   */
  size(): number {
    return this.program.account.sbState.size;
  }

  async loadData(): Promise<VrfClientState> {
    // console.log(JSON.stringify(this.program.account, undefined, 2));
    const state: any = await this.program.account.vrfClient.fetch(
      this.publicKey
    );
    return state;
  }

  async print(): Promise<void> {
    console.log(JSON.stringify(await this.loadData(), undefined, 2));
  }

  public static fromSeed(
    program: anchor.Program,
    vrfPubkey: PublicKey,
    authority: PublicKey
  ): [VrfClient, number] {
    const [statePubkey, stateBump] =
      anchor.utils.publicKey.findProgramAddressSync(
        [Buffer.from("STATE"), vrfPubkey.toBytes(), authority.toBytes()],
        program.programId
      );
    return [new VrfClient(program, statePubkey), stateBump];
  }

}
