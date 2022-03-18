use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::AccountsClose;
use anchor_spl::{
    associated_token,
    token::{self},
};
use mpl_token_metadata::instruction::{
    create_master_edition_v3, create_metadata_accounts_v2, verify_collection,
};
use mpl_token_metadata::state::{Collection, DataV2};
use spl_token_swap::instruction::{swap, Swap};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod no_loss_lottery {
    use super::*;
    pub fn initialize(
        ctx: Context<Initialize>,
        lottery_name: String,
        draw_duration: u64,
        ticket_price: u64,
    ) -> Result<()> {
        // ticket_price must be > 0
        if ticket_price <= 0 {
            return Err(error!(ErrorCode::InvalidTicketPrice));
        }

        // draw_duration must be > 0
        if draw_duration <= 0 {
            return Err(error!(ErrorCode::InvalidDrawDuration));
        }

        let collection_mint_to_accounts = token::MintTo {
            mint: ctx.accounts.collection_mint.clone().to_account_info(),
            to: ctx.accounts.collection_ata.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        // mint master edition collection token to user collection ata
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                collection_mint_to_accounts,
                &[&[
                    ctx.accounts.deposit_mint.clone().key().as_ref(),
                    ctx.accounts.yield_mint.clone().key().as_ref(),
                    ctx.accounts.deposit_vault.clone().key().as_ref(),
                    ctx.accounts.yield_vault.clone().key().as_ref(),
                    &[*ctx.bumps.get("vault_manager").unwrap()],
                ]],
            ),
            1,
        )?;

        // metadata params
        let collection_data = DataV2 {
            name: lottery_name.clone(),
            symbol: "LOTTO".to_string(),
            uri: "https://lottery-ticket1.s3.us-west-1.amazonaws.com/collection.json".to_string(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let create_collection_metadata_accounts = [
            ctx.accounts.collection_metadata.clone(),
            ctx.accounts.collection_mint.clone().to_account_info(),
            ctx.accounts.vault_manager.clone().to_account_info(),
            ctx.accounts.user.clone().to_account_info(),
            ctx.accounts.vault_manager.clone().to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ];

        // create metadata account
        let collection_metadata_ix = create_metadata_accounts_v2(
            ctx.accounts.metadata_program.clone().key(),
            ctx.accounts.collection_metadata.clone().key(),
            ctx.accounts.collection_mint.clone().to_account_info().key(),
            ctx.accounts.vault_manager.clone().key(),
            ctx.accounts.user.clone().key(),
            ctx.accounts.vault_manager.clone().key(),
            collection_data.name,
            collection_data.symbol,
            collection_data.uri,
            collection_data.creators,
            collection_data.seller_fee_basis_points,
            false,
            false,
            collection_data.collection,
            collection_data.uses,
        );

        invoke_signed(
            &collection_metadata_ix,
            &create_collection_metadata_accounts,
            &[&[
                ctx.accounts.deposit_mint.clone().key().as_ref(),
                ctx.accounts.yield_mint.clone().key().as_ref(),
                ctx.accounts.deposit_vault.clone().key().as_ref(),
                ctx.accounts.yield_vault.clone().key().as_ref(),
                &[*ctx.bumps.get("vault_manager").unwrap()],
            ]],
        )?;

        let create_collection_master_edition_accounts = [
            ctx.accounts.collection_master_edition.clone(),
            ctx.accounts.collection_metadata.clone(),
            ctx.accounts.collection_mint.clone().to_account_info(),
            ctx.accounts.vault_manager.clone().to_account_info(),
            ctx.accounts.user.clone().to_account_info(),
            ctx.accounts.vault_manager.clone().to_account_info(),
            ctx.accounts.rent.to_account_info(),
            ctx.accounts.token_program.clone().to_account_info(),
        ];

        // create master edition account
        // max_supply of 0 == unique
        let collection_master_edition_ix = create_master_edition_v3(
            ctx.accounts.metadata_program.clone().key(),
            ctx.accounts.collection_master_edition.clone().key(),
            ctx.accounts.collection_mint.clone().key(),
            ctx.accounts.vault_manager.clone().key(),
            ctx.accounts.vault_manager.clone().key(),
            ctx.accounts.collection_metadata.clone().key(),
            ctx.accounts.user.clone().key(),
            Some(0),
        );

        invoke_signed(
            &collection_master_edition_ix,
            &create_collection_master_edition_accounts,
            &[&[
                ctx.accounts.deposit_mint.clone().key().as_ref(),
                ctx.accounts.yield_mint.clone().key().as_ref(),
                ctx.accounts.deposit_vault.clone().key().as_ref(),
                ctx.accounts.yield_vault.clone().key().as_ref(),
                &[*ctx.bumps.get("vault_manager").unwrap()],
            ]],
        )?;

        // set vault manager config
        let vault_mgr = &mut ctx.accounts.vault_manager;
        vault_mgr.draw_duration = draw_duration;
        vault_mgr.cutoff_time = 0;
        vault_mgr.ticket_price = ticket_price;
        vault_mgr.deposit_mint = ctx.accounts.deposit_mint.clone().key();
        vault_mgr.deposit_vault = ctx.accounts.deposit_vault.clone().key();
        vault_mgr.yield_mint = ctx.accounts.yield_mint.clone().key();
        vault_mgr.yield_vault = ctx.accounts.yield_vault.clone().key();
        vault_mgr.deposit_token_reserve = 10 * ticket_price;
        vault_mgr.collection_mint = ctx.accounts.collection_mint.clone().key();
        vault_mgr.circulating_ticket_supply = 0;

        Ok(())
    }

    pub fn buy(ctx: Context<Buy>, numbers: [u8; 6]) -> Result<()> {
        ctx.accounts.vault_manager.circulating_ticket_supply += 1;

        // if cutoff_time is 0, drawing has never started
        if ctx.accounts.vault_manager.cutoff_time == 0 {
            // get current timestamp from Clock program
            let now = get_current_time();

            // set last draw time to now
            ctx.accounts.vault_manager.cutoff_time =
                now as u64 + ctx.accounts.vault_manager.draw_duration;
        };

        // do not allow user to pass in zeroed array of numbers
        if numbers == [0u8; 6] {
            return Err(error!(ErrorCode::InvalidNumbers));
        }

        // if buy is locked, call find
        if ctx.accounts.vault_manager.locked {
            return Err(error!(ErrorCode::CallDispense));
        }

        // create ticket PDA data
        let ticket_account = &mut ctx.accounts.ticket;
        ticket_account.deposit_mint = ctx.accounts.deposit_mint.key();
        ticket_account.yield_mint = ctx.accounts.yield_mint.key();
        ticket_account.ticket_mint = ctx.accounts.ticket_mint.key();
        ticket_account.numbers = numbers;

        // transfer tokens from user wallet to vault
        let transfer_accounts = token::Transfer {
            from: ctx.accounts.user_deposit_ata.to_account_info(),
            to: ctx.accounts.deposit_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
            ),
            ctx.accounts.vault_manager.ticket_price,
        )?;

        // mint NFT to user ATA, make sure its part of the collection
        let mint_to_accounts = token::MintTo {
            mint: ctx.accounts.ticket_mint.to_account_info(),
            to: ctx.accounts.user_ticket_ata.to_account_info(),
            authority: ctx.accounts.vault_manager.to_account_info(),
        };

        // mint master edition token to user nft ata
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                mint_to_accounts,
                &[&[
                    ctx.accounts.deposit_mint.key().as_ref(),
                    ctx.accounts.yield_mint.key().as_ref(),
                    ctx.accounts.deposit_vault.key().as_ref(),
                    ctx.accounts.yield_vault.key().as_ref(),
                    &[*ctx.bumps.get("vault_manager").unwrap()],
                ]],
            ),
            1,
        )?;

        // metadata params
        let data = DataV2 {
            name: "Lottery_Ticket".to_string(),
            symbol: "TICKET".to_string(),
            uri: "https://lottery-ticket1.s3.us-west-1.amazonaws.com/ticket.json".to_string(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: Some(Collection {
                verified: false,
                key: ctx.accounts.collection_mint.key(),
            }),
            uses: None,
        };

        let create_metadata_accounts = [
            ctx.accounts.ticket_metadata.clone().to_account_info(),
            ctx.accounts.ticket_mint.clone().to_account_info(),
            ctx.accounts.vault_manager.clone().to_account_info(),
            ctx.accounts.user.clone().to_account_info(),
            ctx.accounts.vault_manager.clone().to_account_info(),
            ctx.accounts.system_program.clone().to_account_info(),
            ctx.accounts.rent.clone().to_account_info(),
        ];

        // create metadata account
        let metadata_ix = create_metadata_accounts_v2(
            ctx.accounts.metadata_program.key(),
            ctx.accounts.ticket_metadata.key(),
            ctx.accounts.ticket_mint.to_account_info().key(),
            ctx.accounts.vault_manager.key(),
            ctx.accounts.user.key(),
            ctx.accounts.vault_manager.key(),
            data.name,
            data.symbol,
            data.uri,
            data.creators,
            data.seller_fee_basis_points,
            false,
            false,
            data.collection,
            data.uses,
        );

        invoke_signed(
            &metadata_ix,
            &create_metadata_accounts,
            &[&[
                ctx.accounts.deposit_mint.clone().key().as_ref(),
                ctx.accounts.yield_mint.clone().key().as_ref(),
                ctx.accounts.deposit_vault.clone().key().as_ref(),
                ctx.accounts.yield_vault.clone().key().as_ref(),
                &[*ctx.bumps.get("vault_manager").unwrap()],
            ]],
        )?;

        let create_master_edition_accounts = [
            ctx.accounts.ticket_master_edition.clone(),
            ctx.accounts.ticket_metadata.clone(),
            ctx.accounts.ticket_mint.clone().to_account_info(),
            ctx.accounts.vault_manager.clone().to_account_info(),
            ctx.accounts.user.clone().to_account_info(),
            ctx.accounts.vault_manager.clone().to_account_info(),
            ctx.accounts.rent.to_account_info(),
            ctx.accounts.token_program.clone().to_account_info(),
        ];

        // create master edition account
        let master_edition_ix = create_master_edition_v3(
            ctx.accounts.metadata_program.clone().key(),
            ctx.accounts.ticket_master_edition.clone().key(),
            ctx.accounts.ticket_mint.clone().key(),
            ctx.accounts.vault_manager.clone().key(),
            ctx.accounts.vault_manager.clone().key(),
            ctx.accounts.ticket_metadata.clone().key(),
            ctx.accounts.user.clone().key(),
            Some(0),
        );

        invoke_signed(
            &master_edition_ix,
            &create_master_edition_accounts,
            &[&[
                ctx.accounts.deposit_mint.clone().key().as_ref(),
                ctx.accounts.yield_mint.clone().key().as_ref(),
                ctx.accounts.deposit_vault.clone().key().as_ref(),
                ctx.accounts.yield_vault.clone().key().as_ref(),
                &[*ctx.bumps.get("vault_manager").unwrap()],
            ]],
        )?;
        Ok(())

        //// set collection
        //let collection_accounts = [
        //    ctx.accounts.ticket_metadata.clone(),
        //    ctx.accounts.vault_manager.clone().to_account_info(),
        //    ctx.accounts.user.clone().to_account_info(),
        //    ctx.accounts.collection_mint.clone().to_account_info(),
        //    ctx.accounts.collection_metadata.clone().to_account_info(),
        //    ctx.accounts.collection_master_edition.clone(),
        //];

        //let collection_ix = verify_collection(
        //    ctx.accounts.metadata_program.clone().key(),
        //    ctx.accounts.ticket_metadata.clone().key(),
        //    ctx.accounts.vault_manager.clone().key(),
        //    ctx.accounts.user.clone().key(),
        //    ctx.accounts.collection_mint.clone().key(),
        //    ctx.accounts.collection_metadata.clone().key(),
        //    ctx.accounts.collection_master_edition.clone().key(),
        //    None,
        //);

        //invoke_signed(
        //    &collection_ix,
        //    &collection_accounts,
        //    &[&[
        //        ctx.accounts.deposit_mint.clone().key().as_ref(),
        //        ctx.accounts.yield_mint.clone().key().as_ref(),
        //        ctx.accounts.deposit_vault.clone().key().as_ref(),
        //        ctx.accounts.yield_vault.clone().key().as_ref(),
        //        &[*ctx.bumps.get("vault_manager").unwrap()],
        //    ]],
        //)
        //.map_err(|e| e.into())
    }

    // redeem tickets for deposited tokens
    pub fn redeem(ctx: Context<Redeem>) -> Result<()> {
        // check that the ticket data account matches the user ticket ata
        if ctx.accounts.user_ticket_ata.mint != ctx.accounts.ticket.ticket_mint {
            return Err(ErrorCode::IncorrectTicketMint.into());
        }

        ctx.accounts.vault_manager.circulating_ticket_supply -= 1;

        // check if not enough tokens in deposit_vault for redemption, do a swap from yield to deposit vault
        let deposit_vault_amount = ctx.accounts.deposit_vault.amount;
        let ticket_price = ctx.accounts.vault_manager.ticket_price;
        if deposit_vault_amount < ticket_price {
            // double it to make sure we can get our minimum_amount_out
            // TODO: what to do if we dont have enough in yield_vault?
            let amount_in = ticket_price * 5;

            // swap tokens from yield_vault to deposit_vault
            // tell the vault manager to approve the user calling this function to swap
            let approve_accounts = token::Approve {
                to: ctx.accounts.yield_vault.clone().to_account_info(),
                delegate: ctx.accounts.user.clone().to_account_info(),
                authority: ctx.accounts.vault_manager.clone().to_account_info(),
            };

            token::approve(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.clone().to_account_info(),
                    approve_accounts,
                    &[&[
                        ctx.accounts.deposit_mint.clone().key().as_ref(),
                        ctx.accounts.yield_mint.clone().key().as_ref(),
                        ctx.accounts.deposit_vault.clone().key().as_ref(),
                        ctx.accounts.yield_vault.clone().key().as_ref(),
                        &[*ctx.bumps.get("vault_manager").unwrap()],
                    ]],
                ),
                amount_in,
            )?;

            // accounts array
            let accounts = [
                ctx.accounts.token_swap_program.clone(),
                ctx.accounts.token_program.clone().to_account_info(),
                ctx.accounts.amm.clone(),
                ctx.accounts.amm_authority.clone(),
                ctx.accounts.user.clone().to_account_info(),
                ctx.accounts.deposit_vault.clone().to_account_info(),
                ctx.accounts.swap_deposit_vault.clone().to_account_info(),
                ctx.accounts.swap_yield_vault.clone().to_account_info(),
                ctx.accounts.yield_vault.clone().to_account_info(),
                ctx.accounts.pool_mint.clone().to_account_info(),
                ctx.accounts.pool_fee.clone().to_account_info(),
            ];

            // set data for swap instruction
            let data = Swap {
                amount_in: amount_in,
                minimum_amount_out: ticket_price,
            };

            // create swap instruction
            let ix = swap(
                &ctx.accounts.token_swap_program.clone().key(),
                &ctx.accounts.token_program.clone().key(),
                &ctx.accounts.amm.clone().key(),
                &ctx.accounts.amm_authority.clone().key(),
                &ctx.accounts.user.clone().key(),
                &ctx.accounts.yield_vault.clone().key(),
                &ctx.accounts.swap_yield_vault.clone().key(),
                &ctx.accounts.swap_deposit_vault.clone().key(),
                &ctx.accounts.deposit_vault.clone().key(),
                &ctx.accounts.pool_mint.clone().key(),
                &ctx.accounts.pool_fee.clone().key(),
                None,
                data,
            )?;

            // swap tokens
            match anchor_lang::solana_program::program::invoke(&ix, &accounts) {
                Ok(()) => {}
                Err(e) => return Err(e.into()),
            };
        }

        let transfer_accounts = token::Transfer {
            from: ctx.accounts.deposit_vault.clone().to_account_info(),
            to: ctx.accounts.user_deposit_ata.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        // transfer tokens from vault to user wallet
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone().to_account_info(),
                transfer_accounts,
                &[&[
                    ctx.accounts.deposit_mint.clone().key().as_ref(),
                    ctx.accounts.yield_mint.clone().key().as_ref(),
                    ctx.accounts.deposit_vault.clone().key().as_ref(),
                    ctx.accounts.yield_vault.clone().key().as_ref(),
                    &[*ctx.bumps.get("vault_manager").unwrap()],
                ]],
            ),
            ticket_price,
        )?;

        // burn the ticket from the user ATA
        let burn_accounts = token::Burn {
            mint: ctx.accounts.ticket_mint.clone().to_account_info(),
            to: ctx.accounts.user_ticket_ata.clone().to_account_info(),
            authority: ctx.accounts.user.clone().to_account_info(),
        };

        // burn the ticket, we dont need to hold onto it
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.clone().to_account_info(),
                burn_accounts,
            ),
            1,
        )?;

        // close ticket PDA
        // return tokens to user
        ctx.accounts
            .ticket
            .close(ctx.accounts.user.clone().to_account_info())
    }

    pub fn draw(ctx: Context<Draw>) -> Result<()> {
        let cutoff_time = ctx.accounts.vault_manager.cutoff_time;

        // if no tickets have been purchased, do not draw
        if cutoff_time == 0 {
            return Err(ErrorCode::NoTicketsPurchased.into());
        }

        // if locked, dont call draw
        if ctx.accounts.vault_manager.locked {
            return Err(ErrorCode::CallDispense.into());
        }

        let now = get_current_time();

        // if time remaining then error
        if now < cutoff_time {
            return Err(ErrorCode::TimeRemaining.into());
        }

        // randomly choose 6 winning numbers
        let numbers: [u8; 6] = [1, 2, 3, 4, 5, 6];

        // set numbers in vault_manager account
        ctx.accounts.vault_manager.winning_numbers = numbers;

        // store numbers for frontend to query
        ctx.accounts.vault_manager.previous_winning_numbers = numbers;

        // locked `buy` function until `find` called
        ctx.accounts.vault_manager.locked = true;
        Ok(())
    }

    // check if a winning PDA exists
    // force passing in the winning numbers PDA
    // if PDA exists, send prize
    // if not error
    pub fn dispense(ctx: Context<Dispense>, numbers: [u8; 6]) -> Result<()> {
        // crank must pass in winning PDA
        if numbers != ctx.accounts.vault_manager.winning_numbers {
            return Err(ErrorCode::PassInWinningPDA.into());
        }

        let now = get_current_time();

        // set next cutoff time
        ctx.accounts.vault_manager.cutoff_time = now + ctx.accounts.vault_manager.draw_duration;

        // unlock buy tickets
        ctx.accounts.vault_manager.locked = false;

        // zero out winning numbers
        ctx.accounts.vault_manager.winning_numbers = [0u8; 6];

        // if numbers are zeroed out this means this account was initialized in this instruction
        // no winner found
        if ctx.accounts.ticket.numbers == [0u8; 6] {
            // we cannot error here because we need the variables to persist in the vault_manager account
            // close newly created account and return SOL to user
            // TODO: emit an event for this condition
            return ctx
                .accounts
                .ticket
                .close(ctx.accounts.user.to_account_info());
        }

        // winner_deposit_ata owner must be owner of the winning ticket ata
        if ctx.accounts.winner_deposit_ata.clone().owner
            != ctx.accounts.winner_ticket_ata.clone().owner
        {
            return Err(ErrorCode::WinnerTicketAndDepositAtasMismatch.into());
        }

        // winner ticket ata must match ticket pda mint
        // check after validating that `ticket` was previously initialized
        if ctx.accounts.winner_ticket_ata.mint != ctx.accounts.ticket.ticket_mint {
            return Err(ErrorCode::IncorrectTicketMint.into());
        }

        // swap all tokens from yield vault to deposit vault
        let amount_in = ctx.accounts.yield_vault.amount;
        let minimum_amount_out = amount_in / 2; // TODO: how to configure slippage?

        // if amount_in is 0 or less, return without error
        if amount_in <= 0 {
            return Ok(());
        }

        // tell the vault manager to approve the user calling this function to swap
        let approve_accounts = token::Approve {
            to: ctx.accounts.yield_vault.clone().to_account_info(),
            delegate: ctx.accounts.user.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        token::approve(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone().to_account_info(),
                approve_accounts,
                &[&[
                    ctx.accounts.deposit_mint.clone().key().as_ref(),
                    ctx.accounts.yield_mint.clone().key().as_ref(),
                    ctx.accounts.deposit_vault.clone().key().as_ref(),
                    ctx.accounts.yield_vault.clone().key().as_ref(),
                    &[*ctx.bumps.get("vault_manager").unwrap()],
                ]],
            ),
            amount_in,
        )?;

        // accounts array
        let accounts = [
            ctx.accounts.token_swap_program.clone(),
            ctx.accounts.token_program.clone().to_account_info(),
            ctx.accounts.amm.clone(),
            ctx.accounts.amm_authority.clone(),
            ctx.accounts.user.clone().to_account_info(),
            ctx.accounts.deposit_vault.clone().to_account_info(),
            ctx.accounts.swap_deposit_vault.clone().to_account_info(),
            ctx.accounts.swap_yield_vault.clone().to_account_info(),
            ctx.accounts.yield_vault.clone().to_account_info(),
            ctx.accounts.pool_mint.clone().to_account_info(),
            ctx.accounts.pool_fee.clone().to_account_info(),
        ];

        // set data for swap instruction
        let data = Swap {
            amount_in: amount_in,
            minimum_amount_out: minimum_amount_out,
        };

        // create swap instruction
        let ix = swap(
            &ctx.accounts.token_swap_program.clone().key(),
            &ctx.accounts.token_program.clone().key(),
            &ctx.accounts.amm.clone().key(),
            &ctx.accounts.amm_authority.clone().key(),
            &ctx.accounts.user.clone().key(),
            &ctx.accounts.yield_vault.clone().key(),
            &ctx.accounts.swap_yield_vault.clone().key(),
            &ctx.accounts.swap_deposit_vault.clone().key(),
            &ctx.accounts.deposit_vault.clone().key(),
            &ctx.accounts.pool_mint.clone().key(),
            &ctx.accounts.pool_fee.clone().key(),
            None,
            data,
        )?;

        // swap tokens
        match anchor_lang::solana_program::program::invoke(&ix, &accounts) {
            Ok(()) => {
                // reload account to update deposit_vault amount
                ctx.accounts.deposit_vault.reload()?;
            }
            Err(e) => return Err(e.into()),
        };

        // calculate winner prize
        // TODO: add our fee
        let prize_amount = calculate_prize(
            ctx.accounts.vault_manager.circulating_ticket_supply,
            ctx.accounts.vault_manager.ticket_price,
            ctx.accounts.deposit_vault.amount,
        );

        // transfer prize amount to winner
        let transfer_accounts = token::Transfer {
            from: ctx.accounts.deposit_vault.clone().to_account_info(),
            to: ctx.accounts.winner_deposit_ata.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        // transfer prize to winner
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone().to_account_info(),
                transfer_accounts,
                &[&[
                    ctx.accounts.deposit_mint.clone().key().as_ref(),
                    ctx.accounts.yield_mint.clone().key().as_ref(),
                    ctx.accounts.deposit_vault.clone().key().as_ref(),
                    ctx.accounts.yield_vault.clone().key().as_ref(),
                    &[*ctx.bumps.get("vault_manager").unwrap()],
                ]],
            ),
            prize_amount,
        )
    }

    // convert deposit_mint tokens into yield_mint tokens
    // call with a crank
    pub fn stake(ctx: Context<Stake>) -> Result<()> {
        let mut amount_in = ctx.accounts.deposit_vault.amount;

        // if less than n tokens, do not stake
        // wait for more tickets to be purchased
        if amount_in < ctx.accounts.vault_manager.deposit_token_reserve {
            return Err(error!(ErrorCode::NotEnoughTokens));
        };

        // subtract reserve from amount to stake
        amount_in = amount_in - ctx.accounts.vault_manager.deposit_token_reserve;

        // tell the vault manager to approve the user calling this function to swap
        let approve_accounts = token::Approve {
            to: ctx.accounts.deposit_vault.clone().to_account_info(),
            delegate: ctx.accounts.user.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        token::approve(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone().to_account_info(),
                approve_accounts,
                &[&[
                    ctx.accounts.deposit_mint.clone().key().as_ref(),
                    ctx.accounts.yield_mint.clone().key().as_ref(),
                    ctx.accounts.deposit_vault.clone().key().as_ref(),
                    ctx.accounts.yield_vault.clone().key().as_ref(),
                    &[*ctx.bumps.get("vault_manager").unwrap()],
                ]],
            ),
            amount_in,
        )?;

        // accounts array
        let accounts = [
            ctx.accounts.token_swap_program.clone(),
            ctx.accounts.token_program.clone().to_account_info(),
            ctx.accounts.amm.clone(),
            ctx.accounts.amm_authority.clone(),
            ctx.accounts.user.clone().to_account_info(),
            ctx.accounts.deposit_vault.clone().to_account_info(),
            ctx.accounts.swap_deposit_vault.clone().to_account_info(),
            ctx.accounts.swap_yield_vault.clone().to_account_info(),
            ctx.accounts.yield_vault.clone().to_account_info(),
            ctx.accounts.pool_mint.clone().to_account_info(),
            ctx.accounts.pool_fee.clone().to_account_info(),
        ];

        // set data for swap instruction
        // TODO: figure out best way to determine minimum_amount_out with least amount of slippage
        // for now set to 50%
        let data = Swap {
            amount_in: amount_in,
            minimum_amount_out: amount_in / 2,
        };

        // create swap instruction
        let ix = swap(
            &ctx.accounts.token_swap_program.clone().key(),
            &ctx.accounts.token_program.clone().key(),
            &ctx.accounts.amm.clone().key(),
            &ctx.accounts.amm_authority.clone().key(),
            &ctx.accounts.user.clone().key(),
            &ctx.accounts.deposit_vault.clone().key(),
            &ctx.accounts.swap_deposit_vault.clone().key(),
            &ctx.accounts.swap_yield_vault.clone().key(),
            &ctx.accounts.yield_vault.clone().key(),
            &ctx.accounts.pool_mint.clone().key(),
            &ctx.accounts.pool_fee.clone().key(),
            None,
            data,
        )?;

        // swap tokens
        anchor_lang::solana_program::program::invoke(&ix, &accounts).map_err(|e| e.into())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deposit_mint: Box<Account<'info, token::Mint>>,

    #[account(mut)]
    pub yield_mint: Box<Account<'info, token::Mint>>,

    #[account(init,
        payer = user,
        token::mint = deposit_mint,
        token::authority = vault_manager,
        seeds = [deposit_mint.key().as_ref()], bump)]
    pub deposit_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(init,
        payer = user,
        token::mint = yield_mint,
        token::authority = vault_manager,
        seeds = [yield_mint.key().as_ref()], bump)]
    pub yield_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(init,
        payer = user,
        seeds = [deposit_mint.key().as_ref(), yield_mint.key().as_ref(), deposit_vault.key().as_ref(), yield_vault.key().as_ref()],
        bump)]
    pub vault_manager: Account<'info, VaultManager>,

    #[account(init,
        payer = user,
        seeds = [deposit_mint.key().as_ref(), yield_mint.key().as_ref(), deposit_vault.key().as_ref(), yield_vault.key().as_ref(), vault_manager.key().as_ref()],
        bump,
        mint::decimals = 0,
        mint::authority = vault_manager)]
    pub collection_mint: Box<Account<'info, token::Mint>>,

    /// CHECK: todo
    #[account(mut)]
    pub collection_metadata: AccountInfo<'info>,

    /// CHECK: todo
    #[account(mut)]
    pub collection_master_edition: AccountInfo<'info>,

    #[account(init,
        payer = user,
        token::mint = collection_mint,
        token::authority = vault_manager,
        seeds = [collection_mint.key().as_ref()], bump)]
    pub collection_ata: Account<'info, token::TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub metadata_program: Program<'info, TokenMetadata>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(numbers: [u8; 6])]
pub struct Buy<'info> {
    #[account(mut)]
    pub deposit_mint: Box<Account<'info, token::Mint>>,

    #[account(mut)]
    pub yield_mint: Box<Account<'info, token::Mint>>,

    #[account(mut, seeds = [deposit_mint.key().as_ref()], bump)]
    pub deposit_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut, seeds = [yield_mint.key().as_ref()], bump)]
    pub yield_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut,
        has_one = deposit_vault,
        has_one = deposit_mint,
        has_one = yield_vault,
        has_one = yield_mint,
        has_one = collection_mint,
        seeds = [deposit_mint.key().as_ref(), yield_mint.key().as_ref(), deposit_vault.key().as_ref(), yield_vault.key().as_ref()],
        bump)]
    pub vault_manager: Box<Account<'info, VaultManager>>,

    #[account(mut)]
    pub collection_mint: Account<'info, token::Mint>,

    /// CHECK: todo
    #[account(mut)]
    pub collection_metadata: AccountInfo<'info>,

    /// CHECK: todo
    #[account(mut)]
    pub collection_master_edition: AccountInfo<'info>,

    #[account(mut)]
    pub ticket_mint: Box<Account<'info, token::Mint>>,

    /// CHECK: todo
    #[account(mut)]
    pub ticket_metadata: AccountInfo<'info>,

    /// CHECK: todo
    #[account(mut)]
    pub ticket_master_edition: AccountInfo<'info>,

    #[account(init,
        payer = user,
        seeds = [&numbers, vault_manager.key().as_ref()],
        bump,
    )]
    pub ticket: Box<Account<'info, Ticket>>,

    #[account(init,
        payer = user,
        associated_token::mint = ticket_mint,
        associated_token::authority = user)]
    pub user_ticket_ata: Box<Account<'info, token::TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_deposit_ata: Account<'info, token::TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub metadata_program: Program<'info, TokenMetadata>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub deposit_mint: Box<Account<'info, token::Mint>>,

    #[account(mut)]
    pub yield_mint: Box<Account<'info, token::Mint>>,

    #[account(mut, seeds = [deposit_mint.key().as_ref()], bump)]
    pub deposit_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut, seeds = [yield_mint.key().as_ref()], bump)]
    pub yield_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut,
        has_one = deposit_vault,
        has_one = deposit_mint,
        has_one = yield_vault,
        has_one = yield_mint,
        has_one = collection_mint,
        seeds = [deposit_mint.key().as_ref(), yield_mint.key().as_ref(), deposit_vault.key().as_ref(), yield_vault.key().as_ref()],
        bump)]
    pub vault_manager: Box<Account<'info, VaultManager>>,

    #[account(mut)]
    pub collection_mint: Box<Account<'info, token::Mint>>,

    #[account(mut)]
    pub ticket_mint: Account<'info, token::Mint>,

    #[account(mut)]
    pub ticket: Box<Account<'info, Ticket>>,

    #[account(mut,
        associated_token::mint = ticket_mint,
        associated_token::authority = user)]
    pub user_ticket_ata: Box<Account<'info, token::TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    // swap program token accounts
    #[account(mut)]
    pub swap_yield_vault: Box<Account<'info, token::TokenAccount>>,
    #[account(mut)]
    pub swap_deposit_vault: Box<Account<'info, token::TokenAccount>>,

    // LP mint
    #[account(mut)]
    pub pool_mint: Account<'info, token::Mint>,

    /// CHECK: TODO
    #[account()]
    pub amm: AccountInfo<'info>,

    /// CHECK: TODO
    #[account(mut)]
    pub amm_authority: AccountInfo<'info>,

    // fees go here
    #[account(mut)]
    pub pool_fee: Account<'info, token::TokenAccount>,

    #[account(mut)]
    pub user_deposit_ata: Account<'info, token::TokenAccount>,

    /// CHECK: TODO
    pub token_swap_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Draw<'info> {
    #[account(mut)]
    pub deposit_mint: Box<Account<'info, token::Mint>>,

    #[account(mut)]
    pub yield_mint: Box<Account<'info, token::Mint>>,

    #[account(mut, seeds = [deposit_mint.key().as_ref()], bump)]
    pub deposit_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut, seeds = [yield_mint.key().as_ref()], bump)]
    pub yield_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut,
        has_one = deposit_vault,
        has_one = deposit_mint,
        has_one = yield_vault,
        has_one = yield_mint,
        seeds = [deposit_mint.key().as_ref(), yield_mint.key().as_ref(), deposit_vault.key().as_ref(), yield_vault.key().as_ref()],
        bump)]
    pub vault_manager: Box<Account<'info, VaultManager>>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(numbers: [u8; 6])]
pub struct Dispense<'info> {
    #[account(mut)]
    pub deposit_mint: Box<Account<'info, token::Mint>>,

    #[account(mut)]
    pub yield_mint: Box<Account<'info, token::Mint>>,

    #[account(mut, seeds = [deposit_mint.key().as_ref()], bump)]
    pub deposit_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut, seeds = [yield_mint.key().as_ref()], bump)]
    pub yield_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut,
        has_one = deposit_vault,
        has_one = deposit_mint,
        has_one = yield_vault,
        has_one = yield_mint,
        has_one = collection_mint,
        seeds = [deposit_mint.key().as_ref(), yield_mint.key().as_ref(), deposit_vault.key().as_ref(), yield_vault.key().as_ref()],
        bump)]
    pub vault_manager: Box<Account<'info, VaultManager>>,

    #[account(mut)]
    pub collection_mint: Box<Account<'info, token::Mint>>,

    #[account(init_if_needed,
        payer = user,
        seeds = [&numbers, vault_manager.key().as_ref()], bump)]
    pub ticket: Box<Account<'info, Ticket>>,

    #[account(mut)]
    pub winner_ticket_ata: Box<Account<'info, token::TokenAccount>>,

    #[account(mut)]
    pub winner_deposit_ata: Account<'info, token::TokenAccount>,

    // swap program token accounts
    #[account(mut)]
    pub swap_yield_vault: Box<Account<'info, token::TokenAccount>>,
    #[account(mut)]
    pub swap_deposit_vault: Box<Account<'info, token::TokenAccount>>,

    // LP mint
    #[account(mut)]
    pub pool_mint: Account<'info, token::Mint>,

    /// CHECK: TODO
    #[account()]
    pub amm: AccountInfo<'info>,

    /// CHECK: TODO
    #[account(mut)]
    pub amm_authority: AccountInfo<'info>,

    // fees go here
    #[account(mut)]
    pub pool_fee: Account<'info, token::TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: TODO
    pub token_swap_program: AccountInfo<'info>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    // swap mints
    #[account()]
    pub yield_mint: Account<'info, token::Mint>,
    #[account()]
    pub deposit_mint: Account<'info, token::Mint>,

    #[account(mut, seeds = [deposit_mint.key().as_ref()], bump)]
    pub deposit_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut, seeds = [yield_mint.key().as_ref()], bump)]
    pub yield_vault: Box<Account<'info, token::TokenAccount>>,

    #[account(mut,
        has_one = deposit_vault,
        has_one = deposit_mint,
        has_one = yield_vault,
        has_one = yield_mint,
        seeds = [deposit_mint.key().as_ref(), yield_mint.key().as_ref(), deposit_vault.key().as_ref(), yield_vault.key().as_ref()],
        bump)]
    pub vault_manager: Box<Account<'info, VaultManager>>,

    // swap program token accounts
    #[account(mut)]
    pub swap_yield_vault: Box<Account<'info, token::TokenAccount>>,
    #[account(mut)]
    pub swap_deposit_vault: Box<Account<'info, token::TokenAccount>>,

    // LP mint
    #[account(mut)]
    pub pool_mint: Account<'info, token::Mint>,

    /// CHECK: TODO
    #[account()]
    pub amm: AccountInfo<'info>,

    /// CHECK: TODO
    #[account(mut)]
    pub amm_authority: AccountInfo<'info>,

    // fees go here
    #[account(mut)]
    pub pool_fee: Account<'info, token::TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: TODO
    pub token_swap_program: AccountInfo<'info>,
    pub token_program: Program<'info, token::Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(Default)]
pub struct VaultManager {
    pub lottery_name: String,
    pub deposit_mint: Pubkey,
    pub deposit_vault: Pubkey,
    pub yield_mint: Pubkey,
    pub yield_vault: Pubkey,
    pub collection_mint: Pubkey,
    pub circulating_ticket_supply: u64,
    pub cutoff_time: u64,   // in seconds, cutoff time for next draw
    pub draw_duration: u64, // in seconds, duration until next draw time
    pub ticket_price: u64,
    pub winning_numbers: [u8; 6],
    pub previous_winning_numbers: [u8; 6],
    pub locked: bool, // when draw is called, lock the program until dispense is called
    pub deposit_token_reserve: u64, // amount of tokens to keep in deposit_vault at all times
}

#[account]
#[derive(Default)]
pub struct Ticket {
    pub deposit_mint: Pubkey,
    pub yield_mint: Pubkey,
    pub ticket_mint: Pubkey,
    pub numbers: [u8; 6],
}

#[error_code]
pub enum ErrorCode {
    #[msg("TimeRemaining")]
    TimeRemaining,

    #[msg("Must call Dispense")]
    CallDispense,

    #[msg("Invalid Numbers")]
    InvalidNumbers,

    #[msg("No Tickets Purchased")]
    NoTicketsPurchased,

    #[msg("Must Pass in Winning PDA to Dispense")]
    PassInWinningPDA,

    #[msg("Not enough tokens for swap")]
    NotEnoughTokens,

    #[msg("Invalid ticket price")]
    InvalidTicketPrice,

    #[msg("Invalid draw duration")]
    InvalidDrawDuration,

    #[msg("Ticket PDA does not match ticket ata mint")]
    IncorrectTicketMint,

    #[msg("Winning Deposit ATA and Winning Ticket ATA owners do not match")]
    WinnerTicketAndDepositAtasMismatch,
}

fn get_current_time() -> u64 {
    return Clock::get().unwrap().unix_timestamp as u64;
}

// calculate prize to send to winner
// this function is expected to be called after swapping all yield tokens back to deposit tokens
fn calculate_prize(tickets_supply: u64, ticket_price: u64, deposit_vault_amount: u64) -> u64 {
    // deposit_vault amount - (tickets_supply * ticket_price) = prize amount
    let deposit_amount = tickets_supply * ticket_price;
    let mut prize_amount = deposit_vault_amount - deposit_amount;

    // not enough gains for a prize
    // set amount to 0, so we can unlock the vault and continue the lottery
    if prize_amount <= 0 {
        prize_amount = 0;
    }

    return prize_amount;
}

#[derive(Clone)]
pub struct TokenMetadata;

impl anchor_lang::Id for TokenMetadata {
    fn id() -> Pubkey {
        mpl_token_metadata::ID
    }
}
