import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { groupsApi } from "../api/endpoints";
import type { Group } from "../api/types";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function GroupsPage() {
  useDocumentTitle("Your groups");
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setGroups(await groupsApi.list());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await groupsApi.create(name.trim());
    setName("");
    await load();
  }

  return (
    <div className="app-shell">
      <h1>Your groups</h1>

      <div className="card">
        <h2>Create a group</h2>
        <form onSubmit={onCreate} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="groupName">Group name</label>
            <input id="groupName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Flat 4B" />
          </div>
          <button type="submit">Create</button>
        </form>
      </div>

      {loading ? (
        <p className="hint"><span className="spinner" aria-hidden="true" /> Loading your groups...</p>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <p>You're not in any groups yet.</p>
          <p className="hint">Create one above to start splitting expenses with people you trust.</p>
        </div>
      ) : (
        groups.map((g) => (
          <Link key={g.id} to={`/groups/${g.id}`} className="clickable-card">
            <div className="card">
              <h3 style={{ margin: 0 }}>{g.name}</h3>
              <p className="hint" style={{ marginTop: 4 }}>
                {g.members.length} member{g.members.length === 1 ? "" : "s"}
              </p>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
