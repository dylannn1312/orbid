#![no_std]
//! Minimal SEP-41-compatible token used as Orbid's mock USDC. Implements just
//! the surface the auction needs (`transfer`, `balance`) plus an open testnet
//! faucet `mint` (anyone can mint to themselves) for frictionless demos.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InsufficientBalance = 1,
    NegativeAmount = 2,
    Overflow = 3,
}

#[contracttype]
pub enum DataKey {
    Balance(Address),
    Decimals,
    Name,
    Symbol,
}

#[contract]
pub struct Token;

#[contractimpl]
impl Token {
    pub fn __constructor(env: Env, decimals: u32, name: String, symbol: String) {
        let s = env.storage().instance();
        s.set(&DataKey::Decimals, &decimals);
        s.set(&DataKey::Name, &name);
        s.set(&DataKey::Symbol, &symbol);
    }

    /// Open faucet for testnet demos: anyone can mint to themselves.
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        to.require_auth();
        if amount < 0 {
            return Err(Error::NegativeAmount);
        }
        let bal = balance_of(&env, &to);
        set_balance(&env, &to, bal.checked_add(amount).ok_or(Error::Overflow)?);
        Ok(())
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount < 0 {
            return Err(Error::NegativeAmount);
        }
        let from_bal = balance_of(&env, &from);
        if from_bal < amount {
            return Err(Error::InsufficientBalance);
        }
        set_balance(&env, &from, from_bal - amount);
        let to_bal = balance_of(&env, &to);
        set_balance(
            &env,
            &to,
            to_bal.checked_add(amount).ok_or(Error::Overflow)?,
        );
        Ok(())
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        balance_of(&env, &id)
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Decimals)
            .unwrap_or(7)
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }
}

fn balance_of(env: &Env, who: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(who.clone()))
        .unwrap_or(0)
}

fn set_balance(env: &Env, who: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::Balance(who.clone()), &amount);
}
