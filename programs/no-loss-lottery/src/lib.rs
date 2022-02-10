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
        vault_mgr_bump: u8,
        _tickets_bump: u8,
        _tickets_ata_bump: u8,
        draw: i64,
        ticket_price: u64,
    ) -> ProgramResult {
        // set vault manager config
        let vault_mgr = &mut ctx.accounts.vault_manager;
        vault_mgr.draw = draw;
        vault_mgr.ticket_price = ticket_price;
        vault_mgr.mint = ctx.accounts.mint.clone().key();
        vault_mgr.vault = ctx.accounts.vault.clone().key();
        vault_mgr.tickets = ctx.accounts.tickets.clone().key();
        vault_mgr.vault_tickets_ata = ctx.accounts.vault_tickets_ata.clone().key();

        // mint tickets to vault
        let mint_to_accounts = token::MintTo {
            mint: ctx.accounts.tickets.clone().to_account_info(),
            to: ctx.accounts.vault_tickets_ata.clone().to_account_info(),
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
            100_000_000,
        )
    }

    pub fn buy(
        ctx: Context<Buy>,
        _vault_bump: u8,
        vault_mgr_bump: u8,
        _tickets_bump: u8,
        _vault_tickets_ata_bump: u8,
        amount: u64,
    ) -> ProgramResult {
        // calculate price based on number of tickets requested
        let price = amount * ctx.accounts.vault_manager.ticket_price;

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
            price,
        )?;

        // transfer tickets from vault to user
        let transfer_ticket_accounts = token::Transfer {
            from: ctx.accounts.vault_tickets_ata.clone().to_account_info(),
            to: ctx.accounts.user_tickets_ata.clone().to_account_info(),
            authority: ctx.accounts.vault_manager.clone().to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.clone().to_account_info(),
                transfer_ticket_accounts,
                &[&[
                    ctx.accounts.mint.clone().key().as_ref(),
                    ctx.accounts.vault.clone().key().as_ref(),
                    &[vault_mgr_bump],
                ]],
            ),
            amount,
        )
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        _vault_bump: u8,
        vault_mgr_bump: u8,
        _tickets_bump: u8,
        amount: u64,
    ) -> ProgramResult {
        // get current timestamp from Clock program
        let now = Clock::get()?.unix_timestamp;

        // if time remaining then error
        if now < ctx.accounts.vault_manager.draw {
            return Err(ErrorCode::TimeRemaining.into());
        }

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
        _ctx: Context<Draw>,
        _vault_bump: u8,
        _vault_mgr_bump: u8,
        _tickets_bump: u8,
    ) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(vault_bump: u8, vault_mgr_bump: u8, tickets_bump: u8, vault_tickets_ata_bump: u8)]
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
        seeds = [tickets.key().as_ref()],
        bump = vault_tickets_ata_bump,
        token::mint = tickets,
        token::authority = vault_manager)]
    pub vault_tickets_ata: Account<'info, token::TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(vault_bump: u8, vault_mgr_bump: u8, vault_tickets_bump: u8, vault_tickets_ata_bump: u8)]
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
        has_one = vault_tickets_ata,
        seeds = [mint.key().as_ref(), vault.key().as_ref()],
        bump = vault_mgr_bump)]
    pub vault_manager: Account<'info, VaultManager>,

    #[account(mut)]
    pub tickets: Account<'info, token::Mint>,

    #[account(mut)]
    pub vault_tickets_ata: Box<Account<'info, token::TokenAccount>>,

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
#[instruction(vault_bump: u8, vault_mgr_bump: u8, tickets_bump: u8)]
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

#[account]
#[derive(Default)]
pub struct VaultManager {
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub tickets: Pubkey,
    pub vault_tickets_ata: Pubkey,
    pub draw: i64, // in ms, lottery end time
    pub ticket_price: u64,
    //pub lock: i64, // in ms, when lock is triggered buys and withdrawals are disabled until draw time
}

#[error]
pub enum ErrorCode {
    #[msg("TimeRemaining")]
    TimeRemaining,
}

//// n % m
//// https://stackoverflow.com/questions/31210357/is-there-a-modulus-not-remainder-function-operation
//fn n_mod_m<T: std::ops::Rem<Output = T> + std::ops::Add<Output = T> + Copy>(n: T, m: T) -> T {
//    ((n % m) + m) % m
//}
