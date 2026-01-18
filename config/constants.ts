import { Curve } from "@ika.xyz/sdk"


export const CHAIN_CONFIG: Record<string, Curve> = {
    'algorand-chain': Curve.ED25519, 
    'ethereum-chain': Curve.SECP256K1, 
};

//coins for fees
export const IKA_COIN_TYPE= "0x1f26bb2f711ff82dcda4d02c77d5123089cb7f8418751474b9fb744ce031526a::ika::IKA";
export const SUI_COIN_TYPE= "0x2::sui::SUI";

//for Ethereum

export const BASE_SEPOLIA_ID = 84532;

//for algorand
export const SIGN_BYTES_PREFIX = Uint8Array.from([77, 88]);