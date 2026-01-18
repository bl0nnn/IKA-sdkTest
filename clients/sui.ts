import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

export async function getSuiClient(){
    return new SuiClient({ 
      url: getFullnodeUrl("testnet")
    });
}