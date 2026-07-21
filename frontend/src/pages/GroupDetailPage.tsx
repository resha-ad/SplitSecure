import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { groupsApi, expensesApi, settlementsApi } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import type { BalancesResponse, Expense, Group } from "../api/types";

type Tab = "expenses" | "balances" | "members";

function formatMoney(cents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
}

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("expenses");
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<BalancesResponse>({});

  async function loadAll() {
    if (!groupId) return;
    const [g, exp, bal] = await Promise.all([
      groupsApi.get(groupId),
      expensesApi.list(groupId),
      settlementsApi.balances(groupId),
    ]);
    setGroup(g);
    setExpenses(exp);
    setBalances(bal);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (!group || !groupId) return <div className="app-shell">Loading...</div>;

  const isAdmin = group.members.find((m) => m.userId === user?.id)?.role === "ADMIN";

  return (
    <div className="app-shell">
      <h1>{group.name}</h1>

      <div className="tabs">
        <button className={tab === "expenses" ? "active" : ""} onClick={() => setTab("expenses")}>Expenses</button>
        <button className={tab === "balances" ? "active" : ""} onClick={() => setTab("balances")}>Balances</button>
        <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>Members</button>
      </div>

      {tab === "expenses" && (
        <ExpensesTab groupId={groupId} group={group} expenses={expenses} onChanged={loadAll} />
      )}
      {tab === "balances" && (
        <BalancesTab groupId={groupId} group={group} balances={balances} onChanged={loadAll} currentUserId={user?.id} />
      )}
      {tab === "members" && (
        <MembersTab groupId={groupId} group={group} isAdmin={isAdmin} onChanged={loadAll} />
      )}
    </div>
  );
}

function ExpensesTab({
  groupId,
  group,
  expenses,
  onChanged,
}: {
  groupId: string;
  group: Group;
  expenses: Expense[];
  onChanged: () => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<string[]>(group.members.map((m) => m.userId));

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!description.trim() || !amountCents || selected.length === 0) return;

    const base = Math.floor(amountCents / selected.length);
    const remainder = amountCents - base * selected.length;
    const splits = selected.map((userId, i) => ({ userId, shareCents: base + (i < remainder ? 1 : 0) }));

    await expensesApi.create(groupId, { description: description.trim(), amountCents, currency: "GBP", splits });
    setDescription("");
    setAmount("");
    await onChanged();
  }

  async function onDelete(expenseId: string) {
    await expensesApi.remove(groupId, expenseId);
    await onChanged();
  }

  return (
    <>
      <div className="card">
        <h2>Add an expense</h2>
        <form onSubmit={onCreate}>
          <div className="form-field">
            <label htmlFor="description">Description</label>
            <input id="description" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="amount">Amount (GBP)</label>
            <input id="amount" type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Split between</label>
            {group.members.map((m) => (
              <label key={m.userId} style={{ fontWeight: 400, display: "block" }}>
                <input
                  type="checkbox"
                  checked={selected.includes(m.userId)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked ? [...prev, m.userId] : prev.filter((id) => id !== m.userId)
                    )
                  }
                />{" "}
                {m.user.displayName}
              </label>
            ))}
          </div>
          <button type="submit">Add expense</button>
        </form>
      </div>

      <div className="card">
        <h2>Expenses</h2>
        {expenses.length === 0 && <p className="hint">No expenses logged yet.</p>}
        {expenses.map((exp) => (
          <div key={exp.id} className="expense-row">
            <div>
              {/* eslint-disable-next-line react/no-danger */}
              <div dangerouslySetInnerHTML={{ __html: exp.description }} />
              <span className="hint">Paid by {exp.paidBy.displayName}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>{formatMoney(exp.amountCents, exp.currency)}</div>
              <button className="secondary" onClick={() => onDelete(exp.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function BalancesTab({
  groupId,
  group,
  balances,
  onChanged,
  currentUserId,
}: {
  groupId: string;
  group: Group;
  balances: BalancesResponse;
  onChanged: () => Promise<void>;
  currentUserId?: string;
}) {
  const [toUserId, setToUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const myBalance = currentUserId ? balances[currentUserId] ?? 0 : 0;

  async function onSettle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!toUserId || !amountCents) return;
    try {
      await settlementsApi.settle(groupId, toUserId, amountCents, crypto.randomUUID());
      setAmount("");
      await onChanged();
    } catch {
      setError("Could not record that settlement - check the amount doesn't exceed what you owe.");
    }
  }

  return (
    <>
      <div className="card">
        <h2>Balances</h2>
        {group.members.map((m) => {
          const bal = balances[m.userId] ?? 0;
          return (
            <div key={m.userId} className="member-row">
              <span>{m.user.displayName}</span>
              <span className={bal >= 0 ? "balance-positive" : "balance-negative"}>
                {bal >= 0 ? "is owed " : "owes "} {formatMoney(Math.abs(bal))}
              </span>
            </div>
          );
        })}
      </div>

      {myBalance < 0 && (
        <div className="card">
          <h2>Settle up</h2>
          <p className="hint">You currently owe {formatMoney(-myBalance)} to the group.</p>
          {error && <div className="error-banner">{error}</div>}
          <form onSubmit={onSettle} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="toUser">Pay</label>
              <select id="toUser" value={toUserId} onChange={(e) => setToUserId(e.target.value)} required>
                <option value="">Select member</option>
                {group.members.filter((m) => m.userId !== currentUserId).map((m) => (
                  <option key={m.userId} value={m.userId}>{m.user.displayName}</option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="settleAmount">Amount</label>
              <input id="settleAmount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <button type="submit">Settle</button>
          </form>
        </div>
      )}
    </>
  );
}

function MembersTab({
  groupId,
  group,
  isAdmin,
  onChanged,
}: {
  groupId: string;
  group: Group;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await groupsApi.addMember(groupId, email.trim());
      setEmail("");
      await onChanged();
    } catch {
      setError("Could not add that member - check the email is registered with SplitSecure.");
    }
  }

  async function onRoleChange(userId: string, role: "ADMIN" | "MEMBER") {
    await groupsApi.changeRole(groupId, userId, role);
    await onChanged();
  }

  async function onRemove(userId: string) {
    await groupsApi.removeMember(groupId, userId);
    await onChanged();
  }

  return (
    <div className="card">
      <h2>Members</h2>
      {group.members.map((m) => (
        <div key={m.userId} className="member-row">
          <span>{m.user.displayName} <span className="hint">({m.user.email})</span></span>
          {isAdmin ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={m.role} onChange={(e) => onRoleChange(m.userId, e.target.value as "ADMIN" | "MEMBER")}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button className="secondary" onClick={() => onRemove(m.userId)}>Remove</button>
            </div>
          ) : (
            <span className="hint">{m.role}</span>
          )}
        </div>
      ))}

      {isAdmin && (
        <form onSubmit={onAdd} style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="memberEmail">Add member by email</label>
            <input id="memberEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit">Add</button>
        </form>
      )}
      {error && <div className="error-banner" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
