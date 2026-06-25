#![no_std]
//! Minimal NFT for Orbid auction lots: admin mints art pieces (name + image
//! URI), holders transfer them. Just enough for the auction contract to escrow
//! a lot and hand it to the winner; no approvals/operators.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotOwner = 1,
    TokenNotFound = 2,
}

#[contracttype]
#[derive(Clone)]
pub struct Metadata {
    pub name: String,
    pub uri: String,
}

#[contracttype]
pub enum DataKey {
    Admin,
    NextId,
    Owner(u32),
    Meta(u32),
}

#[contract]
pub struct Nft;

#[contractimpl]
impl Nft {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Open mint (testnet demo): anyone mints a lot to themselves; returns the
    /// new token id. Lets any user list an auction without a gatekeeper.
    pub fn mint(env: Env, to: Address, name: String, uri: String) -> u32 {
        to.require_auth();
        let id: u32 = env.storage().instance().get(&DataKey::NextId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        env.storage().persistent().set(&DataKey::Owner(id), &to);
        env.storage()
            .persistent()
            .set(&DataKey::Meta(id), &Metadata { name, uri });
        id
    }

    pub fn transfer(env: Env, from: Address, to: Address, token_id: u32) -> Result<(), Error> {
        from.require_auth();
        let owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(token_id))
            .ok_or(Error::TokenNotFound)?;
        if owner != from {
            return Err(Error::NotOwner);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Owner(token_id), &to);
        Ok(())
    }

    pub fn owner_of(env: Env, token_id: u32) -> Result<Address, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Owner(token_id))
            .ok_or(Error::TokenNotFound)
    }

    pub fn metadata(env: Env, token_id: u32) -> Result<Metadata, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Meta(token_id))
            .ok_or(Error::TokenNotFound)
    }

    pub fn next_id(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }
}
