import { z } from 'zod';

export const CreateTeamSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  logo: z.string().url().optional(),
  trackId: z.string().uuid().optional(),
  hackathonId: z.string().uuid(),
});

export const UpdateTeamSchema = CreateTeamSchema.omit({ hackathonId: true }).partial();

export const JoinTeamSchema = z.object({
  token: z.string().min(1),
});

export const CreateInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(100).default(10),
  expiresInHours: z.number().int().min(1).max(168).default(24),
});

export const UuidParamSchema = z.object({ id: z.string().uuid() });

export type CreateTeamDto = z.infer<typeof CreateTeamSchema>;
export type UpdateTeamDto = z.infer<typeof UpdateTeamSchema>;
export type JoinTeamDto = z.infer<typeof JoinTeamSchema>;
export type CreateInviteDto = z.infer<typeof CreateInviteSchema>;
