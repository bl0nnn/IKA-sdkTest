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
import { bytesToHex } from "@noble/hashes/utils.js";
import { computeAddress } from "ethers";
import {
  type TransactionSerializableEIP1559, 
  type Hex, parseEther, 
  serializeTransaction, 
  recoverTransactionAddress,
  type PublicClient } from "viem";


import type {DWallet} from '../types.ts';
import { getSuiClient } from '../clients/sui.ts';
import {getIkaClient } from '../clients/ika.ts';
import { ENV } from '../config/env.ts';
import { getIkas, getSuis, seedGenrator } from '../dwallet/utils.ts'
import { getEthereumClient } from '../clients/chains.ts';
import { getPresignature } from '../dwallet/storage.ts';
import { BASE_SEPOLIA_ID } from '../config/constants.ts';

export async function paymentSigningEth(dwallet: DWallet, recipientAddr: string, ethAmount: string){

    

    const suiClient = await getSuiClient();
    const ikaClient = await getIkaClient();
    const ethClient = await getEthereumClient();
    
    
    const userSuiKeypair = Ed25519Keypair.fromSecretKey(ENV.SUI_PRIVATE_KEY);           //sta roba la devi gestire, nel senso che un utente puo avere un indrizzo generato con altre curve
    const userSuiAddr = userSuiKeypair.toSuiAddress();
    
        
    const ikas = await getIkas(userSuiAddr, suiClient);
    const suis = await getSuis(userSuiAddr, suiClient, userSuiKeypair);



    const presignID = getPresignature(dwallet.curve);       //metti un controllo dell'errore qui

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
    const ethereumAddr = deriveEthereumAddress(dWalletPubKey);
    

    const txParams = await getTxParams(ethereumAddr, ethClient as PublicClient);

    const unsignedTx: TransactionSerializableEIP1559 = {
        type: "eip1559",
        chainId: BASE_SEPOLIA_ID,
        nonce: txParams.nonce,
        to: recipientAddr as `0x${string}`,
        value: parseEther(ethAmount),
        maxFeePerGas: BigInt(txParams.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(txParams.maxPriorityFeePerGas),
        gas: BigInt(txParams.gasLimit),
    };

    const serializedUnsigned = serializeTransaction(unsignedTx);

    const messageBytes = new Uint8Array(
        Buffer.from(serializedUnsigned.replace(/^0x/, ""), "hex")
    );


    const transaction = new Transaction();
    const ikaTransaction = new IkaTransaction({
        ikaClient,
        transaction,
        userShareEncryptionKeys 
    });


    const messageApproval = ikaTransaction.approveMessage({
        message: messageBytes,				
        curve: dwallet.curve,
        dWalletCap: dWalletActive.dwallet_cap_id,
        signatureAlgorithm: SignatureAlgorithm.ECDSASecp256k1,
        hashScheme: Hash.KECCAK256,
    });

    await ikaTransaction.requestSign({
        dWallet: dWalletActive as ZeroTrustDWallet,
        messageApproval,
        hashScheme: Hash.KECCAK256,      
        verifiedPresignCap: ikaTransaction.verifyPresignCap({
            presign: presignCompleted,
        }),
        presign: presignCompleted,
        encryptedUserSecretKeyShare: encryptedUserSecretKeyShare,
        message: messageBytes, 
        signatureScheme: SignatureAlgorithm.ECDSASecp256k1,
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
                  ).fromBase64(event.bcs);                                      //aggiungi un qualche tipo di errore se non lo trova
                    signID = parsed.event_data.sign_id
                    break;
                }
        }

    const messageSignature = await ikaClient.getSignInParticularState(
        signID as string,
        dwallet.curve,
        SignatureAlgorithm.ECDSASecp256k1,
        'Completed',
    );

    const rawSignature = messageSignature.state.Completed.signature;

    const ethTxHash = await broadcastTransaction(unsignedTx, new Uint8Array(rawSignature), ethereumAddr, ethClient as PublicClient);

    console.log(`Transaction corretly broadcasted to base sepolia with Tx ID: ${ethTxHash}`);

}


//helpers 
function getDwalletPubKey(dwallet: DWalletWithState<"Active">, curve: Curve){
    const publicKey = publicKeyFromDWalletOutput(
        curve,
        new Uint8Array(dwallet.state.Active.public_output),
    );

    return publicKey
}

function deriveEthereumAddress(publicKeyBytes: Uint8Array): string {    
    
    return computeAddress(("0x" + bytesToHex(publicKeyBytes)) as `0x${string}`);

}

async function getTxParams(address: string, ethClient: PublicClient) {
    const [nonce, feeData] = await Promise.all([
      ethClient.getTransactionCount({ address: address as Hex }),
      ethClient.estimateFeesPerGas(),
    ]);

    return {
      nonce,
      maxFeePerGas: (feeData.maxFeePerGas || BigInt("50000000000")).toString(),
      maxPriorityFeePerGas: (
        feeData.maxPriorityFeePerGas || BigInt("2000000000")
      ).toString(),
      gasLimit: "21000",
    };
  }

  async function broadcastTransaction(unsignedTx: TransactionSerializableEIP1559, signature: Uint8Array, ethAddr: string, ethClient: PublicClient) {

    const r = `0x${Buffer.from(signature.slice(0, 32)).toString(
      "hex"
    )}` as Hex;

    const s = `0x${Buffer.from(signature.slice(32, 64)).toString(
      "hex"
    )}` as Hex;
    
    let signedTx: Hex | null = null;
    for (const yParity of [0, 1] as const) {
      const reconstructedTransaction = serializeTransaction(unsignedTx, { r, s, yParity });
      try {
        const recoveredTxAddress = await recoverTransactionAddress({
          serializedTransaction: reconstructedTransaction
        });
        if (recoveredTxAddress.toLowerCase() === ethAddr.toLowerCase()) {
          signedTx = reconstructedTransaction;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!signedTx) {
      throw new Error(
        "error with v signature"
      );
    }


    const txHash = await ethClient.sendRawTransaction({
        serializedTransaction: signedTx

    });

    const txResult = await ethClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

    return txHash

}