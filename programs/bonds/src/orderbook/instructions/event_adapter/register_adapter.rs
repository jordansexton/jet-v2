use anchor_lang::prelude::*;

use crate::{events::EventAdapterRegistered, orderbook::state::EventAdapterMetadata, seeds};

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct RegisterAdapterParams {
    /// Total capacity of the adapter
    /// Increases rent cost
    pub num_events: u32,
}

#[derive(Accounts)]
#[instruction(params: RegisterAdapterParams)]
pub struct RegisterAdapter<'info> {
    /// AdapterEventQueue account owned by outside user or program
    #[account(
        init,
        seeds = [
            seeds::EVENT_ADAPTER,
            bond_manager.key().as_ref(),
            owner.key().as_ref(),
        ],
        bump,
        payer = payer,
        space = EventAdapterMetadata::space(params.num_events),
    )]
    pub adapter_queue: AccountLoader<'info, EventAdapterMetadata>,

    /// BondManager for this Adapter
    /// CHECK:
    pub bond_manager: UncheckedAccount<'info>,

    /// Signing authority over this queue
    pub owner: Signer<'info>,

    /// Payer for the initialization rent of the queue
    #[account(mut)]
    pub payer: Signer<'info>,

    /// solana system program
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterAdapter>, _params: RegisterAdapterParams) -> Result<()> {
    let mut adapter = ctx.accounts.adapter_queue.load_init()?;
    adapter.owner = ctx.accounts.owner.key();
    adapter.manager = ctx.accounts.bond_manager.key();

    emit!(EventAdapterRegistered {
        bond_manager: ctx.accounts.bond_manager.key(),
        owner: ctx.accounts.owner.key(),
        adapter: ctx.accounts.adapter_queue.key(),
    });

    Ok(())
}
