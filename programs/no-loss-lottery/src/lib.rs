use anchor_lang::prelude::*;
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
        draw_time: i64,
        ticket_price: u64,
    ) -> ProgramResult {
        // set vault manager config
        let vault_mgr = &mut ctx.accounts.vault_manager;
        vault_mgr.draw_time = draw_time;
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
        // create ticket PDA data
        let ticket_account = &mut ctx.accounts.ticket;
        ticket_account.mint = ctx.accounts.mint.clone().key();
        ticket_account.vault = ctx.accounts.vault.clone().key();
        ticket_account.tickets = ctx.accounts.tickets.clone().key();
        ticket_account.owner = ctx.accounts.user.key();
        ticket_account.numbers = numbers;

        // transfer tokens from user wallet to vault
        let transfer_accounts = token::Transfer {
            from: ctx.accounts.user_ata.clone().to_account_info(),
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

    pub fn withdraw(
        ctx: Context<Withdraw>,
        _vault_bump: u8,
        vault_mgr_bump: u8,
        _tickets_bump: u8,
        _prize_bump: u8,
        amount: u64,
    ) -> ProgramResult {
        // if lottery is still running, do not allow withdrawals
        if !ctx.accounts.vault_manager.lottery_ended {
            return Err(ErrorCode::LotteryInProgress.into());
        };

        // if winner withdraws, give them the prize!
        if ctx.accounts.vault_manager.winner == ctx.accounts.user.key() {
            let prize_transfer_accounts = token::Transfer {
                from: ctx.accounts.prize.clone().to_account_info(),
                to: ctx.accounts.user_ata.clone().to_account_info(),
                authority: ctx.accounts.vault_manager.clone().to_account_info(),
            };

            // transfer prize from vault to winner
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.clone().to_account_info(),
                    prize_transfer_accounts,
                    &[&[
                        ctx.accounts.mint.key().as_ref(),
                        ctx.accounts.vault.key().as_ref(),
                        &[vault_mgr_bump],
                    ]],
                ),
                amount,
            )?;
        };

        let transfer_accounts = token::Transfer {
            from: ctx.accounts.vault.clone().to_account_info(),
            to: ctx.accounts.user_ata.clone().to_account_info(),
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
            amount,
        )
    }

    pub fn draw(
        ctx: Context<Draw>,
        _vault_bump: u8,
        _vault_mgr_bump: u8,
        _tickets_bump: u8,
    ) -> ProgramResult {
        // get current timestamp from Clock program
        let now = Clock::get()?.unix_timestamp;

        // if time remaining then error
        if now < ctx.accounts.vault_manager.draw_time {
            return Err(ErrorCode::TimeRemaining.into());
        }

        // randomly choose 6 winning numbers
        let numbers: [u8; 6] = [1, 2, 3, 4, 5, 6];

        // set numbers in vault_manager account
        ctx.accounts.vault_manager.winning_numbers = numbers;
        Ok(())
    }

    pub fn find(
        ctx: Context<Find>,
        _vault_bump: u8,
        _vault_mgr_bump: u8,
        _tickets_bump: u8,
    ) -> ProgramResult {
        // check if winning PDA exists
        let winning_numbers = ctx.accounts.vault_manager.winning_numbers;

        // get ticket numbers from PDA passed in
        let ticket_numbers = ctx.accounts.ticket.numbers;

        // check if the numbers match the winning numbers
        for (i, n) in winning_numbers.iter().enumerate() {
            if n != &ticket_numbers[i] {
                // reset winning_numbers
                // reset draw time
                return Err(ErrorCode::NoWinner.into());
            }
        }

        // if winner found, end lottery
        ctx.accounts.vault_manager.lottery_ended = true;

        // set winner as ticket owner
        ctx.accounts.vault_manager.winner = ctx.accounts.ticket.owner;

        Ok(())
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
        seeds = [&numbers],
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
    pub user_ata: Account<'info, token::TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(vault_bump: u8, vault_mgr_bump: u8, tickets_bump: u8, prize_bump: u8)]
pub struct Withdraw<'info> {
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

    #[account(mut, has_one = mint)]
    pub prize: Box<Account<'info, token::TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, has_one = mint)]
    pub user_ata: Account<'info, token::TokenAccount>,

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
#[instruction(vault_bump: u8, vault_mgr_bump: u8, tickets_bump: u8)]
pub struct Find<'info> {
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

    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
#[derive(Default)]
pub struct VaultManager {
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub tickets: Pubkey,
    pub vault_tickets_ata: Pubkey,
    pub draw_time: i64, // in ms, lottery end time
    pub ticket_price: u64,
    pub winning_numbers: [u8; 6],
    pub lottery_ended: bool,
    pub winner: Pubkey,
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

#[account]
#[derive(Default)]
pub struct LotteryResult {
    pub winner_exists: bool,
    pub winner: Pubkey,
}

#[error]
pub enum ErrorCode {
    #[msg("TimeRemaining")]
    TimeRemaining,

    #[msg("NoWinner")]
    NoWinner,

    #[msg("Lottery In Progress")]
    LotteryInProgress,
}
