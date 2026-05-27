// export async function deriveKey(
//   secret: string,
//   salt: string,
//   iterations: number
// ): Promise<Uint8Array> {
//   const encoder = new TextEncoder();
//   const keyMaterial = await globalThis.crypto.subtle.importKey(
//     "raw",
//     encoder.encode(secret),
//     "PBKDF2",
//     false,
//     ["deriveBits"]
//   );
//   const bits = await globalThis.crypto.subtle.deriveBits(
//     {
//       name: "PBKDF2",
//       salt: encoder.encode(salt),
//       iterations,
//       hash: "SHA-256",
//     },
//     keyMaterial,
//     256
//   );
//   return new Uint8Array(bits);
// }

// import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
// import { sha256 } from "@noble/hashes/sha2.js";
// import { utf8ToBytes } from "@noble/hashes/utils.js";
import Crypto from "react-native-quick-crypto";


export async function deriveKey(
  secret: string,
  salt: string,
  iterations = 200_000
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    Crypto.pbkdf2(secret, salt, iterations, 32, "sha256", (err, derivedKey) => {
      if (err || !derivedKey) reject(err ?? new Error("pbkdf2 returned no key"));
      else resolve(new Uint8Array(derivedKey));
    });
  });
}
