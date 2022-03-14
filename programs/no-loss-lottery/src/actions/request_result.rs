use crate::*;
use anchor_lang::prelude::*;
pub use switchboard_v2::{VrfAccountData, VrfRequestRandomness};

#[derive(Accounts)]
#[instruction(params: RequestResultParams)] // rpc parameters hint
pub struct RequestResult<'info> {
    #[account(
        mut,
        seeds = [
            STATE_SEED, 
            vrf.key().as_ref(),
            authority.key().as_ref(),
        ],
        bump = params.client_state_bump,
        constraint = state.load()?.vrf ==  vrf.key()
    )]
    pub state: AccountLoader<'info, VrfClient>,
    /// CHECK: TODO
    #[account(signer)] // client authority needs to sign
    pub authority: AccountInfo<'info>,
    /// CHECK: TODO
    pub switchboard_program: AccountInfo<'info>,
    /// CHECK: TODO
    #[account(mut)]
    pub vrf: AccountInfo<'info>,
    /// CHECK: TODO
    #[account(mut)]
    /// CHECK: TODO
    pub oracle_queue: AccountInfo<'info>,
    /// CHECK: TODO
    pub queue_authority: AccountInfo<'info>,
    /// CHECK: TODO
    pub data_buffer: AccountInfo<'info>,
    /// CHECK: TODO 
    #[account(mut)]
    pub permission: AccountInfo<'info>,
    #[account(mut, constraint = escrow.owner == program_state.key())]
    pub escrow: Account<'info, TokenAccount>,
    #[account(mut, constraint = payer_wallet.owner == payer_authority.key())]
    pub payer_wallet: Account<'info, TokenAccount>,
    /// CHECK: TODO
    pub vault_manager: AccountLoader<'info, VaultManager>,
    /// CHECK: TODO
    #[account(signer)]
    pub payer_authority: AccountInfo<'info>,
    /// CHECK: TODO
    #[account(address = solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: AccountInfo<'info>,
    /// CHECK: TODO
    pub program_state: AccountInfo<'info>,
    /// CHECK: TODO
    #[account(address = anchor_spl::token::ID)]
    pub token_program: AccountInfo<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RequestResultParams {
    pub client_state_bump: u8,
    pub permission_bump: u8,
    pub switchboard_state_bump: u8,
}

impl RequestResult<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &RequestResultParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(ctx: &Context<Self>, params: &RequestResultParams) -> Result<()> {
        let vault_manager = &ctx.accounts.vault_manager.load()?;
        let cutoff_time = vault_manager.cutoff_time;

        // if no tickets have been purchased, do not draw
        if cutoff_time == 0 {
            return Err(NLLErrorCode::NoTicketsPurchased.into());
        }

        // if locked, dont call draw
        if vault_manager.randomness {
            return Err(NLLErrorCode::AcquiringRandomness.into());
        }

        let now = get_current_time();

        // if time remaining then error
        if now < cutoff_time {
            return Err(NLLErrorCode::TimeRemaining.into());
        }

        let switchboard_program = ctx.accounts.switchboard_program.to_account_info();

        let vrf_request_randomness = VrfRequestRandomness {
            authority: ctx.accounts.state.to_account_info(),
            vrf: ctx.accounts.vrf.to_account_info(),
            oracle_queue: ctx.accounts.oracle_queue.to_account_info(),
            queue_authority: ctx.accounts.queue_authority.to_account_info(),
            data_buffer: ctx.accounts.data_buffer.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            escrow: ctx.accounts.escrow.clone(),
            payer_wallet: ctx.accounts.payer_wallet.clone(),
            payer_authority: ctx.accounts.payer_authority.to_account_info(),
            recent_blockhashes: ctx.accounts.recent_blockhashes.to_account_info(),
            program_state: ctx.accounts.program_state.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        };

        let vrf_key = ctx.accounts.vrf.key.clone();
        let authority_key = ctx.accounts.authority.key.clone();
        let state_seeds: &[&[&[u8]]] = &[&[
            &STATE_SEED,
            vrf_key.as_ref(),
            authority_key.as_ref(),
            &[params.client_state_bump],
        ]];
        msg!("requesting randomness");
        vrf_request_randomness.invoke_signed(
            switchboard_program,
            params.switchboard_state_bump,
            params.permission_bump,
            state_seeds,
        )?;

        msg!("randomness requested successfully");
        Ok(())
    }
}
