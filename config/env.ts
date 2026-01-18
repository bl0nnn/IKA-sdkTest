import dotenv from 'dotenv';
dotenv.config();

if (!process.env.SUI_PRIVATE_KEY) {
    throw new Error("Missing SUI_PRIVATE_KEY in .env file");
}

if (!process.env.HKDF_KEY) {
    throw new Error("Missing HKDF_KEY in .env file");
}

export const ENV = {
    SUI_PRIVATE_KEY: process.env.SUI_PRIVATE_KEY,
    NET_TYPE: process.env.NET_TYPE || 'testnet',
    HKDF_KEY_HEX: process.env.HKDF_KEY
};

