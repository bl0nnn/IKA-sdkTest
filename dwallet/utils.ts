import { extract, expand } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { IKA_COIN_TYPE, SUI_COIN_TYPE } from '../config/constants.ts';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

//crypto
export function seedGenrator(hkdfKey: string, context: string){

    const inputKey = Uint8Array.from(hkdfKey);

    const prk = extract(sha256, inputKey, undefined);

    const info = new TextEncoder().encode(context);

    return expand(sha256, prk, info, 32);
}


//coins

//su ika non ho il problema del singolo coin come su sui
export async function getIkas(user: string, client: SuiClient){

    return await client.getCoins({
        owner: user,                        
        coinType: IKA_COIN_TYPE
    });
}


export async function getSuis(user: string, client: SuiClient, userKeypair: Ed25519Keypair){

    const suis = await client.getCoins({
        owner: user,
        coinType: SUI_COIN_TYPE
    });

    if(suis.data.length == 0){
        throw new Error('No SUI coins found');
    }else if(suis.data.length == 1){

        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [500_000_000]);

        tx.transferObjects([coin], user);

        await client.signAndExecuteTransaction({
            signer: userKeypair,
            transaction: tx,
        });

    }

    return suis;
}