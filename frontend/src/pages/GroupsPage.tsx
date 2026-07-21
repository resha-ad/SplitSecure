import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { groupsApi } from "../api/endpoints";
import type { Group } from "../api/types";

export function GroupsPage() {
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
        <p>Loading...</p>
      ) : groups.length === 0 ? (
        <p className="hint">You're not in any groups yet - create one above.</p>
      ) : (
        groups.map((g) => (
          <Link key={g.id} to={`/groups/${g.id}`} style={{ textDecoration: "none" }}>
            <div className="card">
              <h3>{g.name}</h3>
              <p className="hint">{g.members.length} member{g.members.length === 1 ? "" : "s"}</p>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
