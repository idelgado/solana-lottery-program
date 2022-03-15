use crate::*;
use anchor_lang::prelude::*;
pub use switchboard_v2::VrfAccountData;

#[derive(Accounts)]
#[instruction(params: UpdateResultParams)]
pub struct UpdateResult<'info> {
    #[account(mut)]
    pub state: AccountLoader<'info, VrfClient>,
    /// CHECK: TODO
    pub vrf: AccountInfo<'info>,
    /// CHECK: TODO
    #[account(mut)]
    pub vault_manager: Account<'info, VaultManager>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct UpdateResultParams {}

impl UpdateResult<'_> {
    pub fn validate(&self, _ctx: &Context<Self>, _params: &UpdateResultParams) -> Result<()> {
        Ok(())
    }

    pub fn actuate(_ctx: &Context<Self>, _params: &UpdateResultParams) -> Result<()> {
        Ok(())
    }
}
