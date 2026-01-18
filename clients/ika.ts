import { IkaClient, getNetworkConfig } from "@ika.xyz/sdk";
import { getSuiClient } from "../clients/sui.ts"

export async function getIkaClient(){
	
	const ikaClient = new IkaClient({
	suiClient: await getSuiClient(),
	config: getNetworkConfig('testnet'),
	});

	await ikaClient.initialize();

	return ikaClient;
}

