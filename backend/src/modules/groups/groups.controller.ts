import { Request, Response } from "express";
import { createGroupSchema, addMemberSchema, changeMemberRoleSchema } from "./groups.schema";
import * as groupsService from "./groups.service";

export async function createGroup(req: Request, res: Response) {
  const input = createGroupSchema.parse(req.body);
  const group = await groupsService.createGroup(req.userId!, input.name);
  res.status(201).json(group);
}

export async function listGroups(req: Request, res: Response) {
  const groups = await groupsService.listUserGroups(req.userId!);
  res.json(groups);
}

export async function getGroup(req: Request, res: Response) {
  const group = await groupsService.getGroupDetail(req.params.groupId);
  res.json(group);
}

export async function addMember(req: Request, res: Response) {
  const input = addMemberSchema.parse(req.body);
  const member = await groupsService.addMember(req.userId!, req.params.groupId, input.email);
  res.status(201).json(member);
}

export async function changeMemberRole(req: Request, res: Response) {
  const input = changeMemberRoleSchema.parse(req.body);
  const member = await groupsService.changeMemberRole(
    req.userId!,
    req.params.groupId,
    req.params.userId,
    input.role
  );
  res.json(member);
}

export async function removeMember(req: Request, res: Response) {
  await groupsService.removeMember(req.userId!, req.params.groupId, req.params.userId);
  res.status(204).send();
}
