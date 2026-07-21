import { apiFetch } from "./client";
import type { BalancesResponse, Expense, Group, Settlement, UserProfile } from "./types";

interface LoginResult {
  mfaRequired: boolean;
  mfaTicket?: string;
  accessToken?: string;
}

export const authApi = {
  register: (email: string, password: string, displayName: string) =>
    apiFetch<{ accessToken: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email: string, password: string, captchaToken?: string) =>
    apiFetch<LoginResult>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, captchaToken }),
    }),

  loginTotp: (mfaTicket: string, code: string) =>
    apiFetch<{ accessToken: string }>("/api/auth/login/totp", {
      method: "POST",
      body: JSON.stringify({ mfaTicket, code }),
    }),

  logout: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),

  totpSetup: () => apiFetch<{ qrDataUrl: string }>("/api/auth/totp/setup", { method: "POST" }),
  totpConfirm: (code: string) =>
    apiFetch<void>("/api/auth/totp/confirm", { method: "POST", body: JSON.stringify({ code }) }),
};

export const usersApi = {
  me: () => apiFetch<UserProfile>("/api/users/me"),
  updateMe: (displayName: string) =>
    apiFetch<UserProfile>("/api/users/me", { method: "PATCH", body: JSON.stringify({ displayName }) }),
};

export const groupsApi = {
  list: () => apiFetch<Group[]>("/api/groups"),
  create: (name: string) => apiFetch<Group>("/api/groups", { method: "POST", body: JSON.stringify({ name }) }),
  get: (groupId: string) => apiFetch<Group>(`/api/groups/${groupId}`),
  addMember: (groupId: string, email: string) =>
    apiFetch<void>(`/api/groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ email }) }),
  changeRole: (groupId: string, userId: string, role: "ADMIN" | "MEMBER") =>
    apiFetch<void>(`/api/groups/${groupId}/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  removeMember: (groupId: string, userId: string) =>
    apiFetch<void>(`/api/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
};

export const expensesApi = {
  list: (groupId: string) => apiFetch<Expense[]>(`/api/groups/${groupId}/expenses`),
  create: (
    groupId: string,
    input: { description: string; amountCents: number; currency: string; splits: { userId: string; shareCents: number }[] }
  ) => apiFetch<Expense>(`/api/groups/${groupId}/expenses`, { method: "POST", body: JSON.stringify(input) }),
  remove: (groupId: string, expenseId: string) =>
    apiFetch<void>(`/api/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" }),
};

export const settlementsApi = {
  balances: (groupId: string) => apiFetch<BalancesResponse>(`/api/groups/${groupId}/settlements/balances`),
  settle: (groupId: string, toUserId: string, amountCents: number, idempotencyKey: string) =>
    apiFetch<Settlement>(`/api/groups/${groupId}/settlements`, {
      method: "POST",
      body: JSON.stringify({ toUserId, amountCents, idempotencyKey }),
    }),
};
