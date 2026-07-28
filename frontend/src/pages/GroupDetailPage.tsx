import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { groupsApi, expensesApi, settlementsApi } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import type { BalancesResponse, Expense, Group } from "../api/types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

type Tab = "expenses" | "balances" | "members";

function formatMoney(cents: number, currency = "NPR") {
  return new Intl.NumberFormat("en-NP", { style: "currency", currency }).format(cents / 100);
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("expenses");
  const [group, setGroup] = useState<Group | null>(null);
  useDocumentTitle(group?.name ?? "Group");
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

  if (!group || !groupId) {
    return (
      <div className="app-shell">
        <p className="hint"><span className="spinner" aria-hidden="true" /> Loading group...</p>
      </div>
    );
  }

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

const MIN_EXPENSE_AMOUNT_NPR = 10;

type SplitMethod = "equal" | "percentage" | "exact";

// Rounding a percentage (or a set of decimal exact amounts) per-member
// almost never sums back to exactly amountCents by chance - the backend
// requires an exact match (money can't have fractional paisa), so any
// leftover/shortfall from rounding is folded into the first member's
// share rather than left as a silent discrepancy.
function distributeRemainder(amountCents: number, raw: { userId: string; shareCents: number }[]) {
  const sum = raw.reduce((total, r) => total + r.shareCents, 0);
  const diff = amountCents - sum;
  if (diff !== 0 && raw.length > 0) {
    raw[0].shareCents += diff;
  }
  return raw;
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
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("equal");
  const [selected, setSelected] = useState<string[]>(group.members.map((m) => m.userId));
  const [memberValues, setMemberValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const included = group.members.filter((m) => selected.includes(m.userId));
  const amountCents = Math.round((parseFloat(amount) || 0) * 100);

  const percentageTotal = included.reduce((sum, m) => sum + (parseFloat(memberValues[m.userId]) || 0), 0);
  const exactTotalCents = included.reduce((sum, m) => sum + Math.round((parseFloat(memberValues[m.userId]) || 0) * 100), 0);

  function toggleMember(userId: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, userId] : prev.filter((id) => id !== userId)));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Please enter a description.");
      return;
    }
    if (!amount || amountCents < MIN_EXPENSE_AMOUNT_NPR * 100) {
      setError(`Amount must be at least NPR ${MIN_EXPENSE_AMOUNT_NPR.toFixed(2)}.`);
      return;
    }
    if (included.length === 0) {
      setError("Select at least one member to split this expense with.");
      return;
    }

    let splits: { userId: string; shareCents: number }[];

    if (splitMethod === "equal") {
      const base = Math.floor(amountCents / included.length);
      const remainder = amountCents - base * included.length;
      splits = included.map((m, i) => ({ userId: m.userId, shareCents: base + (i < remainder ? 1 : 0) }));
    } else if (splitMethod === "percentage") {
      if (Math.round(percentageTotal * 100) !== 10000) {
        setError(`Percentages must add up to 100% - currently ${percentageTotal.toFixed(1)}%.`);
        return;
      }
      splits = distributeRemainder(
        amountCents,
        included.map((m) => ({
          userId: m.userId,
          shareCents: Math.round((amountCents * (parseFloat(memberValues[m.userId]) || 0)) / 100),
        }))
      );
    } else {
      if (exactTotalCents !== amountCents) {
        setError(`Exact amounts must add up to ${formatMoney(amountCents)} - currently ${formatMoney(exactTotalCents)}.`);
        return;
      }
      splits = included.map((m) => ({
        userId: m.userId,
        shareCents: Math.round((parseFloat(memberValues[m.userId]) || 0) * 100),
      }));
    }

    try {
      await expensesApi.create(groupId, { description: description.trim(), amountCents, currency: "NPR", splits });
      setDescription("");
      setAmount("");
      setMemberValues({});
      await onChanged();
    } catch {
      setError("Could not add that expense - please check the details and try again.");
    }
  }

  async function onDelete(expenseId: string) {
    await expensesApi.remove(groupId, expenseId);
    await onChanged();
  }

  return (
    <>
      <div className="card">
        <h2>Add an expense</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={onCreate}>
          <div className="form-field">
            <label htmlFor="description">Description</label>
            <input id="description" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="amount">Amount (NPR)</label>
            <input
              id="amount"
              type="number"
              step="0.01"
              min={MIN_EXPENSE_AMOUNT_NPR}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="hint">Minimum NPR {MIN_EXPENSE_AMOUNT_NPR.toFixed(2)}.</span>
          </div>

          <div className="form-field">
            <label>Split method</label>
            <div style={{ display: "flex", gap: 14 }}>
              {(["equal", "percentage", "exact"] as SplitMethod[]).map((methodOption) => (
                <label key={methodOption} style={{ fontWeight: 400, display: "flex", alignItems: "center", gap: 5 }}>
                  <input
                    type="radio"
                    name="splitMethod"
                    checked={splitMethod === methodOption}
                    onChange={() => setSplitMethod(methodOption)}
                  />
                  {methodOption === "equal" ? "Equally" : methodOption === "percentage" ? "By percentage" : "By exact amount"}
                </label>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label>Split between</label>
            {group.members.map((m) => {
              const isIncluded = selected.includes(m.userId);
              return (
                <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label style={{ fontWeight: 400, display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                    <input type="checkbox" checked={isIncluded} onChange={(e) => toggleMember(m.userId, e.target.checked)} />
                    {m.user.displayName}
                  </label>
                  {splitMethod !== "equal" && isIncluded && (
                    <input
                      type="number"
                      step={splitMethod === "percentage" ? "1" : "0.01"}
                      min="0"
                      style={{ width: 90 }}
                      placeholder={splitMethod === "percentage" ? "%" : "NPR"}
                      value={memberValues[m.userId] ?? ""}
                      onChange={(e) => setMemberValues((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
            {splitMethod === "percentage" && (
              <span className={Math.round(percentageTotal * 100) === 10000 ? "balance-positive" : "balance-negative"}>
                Total: {percentageTotal.toFixed(1)}% (needs to be 100%)
              </span>
            )}
            {splitMethod === "exact" && (
              <span className={exactTotalCents === amountCents ? "balance-positive" : "balance-negative"}>
                Total: {formatMoney(exactTotalCents)} (needs to be {formatMoney(amountCents)})
              </span>
            )}
          </div>

          <button type="submit">Add expense</button>
        </form>
      </div>

      <div className="card">
        <h2>Expenses</h2>
        {expenses.length === 0 && <p className="hint">No expenses logged yet.</p>}
        {expenses.map((exp) => (
          <div key={exp.id} className="expense-row">
            <div className="entity-row">
              <span className="avatar" aria-hidden="true">{initials(exp.paidBy.displayName)}</span>
              <div>
                {/* was dangerouslySetInnerHTML, allowing stored XSS via the
                    description field. React's default text-node rendering
                    escapes it - no sanitizer needed since rich text was
                    never a real requirement here. */}
                <div>{exp.description}</div>
                <span className="hint">Paid by {exp.paidBy.displayName}</span>
              </div>
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
              <span className="entity-row">
                <span className="avatar" aria-hidden="true">{initials(m.user.displayName)}</span>
                {m.user.displayName}
              </span>
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
          <span className="entity-row">
            <span className="avatar" aria-hidden="true">{initials(m.user.displayName)}</span>
            {m.user.displayName} <span className="hint">({m.user.email})</span>
          </span>
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
