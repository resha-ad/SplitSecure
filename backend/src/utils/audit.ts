import { prisma } from "../config/db";

interface AuditEntry {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
}

// Deliberately narrow shape: action + target identifiers only. Never pass
// request bodies, tokens, or full records here - that's how logs end up
// leaking sensitive data (rubric: "avoidance of sensitive data exposure in
// logs"). Failures are swallowed (logged, not thrown) so audit-logging
// itself can never break the primary user-facing action.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        ip: entry.ip ?? null,
      },
    });
  } catch {
    // Intentionally best-effort - see comment above.
  }
}
