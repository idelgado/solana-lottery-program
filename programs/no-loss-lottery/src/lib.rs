use anchor_lang::prelude::*;
use anchor_lang::AccountsClose;
use anchor_spl::{
    associated_token,
    token::{self},
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod no_loss_lottery {
    use super::*;
    pub fn initialize(
        ctx: Context<Initialize>,
        _vault_bump: u8,
        _vault_mgr_bump: u8,
        _tickets_bump: u8,
        _prize_bump: u8,
        draw_duration: u64,
        ticket_price: u64,
    ) -> ProgramResult {
        // set vault manager config
        let vault_mgr = &mut ctx.accounts.vault_manager;
        vault_mgr.draw_duration = draw_duration;
        vault_mgr.cutoff_time = 0;
        vault_mgr.ticket_price = ticket_price;
        vault_mgr.mint = ctx.accounts.mint.clone().key();
        vault_mgr.vault = ctx.accounts.vault.clone().key();
        vault_mgr.tickets = ctx.accounts.tickets.clone().key();

        Ok(())
    }

    pub fn buy(
        ctx: Context<Buy>,
        _vault_bump: u8,
        vault_mgr_bump: u8,
        _tickets_bump: u8,
        _ticket_bump: u8,
        numbers: [u8; 6],
    ) -> ProgramResult {
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
            return Err(ErrorCode::InvalidNumbers.into());
        }

        // if buy is locked, call find
        if ctx.accounts.vault_manager.locked {
            return Err(ErrorCode::CallDispense.into());
        }

        // create ticket PDA data
        let ticket_account = &mut ctx.accounts.ticket;
        ticket_account.mint = ctx.accounts.mint.clone().key();
        ticket_account.vault = ctx.accounts.vault.clone().key();
        ticket_account.tickets = ctx.accounts.tickets.clone().key();
        ticket_account.owner = ctx.accounts.user.key();
        ticket_account.numbers = numbers;

        // transfer tokens from user wallet to vault
        let transfer_accounts = token::Transfer {
            from: ctx.accounts.user_deposit_ata.clone().to_account_info(),
            to: ctx.accounts.vault.clone().to_account_info(),
            authority: ctx.accounts.user.clone().to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.clone().to_account_info(),
                transfer_accounts,
            ),
            ctx.accounts.vault_manager.clone().ticket_price,
        )?;

        // mint tickets to vault
        let mint_to_accounts = token::MintTo {
            mint: ctx.accounts.tickets.clone().to_account_info(),
            to: ctx.accounts.user_tickets_ata.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        // mint initial ticket supply to the vault tickets ata
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone().to_account_info(),
                mint_to_accounts,
                &[&[
                    ctx.accounts.mint.clone().key().as_ref(),
                    ctx.accounts.vault.clone().key().as_ref(),
                    &[vault_mgr_bump],
                ]],
            ),
            1,
        )
    }

    // redeem tickets for deposited tokens
    pub fn redeem(
        ctx: Context<Redeem>,
        _vault_bump: u8,
        vault_mgr_bump: u8,
        _tickets_bump: u8,
        _ticket_bump: u8,
        _prize_bump: u8,
    ) -> ProgramResult {
        // burn a ticket from the user ATA
        let burn_accounts = token::Burn {
            mint: ctx.accounts.tickets.clone().to_account_info(),
            to: ctx.accounts.user_tickets_ata.clone().to_account_info(),
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
        // return SOL to user
        ctx.accounts
            .ticket
            .close(ctx.accounts.user.clone().to_account_info())?;

        let transfer_accounts = token::Transfer {
            from: ctx.accounts.vault.clone().to_account_info(),
            to: ctx.accounts.user_deposit_ata.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        // transfer tokens from vault to user wallet
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone().to_account_info(),
                transfer_accounts,
                &[&[
                    ctx.accounts.mint.key().as_ref(),
                    ctx.accounts.vault.key().as_ref(),
                    &[vault_mgr_bump],
                ]],
            ),
            ctx.accounts.vault_manager.ticket_price,
        )
    }

    pub fn draw(
        ctx: Context<Draw>,
        _vault_bump: u8,
        _vault_mgr_bump: u8,
        _tickets_bump: u8,
    ) -> ProgramResult {
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

        // locked `buy` function until `find` called
        ctx.accounts.vault_manager.locked = true;
        Ok(())
    }

    // check if a winning PDA exists
    // force passing in the winning numbers PDA
    // if PDA exists, send prize
    // if not error
    pub fn dispense(
        ctx: Context<Dispense>,
        _vault_bump: u8,
        vault_mgr_bump: u8,
        _tickets_bump: u8,
        numbers: [u8; 6],
        _ticket_bump: u8,
    ) -> ProgramResult {
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

        // if numbers are zeroed out this means this account was initialized in this transaction
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

        let transfer_accounts = token::Transfer {
            from: ctx.accounts.prize.clone().to_account_info(),
            to: ctx.accounts.user_deposit_ata.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        // transfer prize to winner
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone().to_account_info(),
                transfer_accounts,
                &[&[
                    ctx.accounts.mint.key().as_ref(),
                    ctx.accounts.vault.key().as_ref(),
                    &[vault_mgr_bump],
                ]],
            ),
            ctx.accounts.prize.amount,
        )
    }
}

#[derive(Accounts)]
#[instruction(vault_bump: u8, vault_mgr_bump: u8, tickets_bump: u8, prize_bump: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub mint: Account<'info, token::Mint>,

    #[account(init,
        payer = user,
        token::mint = mint,
        token::authority = vault_manager,
        seeds = [mint.key().as_ref()],
        bump = vault_bump, has_one = mint)]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(init,
        payer = user,
        seeds = [mint.key().as_ref(), vault.key().as_ref()],
        bump = vault_mgr_bump)]
    pub vault_manager: Account<'info, VaultManager>,

    #[account(init,
        payer = user,
        seeds = [mint.key().as_ref(), vault.key().as_ref(), vault_manager.key().as_ref()],
        bump = tickets_bump,
        mint::authority = vault_manager,
        mint::decimals = 0,
    )]
    pub tickets: Account<'info, token::Mint>,

    #[account(init,
        payer = user,
        seeds = [mint.key().as_ref(), vault.key().as_ref(), vault_manager.key().as_ref(), tickets.key().as_ref()],
        bump = prize_bump,
        token::mint = mint,
        token::authority = vault_manager
    )]
    pub prize: Box<Account<'info, token::TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(vault_bump: u8, vault_mgr_bump: u8, vault_tickets_bump: u8, ticket_bump: u8, numbers: [u8; 6])]
pub struct Buy<'info> {
    #[account(mut)]
    pub mint: Account<'info, token::Mint>,

    #[account(mut,
        seeds = [mint.key().as_ref()],
        bump = vault_bump, has_one = mint)]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(mut,
        has_one = vault,
        has_one = mint,
        has_one = tickets,
        seeds = [mint.key().as_ref(), vault.key().as_ref()],
        bump = vault_mgr_bump)]
    pub vault_manager: Box<Account<'info, VaultManager>>,

    #[account(mut)]
    pub tickets: Account<'info, token::Mint>,

    #[account(init,
        payer = user,
        seeds = [&numbers, vault_manager.key().as_ref()],
        bump = ticket_bump,
    )]
    pub ticket: Box<Account<'info, Ticket>>,

    #[account(init_if_needed,
        payer = user,
        associated_token::mint = tickets,
        associated_token::authority = user)]
    pub user_tickets_ata: Box<Account<'info, token::TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, has_one = mint)]
    pub user_deposit_ata: Account<'info, token::TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(vault_bump: u8, vault_mgr_bump: u8, tickets_bump: u8, ticket_bump: u8, prize_bump: u8)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub mint: Account<'info, token::Mint>,

    #[account(mut,
        seeds = [mint.key().as_ref()],
        bump = vault_bump, has_one = mint)]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(mut,
        has_one = vault,
        has_one = mint,
        has_one = tickets,
        seeds = [mint.key().as_ref(), vault.key().as_ref()],
        bump = vault_mgr_bump)]
    pub vault_manager: Account<'info, VaultManager>,

    #[account(mut)]
    pub tickets: Account<'info, token::Mint>,

    #[account(mut)]
    pub ticket: Box<Account<'info, Ticket>>,

    #[account(mut, has_one = mint)]
    pub prize: Box<Account<'info, token::TokenAccount>>,

    #[account(mut,
        associated_token::mint = tickets,
        associated_token::authority = user)]
    pub user_tickets_ata: Box<Account<'info, token::TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, has_one = mint)]
    pub user_deposit_ata: Account<'info, token::TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(vault_bump: u8, vault_mgr_bump: u8, tickets_bump: u8)]
pub struct Draw<'info> {
    #[account(mut)]
    pub mint: Account<'info, token::Mint>,

    #[account(mut,
        seeds = [mint.key().as_ref()],
        bump = vault_bump, has_one = mint)]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(mut,
        has_one = vault,
        has_one = mint,
        has_one = tickets,
        seeds = [mint.key().as_ref(), vault.key().as_ref()],
        bump = vault_mgr_bump)]
    pub vault_manager: Account<'info, VaultManager>,

    #[account(mut)]
    pub tickets: Account<'info, token::Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(vault_bump: u8, vault_mgr_bump: u8, tickets_bump: u8, numbers: [u8; 6], ticket_bump: u8)]
pub struct Dispense<'info> {
    #[account(mut)]
    pub mint: Account<'info, token::Mint>,

    #[account(mut,
        seeds = [mint.key().as_ref()],
        bump = vault_bump, has_one = mint)]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(mut,
        has_one = vault,
        has_one = mint,
        has_one = tickets,
        seeds = [mint.key().as_ref(), vault.key().as_ref()],
        bump = vault_mgr_bump)]
    pub vault_manager: Account<'info, VaultManager>,

    #[account(mut)]
    pub tickets: Account<'info, token::Mint>,

    #[account(init_if_needed, payer = user, seeds = [&numbers, vault_manager.key().as_ref()], bump = ticket_bump)]
    pub ticket: Box<Account<'info, Ticket>>,

    #[account(mut, has_one = mint)]
    pub prize: Box<Account<'info, token::TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, has_one = mint)]
    pub user_deposit_ata: Account<'info, token::TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
}

#[account]
#[derive(Default)]
pub struct VaultManager {
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub tickets: Pubkey,
    pub cutoff_time: u64,   // in seconds, cutoff time for next draw
    pub draw_duration: u64, // in seconds, duration until next draw time
    pub ticket_price: u64,
    pub winning_numbers: [u8; 6],
    pub locked: bool, // when draw is called, lock the program until Dispense is called
}

#[account]
#[derive(Default)]
pub struct Ticket {
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub tickets: Pubkey,
    pub owner: Pubkey,
    pub numbers: [u8; 6],
}

#[error]
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
}

fn get_current_time() -> u64 {
    return Clock::get().unwrap().unix_timestamp as u64;
}
