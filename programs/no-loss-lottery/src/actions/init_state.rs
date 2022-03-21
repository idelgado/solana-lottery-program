use crate::*;
use anchor_lang::prelude::*;
pub use switchboard_v2::VrfAccountData;

const MAX_RESULT: u64 = u64::MAX;

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

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct InitStateParams {
    pub client_state_bump: u8,
    pub max_result: u64,
    pub draw_duration: u64,
    pub ticket_price: u64,
    pub lottery_name: String,
}

impl InitState<'_> {
    pub fn validate(&self, ctx: &Context<Self>, params: &InitStateParams) -> Result<()> {
        msg!("Validate init");
        if params.max_result > MAX_RESULT {
            return Err(error!(SLPErrorCode::MaxResultExceedsMaximum));
        }
        if params.ticket_price <= 0 {
            return Err(error!(SLPErrorCode::InvalidTicketPrice));
        }
        if params.draw_duration <= 0 {
            return Err(error!(SLPErrorCode::InvalidDrawDuration));
        }

        msg!("Checking VRF Account");
        let vrf_account_info = &ctx.accounts.vrf;
        let _vrf = VrfAccountData::new(vrf_account_info)
            .map_err(|_| SLPErrorCode::InvalidSwitchboardVrfAccount)?;

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

        msg!("Setup collection");
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
            name: params.lottery_name.clone(),
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
        vault_mgr.draw_duration = params.draw_duration;
        vault_mgr.cutoff_time = 0;
        vault_mgr.ticket_price = params.ticket_price;
        vault_mgr.deposit_mint = ctx.accounts.deposit_mint.clone().key();
        vault_mgr.deposit_vault = ctx.accounts.deposit_vault.clone().key();
        vault_mgr.yield_mint = ctx.accounts.yield_mint.clone().key();
        vault_mgr.yield_vault = ctx.accounts.yield_vault.clone().key();
        vault_mgr.deposit_token_reserve = 10 * params.ticket_price;
        vault_mgr.collection_mint = ctx.accounts.collection_mint.clone().key();
        vault_mgr.circulating_ticket_supply = 0;

        Ok(())
    }
}
