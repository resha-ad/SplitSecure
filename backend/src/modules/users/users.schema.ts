import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// Deliberately loose/partial - accepts (a superset resembling) the export
// bundle shape so re-importing a previously exported file just works, but
// only `profile.displayName` is ever actually applied (see
// importUserData in users.service.ts for why the rest is intentionally
// ignored rather than trusted).
export const importDataSchema = z.object({
  profile: z
    .object({
      displayName: z.string().trim().min(1).max(60).optional(),
    })
    .optional(),
});
export type ImportDataInput = z.infer<typeof importDataSchema>;
