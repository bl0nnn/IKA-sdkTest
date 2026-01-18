import { AlgorandClient } from '@algorandfoundation/algokit-utils';
import { createPublicClient, http} from "viem";
import { baseSepolia } from 'viem/chains'

export async function getAlgorandClient(){
    return AlgorandClient.testNet();
}

export async function getEthereumClient(){

    const ethClient = createPublicClient({
        chain: baseSepolia,
        transport: http("https://sepolia.base.org")
    })

    return ethClient
}
