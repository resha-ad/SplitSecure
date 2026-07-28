/**
 * Detects file type from actual content (magic bytes / file signature)
 * rather than trusting a caller-supplied MIME string. multer's
 * `file.mimetype` comes straight from the `Content-Type` header of the
 * multipart form part the *client* sent - entirely attacker-controlled,
 * not verified against the bytes that follow it. Relying on it alone
 * (VULN-07) means uploading a file with a spoofed Content-Type: image/png
 * header sails through validation regardless of what's actually inside.
 */

const SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // "%PDF"
];

export function sniffFileType(buffer: Buffer): string | null {
  for (const { mime, bytes } of SIGNATURES) {
    if (buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b)) {
      return mime;
    }
  }
  return null;
}
