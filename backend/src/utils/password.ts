import argon2 from "argon2";

// Argon2id: winner of the Password Hashing Competition, resistant to both
// GPU-cracking (memory-hard) and side-channel attacks (the "id" variant
// mixes the data-dependent and data-independent access patterns of
// Argon2d/Argon2i). Parameters below follow OWASP's current minimum
// recommendation for interactive login (19 MiB memory would be the bare
// minimum; we use a higher memory cost since this is a low-traffic app
// where the extra ~50ms per hash is not user-noticeable).
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}
