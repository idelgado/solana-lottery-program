use crate::*;
use anchor_lang::prelude::*;
pub use switchboard_v2::VrfAccountData;

#[derive(Accounts)]
#[instruction(params: InitStateParams)]
pub struct InitState<'info> {
    #[account(
        init,
        seeds = [
            STATE_SEED, 
            vrf.key().as_ref(),
            authority.key().as_ref(),
        ],
        payer = payer,
        bump,
    )]
    pub state: AccountLoader<'info, VrfClient>,
    /// CHECK: TODO
    pub authority: AccountInfo<'info>,
    /// CHECK: TODO
    #[account(mut, signer)]
    pub payer: AccountInfo<'info>,
    /// CHECK: TODO
    pub vrf: AccountInfo<'info>,

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
        mint::authority = vault_manager,
        mint::decimals = 0,
    )]
    pub tickets: Account<'info, token::Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: TODO
    #[account(address = solana_program::system_program::ID)]
    pub system_program: AccountInfo<'info>,
    pub token_program: Program<'info, token::Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct InitStateParams {
    pub client_state_bump: u8,
    pub max_result: u64,
    pub draw_duration: u64,
    pub ticket_price: u64,
}

impl InitState<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &InitStateParams) -> Result<()> {
        msg!("Validate init");
        if params.max_result > MAX_RESULT {
            return Err(error!(NLLErrorCode::MaxResultExceedsMaximum));
        }
        if params.ticket_price <= 0 {
            return Err(error!(NLLErrorCode::InvalidTicketPrice));
        }
        if params.draw_duration <= 0 {
            return Err(error!(NLLErrorCode::InvalidDrawDuration));
        }

        msg!("Checking VRF Account");
        let vrf_account_info = &ctx.accounts.vrf;
        let _vrf = VrfAccountData::new(vrf_account_info)
            .map_err(|_| NLLErrorCode::InvalidSwitchboardVrfAccount)?;

        Ok(())
    }

    pub fn actuate(ctx: Context<Self>, params: &InitStateParams) -> Result<()> {
        msg!("Actuate init");
        let state = &mut ctx.accounts.state.load_init()?;
        msg!("Setting max result");
        if params.max_result == 0 {
            state.max_result = MAX_RESULT;
        } else {
            state.max_result = params.max_result;
        }

        msg!("Setting VRF Account");
        state.vrf = ctx.accounts.vrf.key.clone();
        state.authority = ctx.accounts.authority.key.clone();

        msg!("Setting VaultManager Account");
        let vault_mgr = &mut ctx.accounts.vault_manager;
        vault_mgr.draw_duration = params.draw_duration;
        vault_mgr.cutoff_time = 0;
        vault_mgr.ticket_price = params.ticket_price;
        vault_mgr.deposit_mint = ctx.accounts.deposit_mint.clone().key();
        vault_mgr.deposit_vault = ctx.accounts.deposit_vault.clone().key();
        vault_mgr.yield_mint = ctx.accounts.yield_mint.clone().key();
        vault_mgr.yield_vault = ctx.accounts.yield_vault.clone().key();
        vault_mgr.tickets = ctx.accounts.tickets.clone().key();
        vault_mgr.deposit_token_reserve = 10 * params.ticket_price;

        Ok(())
    }
}
