# no-loss-lottery

Solana Riptide Hackathon

## Basic App Walkthrough

```bash

# start validator and load programs
anchor localnet

# set config to localhost to test against a local validator
solana config set -u localhost

# define wallet to use for transactions
# copy path from 'Keypair Path'
export ANCHOR_WALLET=$(solana config get | grep 'Keypair Path' | cut -d ' ' -f3)

# add phantom wallet pubkey used to connect to dapp through browser
export PHANTOM_WALLET="phantom-wallet-pubkey"

# initialize writes pubkeys to 'clientaccounts.env'
# other funcs read from 'clientaccounts.env'
# required for further commands
# will read $PHANTOM_WALLET to mint dummy tokens
ts-node ./sdk/scripts/initialize.ts

# run app in a new terminal
cd app/ && yarn run dev

# navigate to webapp with a browser at http://localhost:3000

# connect to webapp with Phantom and airdrop some SOL for transaction fees
solana airdrop 100 $PHANTOM_WALLET

# stake deposit tokens
ts-node ./sdk/scripts/stake.ts

# draw winning ticket numbers
ts-node ./sdk/scripts/draw.ts

# dispense prize to winner
ts-node ./sdk/scripts/dispense.ts
```

## test

```bash
anchor test
```

## lottery flow

- users choose numbers, creates PDA numbers and vault pubkey as seed
- users calls `buy` adds in their PDA, receives ticket
- cranks call `draw`, draw selects 6 random numbers and sets these in vault manager config. `draw` locks `buy` until find is called
- cranks call `dispense`, pass in PDA derived from winning numbers generated by `draw`
- if winning numbers PDA passed to `dispense` is an already initialized account, send the prize to the owner
- if winning numbers PDA passed to `dispense` is not initialized, unlock buy, zero out winning numbers, no error

## invest flow

- crank calls `stake` periodically to exchange tokens `deposit` tokens in `deposit_vault` for `yield` tokens in `yield_vault` via an AMM
- user calls `redeem`, first look in `deposit_vault` to see if we have enough liquidity.
- if enough liquidity, transfer `deposit` tokens back to user`
- if not call `swap_tokens` to get enough liquidity and transfer `deposit` tokens back to user.
- if `dispense` finds winner, calculate prize amount and call `swap_tokens` to swap all `yield` tokens for `deposit` tokens, calculate prize and send to winner.
