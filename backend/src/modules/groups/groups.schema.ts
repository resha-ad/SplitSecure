import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const changeMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});
