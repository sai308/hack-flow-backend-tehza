import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/i).optional(),
  description: z.string().max(500).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  isLookingForTeam: z.boolean().optional(),
  skills: z.array(z.string().min(1).max(50)).max(20).optional(),
});

export const AddSocialSchema = z.object({
  typeSocial: z.enum(['discord', 'telegram', 'viber', 'github']),
  url: z.string().url(),
});

export const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const MatchmakingQuerySchema = z.object({
  hackathon_id: z.string().uuid().optional(),
  skills: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
});

export const UserPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.string().optional(),
  lookingForTeam: z.coerce.boolean().optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
export type AddSocialDto = z.infer<typeof AddSocialSchema>;
export type MatchmakingQuery = z.infer<typeof MatchmakingQuerySchema>;

