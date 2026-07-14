import { z } from "zod";
import { basePermissionKeys, knownPermissionKeys } from "../auth/permissions.js";
export const permissionUserIdSchema=z.string().uuid();
export const permissionAssignmentSchema=z.object({templateKeys:z.array(z.string().min(1).max(80)).max(20),grants:z.array(z.enum(knownPermissionKeys)).max(knownPermissionKeys.length),revokes:z.array(z.enum(knownPermissionKeys)).max(knownPermissionKeys.length)}).strict().superRefine((v,c)=>{for(const key of basePermissionKeys)if(v.revokes.includes(key))c.addIssue({code:'custom',path:['revokes'],message:`Base permission ${key} cannot be revoked`});for(const key of v.grants)if(v.revokes.includes(key))c.addIssue({code:'custom',message:`Permission ${key} cannot be granted and revoked`});});
