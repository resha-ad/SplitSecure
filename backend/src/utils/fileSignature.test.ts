import { sniffFileType } from "./fileSignature";

describe("sniffFileType", () => {
  it("recognises a real PNG signature", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
    expect(sniffFileType(png)).toBe("image/png");
  });

  it("recognises a real JPEG signature", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(sniffFileType(jpeg)).toBe("image/jpeg");
  });

  it("recognises a real PDF signature", () => {
    const pdf = Buffer.from("%PDF-1.7\n...", "utf8");
    expect(sniffFileType(pdf)).toBe("application/pdf");
  });

  it("returns null for content with no matching signature (e.g. HTML/script)", () => {
    const html = Buffer.from("<script>alert(document.cookie)</script>", "utf8");
    expect(sniffFileType(html)).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(sniffFileType(Buffer.alloc(0))).toBeNull();
  });

  it("is not fooled by a filename or claimed mimetype - it only inspects bytes", () => {
    // The whole point: this buffer would carry a spoofed "image/png"
    // Content-Type from an attacker's multipart request, but the actual
    // bytes are plain HTML/JS - sniffFileType must not be tricked by
    // anything other than the content itself.
    const spoofed = Buffer.from("<html><body>not an image</body></html>", "utf8");
    expect(sniffFileType(spoofed)).toBeNull();
  });
});
