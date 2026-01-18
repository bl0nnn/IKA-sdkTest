import { dWalletCreate } from './dwallet/dWallet.ts';
import { paymentSigningEth } from './chains/ethereum.ts';
import { createPresign } from './dwallet/preSigning.ts'
import { checkWalletsStorage } from './dwallet/storage.ts';
import { paymentSigningAlg } from './chains/algorand.ts';



//--------------testing----------------


async function main(){
    
    //easy frontend cli per testing da fare


    //dwallet creation
    
    const user_label = 'risparmio';      //questa label poi la prenderemo dall'utente 
    const targetChain = 'algorand-chain';     
    await dWalletCreate(targetChain, user_label);
    


    //dwalllet getter
    const wallets = checkWalletsStorage();
    const wallet = wallets[4];


    //presign creation
    await createPresign(wallet);       //passo il dWallet per test in realta ha più senso passare solo curva




    const ethRecipientAddr = 'test-address' //ethereum addr per base sepolia
    const amount = "test-amount";

    //console.log(await paymentSigningEth(wallet, ethRecipientAddr, amount));

    const algRecipientAddr = 'test-address';
    const algAmount = 1000; //test amount

    console.log(await paymentSigningAlg(wallet, algRecipientAddr, algAmount));


    
    process.exit(0);

}


main();

