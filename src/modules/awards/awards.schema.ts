import { z } from 'zod';

// ── Award ──────────────────────────────────────────────────────
export const CreateAwardSchema = z.object({
  name: z.string().min(1).max(255),
  certificate: z.string().optional(),
  description: z.string().optional(),
  place: z.number().int().min(1),
});

export const UpdateAwardSchema = CreateAwardSchema.partial();

// ── Physical Gift ──────────────────────────────────────────────
export const CreatePhysicalGiftSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  image: z.string().optional(),
});

// ── Params ─────────────────────────────────────────────────────
export const HackathonAwardParamsSchema = z.object({
  hackathonId: z.string().uuid(),
  id: z.string().uuid().optional(),
});

export const AwardGiftParamsSchema = z.object({
  hackathonId: z.string().uuid(),
  id: z.string().uuid(),
  giftId: z.string().uuid(),
});

export const TeamAwardParamsSchema = z.object({
  teamId: z.string().uuid(),
  awardId: z.string().uuid(),
});

// ── Types ───────────────────────────────────────────────────────
export type CreateAwardDto = z.infer<typeof CreateAwardSchema>;
export type UpdateAwardDto = z.infer<typeof UpdateAwardSchema>;
export type CreatePhysicalGiftDto = z.infer<typeof CreatePhysicalGiftSchema>;
