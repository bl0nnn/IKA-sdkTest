import { 
    Curve, 
    UserShareEncryptionKeys, 
    IkaTransaction, 
    Hash, 
    SignatureAlgorithm, 
    publicKeyFromDWalletOutput, 
    type DWalletWithState, 
    SessionsManagerModule, 
    CoordinatorInnerModule } from '@ika.xyz/sdk';
import type { ZeroTrustDWallet } from '@ika.xyz/sdk';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import algosdk from 'algosdk';


import type {DWallet} from '../types.ts';
import { getSuiClient } from '../clients/sui.ts';
import {getIkaClient } from '../clients/ika.ts';
import { getAlgorandClient } from '../clients/chains.ts'
import { ENV } from '../config/env.ts';
import { getIkas, getSuis, seedGenrator } from '../dwallet/utils.ts'
import { getPresignature} from '../dwallet/storage.ts';

export async function paymentSigningAlg(dwallet: DWallet, recipientAddr: string, amount: number){

    const suiClient = await getSuiClient();
    const ikaClient = await getIkaClient();
    const algoClient = await getAlgorandClient();

    const algod = algoClient.client.algod;

    const userSuiKeypair = Ed25519Keypair.fromSecretKey(ENV.SUI_PRIVATE_KEY);           //sta roba la devi gestire, nel senso che un utente puo avere un indrizzo generato con altre curve
    const userSuiAddr = userSuiKeypair.toSuiAddress();

    const ikas = await getIkas(userSuiAddr, suiClient);
    const suis = await getSuis(userSuiAddr, suiClient, userSuiKeypair);

    const presignID = getPresignature(dwallet.curve);

    const presignCompleted = await ikaClient.getPresignInParticularState(
        presignID as string,
        'Completed',
    );
    
    const dWalletActive = await ikaClient.getDWalletInParticularState(
        dwallet.dWalletId,
        'Active'
    );

    const encryptedUserSecretKeyShare = await ikaClient.getEncryptedUserSecretKeyShare(
        dwallet.secretKeyShareId,
    );

    const userShareEncryptionKeys = await UserShareEncryptionKeys.fromRootSeedKey(
            seedGenrator(ENV.HKDF_KEY_HEX, dwallet.context),		
            dwallet.curve,
    );

    const dWalletPubKey = await getDwalletPubKey(dWalletActive, dwallet.curve);
    const algorandAddr = new algosdk.Address(dWalletPubKey).toString();

    const txParams = await algoClient.getSuggestedParams();

    const algorandTx = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: algorandAddr,
        receiver: recipientAddr,
        amount,
        suggestedParams: txParams,
    });

    const messageBytes = algorandTx.bytesToSign();


    const transaction = new Transaction();
    const ikaTransaction = new IkaTransaction({
	    ikaClient,
	    transaction,
	    userShareEncryptionKeys,
    });

    const messageApproval = ikaTransaction.approveMessage({
	    message: messageBytes,
	    curve : dwallet.curve,
	    dWalletCap: dWalletActive.dwallet_cap_id,
	    signatureAlgorithm: SignatureAlgorithm.EdDSA,
	    hashScheme: Hash.SHA512,
    });

    await ikaTransaction.requestSign({
        dWallet: dWalletActive as ZeroTrustDWallet,
        messageApproval,
        hashScheme: Hash.SHA512,
        verifiedPresignCap: ikaTransaction.verifyPresignCap({
            presign: presignCompleted,
        }),
        presign: presignCompleted,
        encryptedUserSecretKeyShare: encryptedUserSecretKeyShare,
        message: messageBytes,
        signatureScheme: SignatureAlgorithm.EdDSA,
        ikaCoin: transaction.object(ikas.data[0].coinObjectId),
        suiCoin: transaction.object(suis.data[0].coinObjectId),
    });

    transaction.setSender(userSuiAddr);

    const { bytes, signature} = await transaction.sign({ client: suiClient, signer: userSuiKeypair });

    const txResult = await suiClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
        options: {
            showEvents: true,
        },
    });

    await suiClient.waitForTransaction({
        digest: txResult.digest
    });


    let signID;
    for (const event of txResult.events || []) {
        if(event.type.includes("DWalletSessionEvent")){
            const parsed = SessionsManagerModule.DWalletSessionEvent(
            CoordinatorInnerModule.SignRequestEvent
            ).fromBase64(event.bcs);

            signID = parsed.event_data.sign_id               //aggiungi un qualche tipo di errore se non lo trova
            break;
        }
    }

    const messageSignature = await ikaClient.getSignInParticularState(
        signID as string,
        dwallet.curve,
        SignatureAlgorithm.EdDSA,
        'Completed',
    );

    const rawSignature = messageSignature.state.Completed.signature;
    

    const algorandTransactionID = await broadcastTransaction(algorandTx.toByte(), rawSignature, algod);

    return algorandTransactionID

}


//helpers

function getDwalletPubKey(dwallet: DWalletWithState<"Active">, curve: Curve){
    const publicKey = publicKeyFromDWalletOutput(
        curve,
        new Uint8Array(dwallet.state.Active.public_output),
    );

    return publicKey
}

async function broadcastTransaction(txBytes: Uint8Array<ArrayBufferLike>, rawSignature: number[], algod: algosdk.Algodv2){

    const txnPlainObject = algosdk.decodeObj(txBytes);

    const signedTxnObj = {
      sig: new Uint8Array(rawSignature),
      txn: txnPlainObject,
    };

    const rawSignedTxn = algosdk.encodeObj(signedTxnObj);

    try {

        const { txid } = await algod.sendRawTransaction(rawSignedTxn).do();

        const confirmation = await algosdk.waitForConfirmation(algod, txid, 4);
        console.log('Transazione confermata!')
        return {txid}

    } catch (e: any) {

        if (e.response && e.response.text) {
            console.error("Errore Nodo:", JSON.parse(e.response.text).message);
        } else {
            console.error("Errore:", e);
        }
    }
    
}
