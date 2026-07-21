import { Request, Response } from "express";
import crypto from "crypto";
import { verifyCsrf } from "./csrf";
import { hmacHex } from "../utils/crypto";
import { env } from "../config/env";
import { AppError } from "./errorHandler";

function mockReq(method: string, cookieValue?: string, headerToken?: string): Request {
  return {
    method,
    cookies: cookieValue ? { ssc_csrf: cookieValue } : {},
    header: (name: string) => (name.toLowerCase() === "x-csrf-token" ? headerToken : undefined),
  } as unknown as Request;
}

function validCookiePair() {
  const token = crypto.randomBytes(16).toString("hex");
  const signature = hmacHex(token, env.csrfSecret);
  return { token, cookieValue: `${token}.${signature}` };
}

describe("verifyCsrf", () => {
  it("allows safe methods through without a token", () => {
    const next = jest.fn();
    verifyCsrf(mockReq("GET"), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("allows a request whose header token matches the signed cookie", () => {
    const { token, cookieValue } = validCookiePair();
    const next = jest.fn();
    verifyCsrf(mockReq("POST", cookieValue, token), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects a POST with no cookie/header at all", () => {
    expect(() => verifyCsrf(mockReq("POST"), {} as Response, jest.fn())).toThrow(AppError);
  });

  it("rejects when the header token doesn't match the cookie token (forged/missing header)", () => {
    const { cookieValue } = validCookiePair();
    const forgedToken = crypto.randomBytes(16).toString("hex");
    expect(() => verifyCsrf(mockReq("POST", cookieValue, forgedToken), {} as Response, jest.fn())).toThrow(
      AppError
    );
  });

  it("rejects when the cookie's signature has been tampered with", () => {
    const { token, cookieValue } = validCookiePair();
    const tamperedCookie = cookieValue.slice(0, -1) + (cookieValue.endsWith("a") ? "b" : "a");
    expect(() => verifyCsrf(mockReq("POST", tamperedCookie, token), {} as Response, jest.fn())).toThrow(
      AppError
    );
  });

  it("rejects a malformed cookie (no signature segment)", () => {
    expect(() => verifyCsrf(mockReq("POST", "just-a-token-no-dot", "just-a-token-no-dot"), {} as Response, jest.fn())).toThrow(
      AppError
    );
  });
});
