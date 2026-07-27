import { Request, Response } from "express";
import { AppError } from "./errorHandler";

const redisMock = {
  incr: jest.fn(),
  expire: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock("../config/redis", () => ({ redis: redisMock }));
jest.mock("../config/env", () => ({
  env: {
    ipBlocklist: ["10.0.0.1"],
    ipAllowlist: ["10.0.0.99"],
    ipAutoBlockThreshold: 5,
    ipAutoBlockWindowSeconds: 900,
    ipAutoBlockDurationSeconds: 3600,
  },
}));

// Imported after the mocks above so the module picks up the mocked env/redis.
import { ipAccessControl, recordFailedAuthAttempt, isAllowlisted, isIpBlocked } from "./ipAccessControl";

function mockReq(ip: string): Request {
  return { ip } as Request;
}

describe("isAllowlisted", () => {
  it("recognises an allowlisted IP", () => {
    expect(isAllowlisted("10.0.0.99")).toBe(true);
    expect(isAllowlisted("1.2.3.4")).toBe(false);
  });
});

describe("ipAccessControl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes through an allowlisted IP without checking anything else", async () => {
    const next = jest.fn();
    await ipAccessControl(mockReq("10.0.0.99"), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it("blocks a statically blocklisted IP", async () => {
    const next = jest.fn();
    await expect(ipAccessControl(mockReq("10.0.0.1"), {} as Response, next)).rejects.toBeInstanceOf(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks an IP the dynamic auto-block has flagged in redis", async () => {
    redisMock.get.mockResolvedValueOnce("1");
    const next = jest.fn();
    await expect(ipAccessControl(mockReq("1.2.3.4"), {} as Response, next)).rejects.toBeInstanceOf(AppError);
  });

  it("allows a clean, unlisted IP through", async () => {
    redisMock.get.mockResolvedValueOnce(null);
    const next = jest.fn();
    await ipAccessControl(mockReq("1.2.3.4"), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("recordFailedAuthAttempt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does nothing for an allowlisted IP", async () => {
    await recordFailedAuthAttempt("10.0.0.99");
    expect(redisMock.incr).not.toHaveBeenCalled();
  });

  it("sets an expiry only on the first failure in a window", async () => {
    redisMock.incr.mockResolvedValueOnce(1);
    await recordFailedAuthAttempt("1.2.3.4");
    expect(redisMock.expire).toHaveBeenCalledWith("ip:failed:1.2.3.4", 900);
  });

  it("does not reset the expiry on subsequent failures", async () => {
    redisMock.incr.mockResolvedValueOnce(2);
    await recordFailedAuthAttempt("1.2.3.4");
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it("auto-blocks once the threshold is crossed", async () => {
    redisMock.incr.mockResolvedValueOnce(5); // threshold from mocked env
    await recordFailedAuthAttempt("1.2.3.4");
    expect(redisMock.set).toHaveBeenCalledWith("ip:blocked:1.2.3.4", "1", "EX", 3600);
  });

  it("does not auto-block below the threshold", async () => {
    redisMock.incr.mockResolvedValueOnce(4);
    await recordFailedAuthAttempt("1.2.3.4");
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});

describe("isIpBlocked", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports an allowlisted IP as never blocked", async () => {
    expect(await isIpBlocked("10.0.0.99")).toBe(false);
  });

  it("reports a statically blocklisted IP as blocked", async () => {
    expect(await isIpBlocked("10.0.0.1")).toBe(true);
  });

  it("reports a dynamically blocked IP as blocked", async () => {
    redisMock.get.mockResolvedValueOnce("1");
    expect(await isIpBlocked("1.2.3.4")).toBe(true);
  });
});
