import { dWalletCreate } from './dwallet/dWallet.ts';
import { paymentSigningEth } from './chains/ethereum.ts';
import { createPresign } from './dwallet/preSigning.ts'
import { checkWalletsStorage } from './dwallet/storage.ts';
import { paymentSigningAlg } from './chains/algorand.ts';



//--------------testing----------------

//scommenta le sezioni che vuoi utilizzare. ex. scommenta //dwallet creation per creare un dwallet o presign creation per creare una presignature


async function main(){
    
    //easy frontend cli per testing da fare

    /*
    //dwallet creation
    
    const user_label = 'risparmio';      //questa label poi la prenderemo dall'utente 
    const targetChain = 'algorand-chain';       //qui puoi inserire esclusivamente la string "algorand-chain" o "ethereum-chain" (case sensitive e necessita il trattina), niente altro viene accettato.  
    await dWalletCreate(targetChain, user_label);

    //ricorda di finanziare l'indirizzo del dWallet da un faucet altrimenti la transazione fallisce per mancanza di fondi sulla chain di destinanzione (dimostrando comunque che il cross chaining funziona correttamente XD)
    */

    /*
    //dwalllet getter
    const wallets = checkWalletsStorage();
    const wallet = wallets[0];    //seleziona il wallet dal db 
    */


    
    /*
    //per chiamare presign creation devi aver scommentato dwallet getter e assicurarti di aver creato almeno un dwallet.
    //presign creation (in base alla destination chain ti crea una presiganture con la firma che richiede. ex. algorand -> ed25519)
    await createPresign(wallet);       //passo il dWallet per test in realta ha più senso passare solo curva
    */


    /*
    //firma transazione su ethereum (assicurati di star prednendo dal wallet storage un wallet per ethereum)
    const ethRecipientAddr = 'test-address' //ethereum addr per base sepolia
    const amount = "test-amount";        //esempio: 0.001

    //console.log(await paymentSigningEth(wallet, ethRecipientAddr, amount));
    
    //puoi verificare la transazione su https://sepolia.basescan.org
    */

    /*
    //firma transazione su algorand
    const algRecipientAddr = 'test-address';    //account a cui mandare algo
    const algAmount = 1000; //test amount

    console.log(await paymentSigningAlg(wallet, algRecipientAddr, algAmount));
    //puoi verificare la transazione su https://lora.algokit.io/testnet
    */
    
    process.exit(0);

}


main();

