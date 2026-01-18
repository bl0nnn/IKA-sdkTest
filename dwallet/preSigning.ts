import { 
    IkaTransaction, 
    Hash, 
    SignatureAlgorithm, 
    SessionsManagerModule, 
    CoordinatorInnerModule } from '@ika.xyz/sdk';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';


import type {DWallet} from '../types.ts';
import {getIkaClient } from '../clients/ika.ts';
import { getSuiClient } from '../clients/sui.ts';
import { ENV } from '../config/env.ts';
import { getIkas, getSuis } from './utils.ts';
import { addPresignature } from './storage.ts'



export async function createPresign(dwallet: DWallet){

    const suiClient = await getSuiClient();
    const ikaClient = await getIkaClient();
    
    
    const userSuiKeypair = Ed25519Keypair.fromSecretKey(ENV.SUI_PRIVATE_KEY);
    const userSuiAddr = userSuiKeypair.toSuiAddress();

    const ikas = await getIkas(userSuiAddr, suiClient);
    const suis = await getSuis(userSuiAddr, suiClient, userSuiKeypair);

    
    
    //una certa curva/bockchain poi nella generaizne della signature durante l'MPC implica un certo signature algorithm (Ed25519 -> EDdsa, secp256k1 -> ECDSA  e un certo hash scheme Keccak per ethereum, sha512 per algorand )
    let sigAlg;
    let hashSchema;
    if (dwallet.chain == "algorand-chain"){
        sigAlg = SignatureAlgorithm.EdDSA;
        hashSchema = Hash.SHA512;
    }else if (dwallet.chain == "ethereum-chain"){
        sigAlg = SignatureAlgorithm.ECDSASecp256k1
        hashSchema = Hash.KECCAK256
    }else{
       throw new Error('Curve not yet supported. Create a dWallet with SECP256K1 or ED25519');
    }


    const dWalletEncryptionKey = await ikaClient.getLatestNetworkEncryptionKey();


    const transaction = new Transaction();
    const ikaTransaction = new IkaTransaction({
        ikaClient,
        transaction
    })

    const presignCap = ikaTransaction.requestGlobalPresign({
        curve: dwallet.curve,
        signatureAlgorithm: sigAlg,
        ikaCoin: transaction.object(ikas.data[0].coinObjectId),
        suiCoin: transaction.object(suis.data[0].coinObjectId),
        dwalletNetworkEncryptionKeyId: dWalletEncryptionKey.id
    });

    transaction.transferObjects([presignCap], userSuiAddr);
    
    
    transaction.setSender(userSuiAddr);
    transaction.setGasBudget(200_000_000);


    let { bytes, signature } = await transaction.sign({ 
        client: suiClient, 
        signer: userSuiKeypair 
    });

    const transactionResult = await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
            showEvents: true,
        },
    });

    await suiClient.waitForTransaction({
        digest: transactionResult.digest
      });

    
    let presignID;
    for (const event of transactionResult.events || []) {
            if(event.type.includes("DWalletSessionEvent")){
                const parsed = SessionsManagerModule.DWalletSessionEvent(
                CoordinatorInnerModule.CompletedPresignEvent
              ).fromBase64(event.bcs);                                      //aggiungi un qualche tipo di errore se non lo trova
              presignID = parsed.event_data.presign_id
              break;
            }
    }

    addPresignature(presignID as string, dwallet.curve);

}