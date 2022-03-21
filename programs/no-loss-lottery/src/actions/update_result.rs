use crate::*;
use anchor_lang::prelude::*;
pub use switchboard_v2::VrfAccountData;
use anchor_lang::solana_program::clock;

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

    pub fn actuate(ctx: Context<Self>, _params: &UpdateResultParams) -> Result<()> {
        let vrf_account_info = &ctx.accounts.vrf;
        let vrf = VrfAccountData::new(vrf_account_info)?;
        let result_buffer = vrf.get_result()?;
        if result_buffer == [0u8; 32] {
            msg!("vrf buffer empty");
            return Ok(());
        }

        let state = &mut ctx.accounts.state.load_mut()?;
        let max_result = state.max_result;
        if result_buffer == state.result_buffer {
            msg!("existing result_buffer");
            return Ok(());
        }

        msg!("Result buffer is {:?}", result_buffer);
        let value: &[u128] = bytemuck::cast_slice(&result_buffer[..]);
        msg!("u128 buffer {:?}", value);
        let result = value[0] % max_result as u128;
        msg!("Current VRF Value [0 - {}) = {}!", max_result, result);

        if state.result != result {
            state.result_buffer = result_buffer;
            state.result = result;
            state.last_timestamp = clock::Clock::get().unwrap().unix_timestamp;
        }

        if !ctx.accounts.vault_manager.locked {
            let formatted_numbers = format!("{:0>6}", result.to_string());
            let d0: u8 = (&formatted_numbers[0..1]).parse().unwrap();
            let d1: u8 = (&formatted_numbers[1..2]).parse().unwrap();
            let d2: u8 = (&formatted_numbers[2..3]).parse().unwrap();
            let d3: u8 = (&formatted_numbers[3..4]).parse().unwrap();
            let d4: u8 = (&formatted_numbers[4..5]).parse().unwrap();
            let d5: u8 = (&formatted_numbers[5..6]).parse().unwrap();

            ctx.accounts.vault_manager.previous_winning_numbers = [d0, d1, d2, d3, d4, d5];
            ctx.accounts.vault_manager.winning_numbers = [d0, d1, d2, d3, d4, d5];

            ctx.accounts.vault_manager.locked = true;
        } else {
            msg!("vault manager already locked");
        }
 
        Ok(())
    }
}
