import { 
    IkaClient, 
    Curve, 
    UserShareEncryptionKeys, 
    IkaTransaction, 
    createRandomSessionIdentifier, 
    prepareDKGAsync, 
    verifyAndGetDWalletDKGPublicOutput, 
    userAndNetworkDKGOutputMatch, 
    SessionsManagerModule, 
    CoordinatorInnerModule,
    type ZeroTrustDWallet,
    type DKGRequestInput,
    type DWalletWithState
} from '@ika.xyz/sdk';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';


import {getIkaClient } from '../clients/ika.ts';
import { getSuiClient } from '../clients/sui.ts';
import { ENV } from '../config/env.ts';
import { CHAIN_CONFIG} from '../config/constants.ts'
import { seedGenrator, getIkas, getSuis } from './utils.ts'
import type { DWallet } from '../types.ts'
import { addWallet, checkWalletsStorage } from './storage.ts'



export async function dWalletCreate(chain: string, userLabel: string){
    
    const suiClient = await getSuiClient();
    const ikaClient = await getIkaClient();


    const userSuiKeypair = Ed25519Keypair.fromSecretKey(ENV.SUI_PRIVATE_KEY);
    const userSuiAddr = userSuiKeypair.toSuiAddress();

    
    const ikas = await getIkas(userSuiAddr, suiClient);
    const suis = await getSuis(userSuiAddr, suiClient, userSuiKeypair);

    
    const curve = CHAIN_CONFIG[chain];

    const HKDFcontext = getContextForHkdf(chain);
    
    const userShareEncryptionKeys = await UserShareEncryptionKeys.fromRootSeedKey(
	    seedGenrator(ENV.HKDF_KEY_HEX, HKDFcontext),		
	    curve,
    );
    
    
    const identifier = createRandomSessionIdentifier();

    
    const dkgRequestInput = await prepareDKGAsync(
        ikaClient,
        curve,
        userShareEncryptionKeys,
        identifier,
        userSuiAddr
    );


    const dWalletEncryptionKey = await ikaClient.getLatestNetworkEncryptionKey();
    


    //first transaction block to request the DKG for the dWallet
    const transaction = new Transaction();

    const ikaTransaction = new IkaTransaction({
	    ikaClient,
	    transaction,
	    userShareEncryptionKeys, 
    });

    await ikaTransaction.registerEncryptionKey({		//questo serve all'utente, che di base è un indirizzo su sui di prendere parte al processo di DKG. è essenziale interagire con il network e ricevere le share degli altri (ricordati l'esempio media sttipendi mpc). Questo è il layer di crittografia del network
	    curve,
    });
    

    const [dWalletCap, _signId] = await ikaTransaction.requestDWalletDKG({
	    curve,
	    dkgRequestInput,
	    sessionIdentifier: ikaTransaction.registerSessionIdentifier(identifier),
	    ikaCoin: transaction.object(ikas.data[0].coinObjectId),             //modificare il modo in cui ottengo i coins nonostante funzioni. (se [0] ha pochi fondi la transaction fallisce) transaction.object(ikas.data[0].coinObjectId)
	    suiCoin: transaction.object(suis.data[0].coinObjectId),             //transaction.object(suis.data[0].coinObjectId)
	    dwalletNetworkEncryptionKeyId: dWalletEncryptionKey.id,
    });


    transaction.transferObjects([dWalletCap], userSuiAddr);

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


    let dWalletID: string | null = null;
    let encryptedUserSecretKeyShareId: string | null = null;

    
    for (const event of transactionResult.events || []) {
        if(event.type.includes("DWalletSessionEvent")){
            const parsed = SessionsManagerModule.DWalletSessionEvent(
            CoordinatorInnerModule.DWalletDKGRequestEvent
          ).fromBase64(event.bcs);

          dWalletID = parsed.event_data.dwallet_id;
          encryptedUserSecretKeyShareId = parsed.event_data.user_secret_key_share.Encrypted?.encrypted_user_secret_key_share_id || null;

          break;
        }
    }


    const dWalletAwaiting = await ikaClient.getDWalletInParticularState(
	    dWalletID as string,
	    'AwaitingKeyHolderSignature',			
    );


    //second transaction block to activate the dWallet
    const transaction2 = new Transaction();
    const ikaTransaction2 = new IkaTransaction({
	    ikaClient,
	    transaction: transaction2,
	    userShareEncryptionKeys, // <-- This is optional, but you absolutely need to pass for zero trust dWallets
    });


    await ikaTransaction2.acceptEncryptedUserShare({
	    dWallet: dWalletAwaiting as ZeroTrustDWallet,
	    userPublicOutput: dkgRequestInput.userPublicOutput,				//: new Uint8Array(dWallet.state.AwaitingKeyHolderSignature?.public_output),
	    encryptedUserSecretKeyShareId: encryptedUserSecretKeyShareId as string,
    });


    transaction2.setSender(userSuiAddr);
    transaction2.setGasBudget(200_000_000);


    ({ bytes, signature } = await transaction2.sign({
        client: suiClient,
        signer: userSuiKeypair 
    }));

    const transactionResult2 = await suiClient.executeTransactionBlock({
	    transactionBlock: bytes,
	    signature,
	    options: {
		    showEvents: true
	    }
    });

    await suiClient.waitForTransaction({
        digest: transactionResult2.digest
      });
   

    const dWalletActive = await ikaClient.getDWalletInParticularState(
	    dWalletID as string,
	    'Active',
    );

    if (await check(dWalletActive, ikaClient, userShareEncryptionKeys, curve, dkgRequestInput, encryptedUserSecretKeyShareId as string) == true ){
        console.log('dWallet creato correttamente e pronto per firmare!');
    }



    const dWalletData: DWallet = {
        dWalletId: dWalletID as string,
        secretKeyShareId: encryptedUserSecretKeyShareId as string,
        curve: curve,
        chain: chain,
        context: HKDFcontext,
        label: userLabel
    };

    addWallet(dWalletData);

    return dWalletData


    
}

//helpers


async function check( dWallet: DWalletWithState<"Active">, client: IkaClient, userShareEncryptionKeys: UserShareEncryptionKeys, curve: Curve, dkgRequestInput: DKGRequestInput, encryptedUserSecretKeyShareId: string){
    const encryptedUserSecretKeyShare = await client.getEncryptedUserSecretKeyShare(
	    encryptedUserSecretKeyShareId as string,
    );


    const publicOutput = await verifyAndGetDWalletDKGPublicOutput(
	    dWallet,
	    encryptedUserSecretKeyShare,
	    userShareEncryptionKeys.getPublicKey(),
    );

    if(!publicOutput){
        throw new Error('DKG public output error');
    }


    const match = await userAndNetworkDKGOutputMatch(
	    curve,
	    dkgRequestInput.userPublicOutput,
	    publicOutput,
    );

    if (!match) {
	    throw new Error('DKG outputs do not match - possible security issue');
    }

    return true
}

function getContextForHkdf(selectedChain: string){          //qui il problema con il contesto dell'hkdf è che se l'utente elimina il wallet e questo viene eliminato dal db viene ricretao un index uguale a quello eliminato che non può creare un altro wallet
    const wallets = checkWalletsStorage();

    let num_of_wallets = 0;
    for (const wallet of wallets){
        if (wallet.chain == selectedChain){
            num_of_wallets += 1; 
        }else{
            continue
        }
    }

    const nextIndex = num_of_wallets;

    const context = `${selectedChain}-${nextIndex}`;

    return context
}