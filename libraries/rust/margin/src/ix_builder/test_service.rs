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

use anchor_lang::{InstructionData, ToAccountMetas};
use solana_sdk::{
    instruction::Instruction, pubkey, pubkey::Pubkey, rent::Rent, system_program, sysvar::SysvarId,
};

use jet_test_service::{
    seeds::{TOKEN_INFO, TOKEN_MINT, TOKEN_PYTH_PRICE, TOKEN_PYTH_PRODUCT},
    TokenCreateParams,
};

/// Get instruction to create a token as described
pub fn token_create(payer: &Pubkey, params: &TokenCreateParams) -> Instruction {
    let mint = derive_token_mint(&params.name);

    let accounts = jet_test_service::accounts::TokenCreate {
        payer: *payer,
        mint,
        info: derive_token_info(&mint),
        pyth_product: derive_pyth_product(&mint),
        pyth_price: derive_pyth_price(&mint),
        token_program: spl_token::ID,
        system_program: system_program::ID,
        rent: Rent::id(),
    }
    .to_account_metas(None);

    Instruction {
        program_id: jet_test_service::ID,
        accounts,
        data: jet_test_service::instruction::TokenCreate {
            params: params.clone(),
        }
        .data(),
    }
}

/// Get instruction to initialize native token
pub fn token_init_native(payer: &Pubkey, oracle_authority: &Pubkey) -> Instruction {
    let mint = spl_token::native_mint::ID;

    let accounts = jet_test_service::accounts::TokenInitNative {
        payer: *payer,
        mint,
        info: derive_token_info(&mint),
        pyth_product: derive_pyth_product(&mint),
        pyth_price: derive_pyth_price(&mint),
        token_program: spl_token::ID,
        system_program: system_program::ID,
        rent: Rent::id(),
    }
    .to_account_metas(None);

    Instruction {
        program_id: jet_test_service::ID,
        accounts,
        data: jet_test_service::instruction::TokenInitNative {
            oracle_authority: *oracle_authority,
        }
        .data(),
    }
}

/// Request a number of tokens be minted
pub fn token_request(
    requester: &Pubkey,
    mint: &Pubkey,
    destination: &Pubkey,
    amount: u64,
) -> Instruction {
    let accounts = jet_test_service::accounts::TokenRequest {
        requester: *requester,
        mint: *mint,
        info: derive_token_info(mint),
        destination: *destination,
        token_program: spl_token::ID,
    }
    .to_account_metas(None);

    Instruction {
        program_id: jet_test_service::ID,
        accounts,
        data: jet_test_service::instruction::TokenRequest { amount }.data(),
    }
}

/// Update the pyth price for a token
pub fn token_update_pyth_price(
    authority: &Pubkey,
    mint: &Pubkey,
    price: i64,
    conf: i64,
    expo: i32,
) -> Instruction {
    let accounts = jet_test_service::accounts::TokenUpdatePythPrice {
        oracle_authority: *authority,
        info: derive_token_info(mint),
        pyth_price: derive_pyth_price(mint),
    }
    .to_account_metas(None);

    Instruction {
        program_id: jet_test_service::ID,
        accounts,
        data: jet_test_service::instruction::TokenUpdatePythPrice { price, conf, expo }.data(),
    }
}

/// Get the token mint address for a given token name
pub fn derive_token_mint(name: &str) -> Pubkey {
    if name == "SOL" {
        return pubkey!("So11111111111111111111111111111111111111112");
    }

    Pubkey::find_program_address(&[TOKEN_MINT, name.as_bytes()], &jet_test_service::ID).0
}

/// Get the token info account
pub fn derive_token_info(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[TOKEN_INFO, mint.as_ref()], &jet_test_service::ID).0
}

/// Get the pyth product account
pub fn derive_pyth_product(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[TOKEN_PYTH_PRODUCT, mint.as_ref()], &jet_test_service::ID).0
}

/// Get the pyth price account
pub fn derive_pyth_price(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[TOKEN_PYTH_PRICE, mint.as_ref()], &jet_test_service::ID).0
}
