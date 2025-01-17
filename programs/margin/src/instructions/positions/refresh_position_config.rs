// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Copyright (C) 2022 JET PROTOCOL HOLDINGS, LLC.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use anchor_lang::prelude::*;

use crate::{events, MarginAccount, TokenConfig};

#[derive(Accounts)]
pub struct RefreshPositionConfig<'info> {
    /// The margin account with the position to be refreshed
    #[account(mut)]
    pub margin_account: AccountLoader<'info, MarginAccount>,

    /// The config account for the token, which has been updated
    pub config: Account<'info, TokenConfig>,
}

/// Refresh the metadata for a position
pub fn refresh_position_config_handler(ctx: Context<RefreshPositionConfig>) -> Result<()> {
    let config = &ctx.accounts.config;
    let mut account = ctx.accounts.margin_account.load_mut()?;

    let position = account.refresh_position_metadata(
        &config.mint,
        config.token_kind,
        config.value_modifier,
        config.max_staleness,
    )?;

    emit!(events::PositionMetadataRefreshed {
        margin_account: ctx.accounts.margin_account.key(),
        position,
    });

    Ok(())
}
