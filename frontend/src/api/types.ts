export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  totpEnabled: boolean;
  createdAt: string;
}

export interface GroupMember {
  userId: string;
  role: "ADMIN" | "MEMBER";
  user: { displayName: string; email: string };
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
  members: GroupMember[];
}

export interface ExpenseSplit {
  id: string;
  userId: string;
  shareCents: number;
}

export interface Expense {
  id: string;
  groupId: string;
  paidById: string;
  paidBy: { id: string; displayName: string };
  description: string;
  amountCents: number;
  currency: string;
  createdAt: string;
  splits: ExpenseSplit[];
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

export type BalancesResponse = Record<string, number>;
