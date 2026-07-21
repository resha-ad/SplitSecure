import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
