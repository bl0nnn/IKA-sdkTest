import { Curve } from '@ika.xyz/sdk';

export interface DWallet {
    dWalletId: string;
    secretKeyShareId: string; 
    curve: Curve;
    chain: string;
    context: string;     
    label: string;  //lo usiamo dopo nel front end (tipo risparmi, affitto etc...)
}

export interface EthTxParams {
  to: string;
  value: string;
  nonce: number;
  gasLimit: string; 
  maxFeePerGas: string; 
  maxPriorityFeePerGas: string; 
  chainId: number;
  from: string;
}