import path from 'path'
import fs from 'fs'
import type {DWallet} from '../types.ts'
import { Curve } from '@ika.xyz/sdk';

const configDir = path.join(process.cwd(), 'config');

const filePathWallets = path.join(configDir, 'wallets.json');
const filePathPresignatures = path.join(configDir, 'presignatures.json')

//dwallets storage
export function addWallet(wallet: DWallet){
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    let currentWallets: DWallet[] = [];

    if (fs.existsSync(filePathWallets)) {
        const fileContent = fs.readFileSync(filePathWallets, 'utf-8');
        
        try {
            if (fileContent.trim()) {
                const parsedData = JSON.parse(fileContent); 
                currentWallets = Array.isArray(parsedData) ? parsedData : [parsedData];
            }
        } catch (error) {
            currentWallets = [];
        }
    }

    currentWallets.push(wallet);

    fs.writeFileSync(filePathWallets, JSON.stringify(currentWallets, null, 2))

}

export function checkWalletsStorage(){
    const content = fs.readFileSync(filePathWallets, 'utf-8');
    if(!content){
        return []
    }
    
    const wallets: DWallet[] = JSON.parse(content);
    
    return wallets
}


//presignatures storage             -> funziona ma rivedila

type IdCollection = {
  [curve: string]: string[];
};

export function addPresignature(presignID: string, curve: Curve){
    let data: IdCollection = {};

    try {
        const fileContent = fs.readFileSync(filePathPresignatures, 'utf-8');
        if (fileContent.trim() === "") {
            data = {};
        } else {
            data = JSON.parse(fileContent);
        }
    } catch (error: any) {
        if (error.code !== 'ENOENT') {
        throw error;
        }
    }

    if (!data[curve]) {
        data[curve] = [];
    }

    if (!data[curve].includes(presignID)) {
          data[curve].push(presignID);
          console.log(`Added ${presignID} to ${curve}`);
    } else {
        console.log(`ID ${presignID} already exists in ${curve}`);
    }

  fs.writeFileSync(filePathPresignatures, JSON.stringify(data, null, 2), 'utf-8');

}

export function getPresignature(curve: Curve){
    
    let fileContent: IdCollection = {};

    if (!fs.existsSync(filePathPresignatures)) {
        throw new Error('File doesn\'t exists')
    }

    fileContent = JSON.parse(fs.readFileSync(filePathPresignatures, 'utf-8'));
    
    if (!fileContent[curve] || fileContent[curve].length === 0){
        throw new Error('No presigature found for the specified curve.')
    }

    const presignID = fileContent[curve].shift();

    fs.writeFileSync(filePathPresignatures, JSON.stringify(fileContent, null, 2), 'utf-8');
        
    return presignID
}