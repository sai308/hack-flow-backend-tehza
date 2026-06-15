import { z } from 'zod';

export const CreateTrackSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  guidelines: z.string().optional(),
});

export const StageTypeEnum = z.enum([
  'REGISTRATION',
  'HACKING',
  'PRESENTATION',
  'JUDGING',
  'FINISHED',
  'CUSTOM',
]);

export const CreateStageSchema = z.object({
  name: z.string().min(1).max(255),
  type: StageTypeEnum.default('CUSTOM'),
  orderIndex: z.number().int().min(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  description: z.string().optional(),
});

export const CreateAwardSchema = z.object({
  name: z.string().min(1).max(255),
  certificate: z.string().optional(),
  description: z.string().optional(),
  place: z.number().int().min(1),
});

export const CreateHackathonSchema = z.object({
  title: z.string().min(3).max(255),
  subtitle: z.string().max(500).optional(),
  description: z.string().optional(),
  location: z.string().max(255).optional(),
  online: z.boolean().default(false),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  minTeamSize: z.number().int().min(1).default(1),
  maxTeamSize: z.number().int().min(1).default(5),
  banner: z.string().url().optional(),
  rulesUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  // Nested creation arrays
  tags: z.array(z.string()).optional(),
  tracks: z.array(CreateTrackSchema).optional(),
  stages: z.array(CreateStageSchema).optional(),
  awards: z.array(CreateAwardSchema).optional(),
});

export const UpdateHackathonSchema = CreateHackathonSchema.partial();



export const UuidParamSchema = z.object({ id: z.string().uuid() });

export const SetHackathonStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
});

export const UpdateStatusParamsSchema = z.object({
  hackathonId: z.string().uuid(),
});

export const UpdateTrackSchema = CreateTrackSchema.partial();
export const UpdateStageSchema = CreateStageSchema.partial();
export const UpdateAwardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  value: z.string().optional(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['upcoming', 'active', 'past']).optional(),
  tags: z.string().optional(), // comma-separated tag names
  publishStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  search: z.string().optional(),
});

export type PaginationDto = z.infer<typeof PaginationSchema>;

export type CreateHackathonDto = z.infer<typeof CreateHackathonSchema>;
export type UpdateHackathonDto = z.infer<typeof UpdateHackathonSchema>;
export type CreateTrackDto = z.infer<typeof CreateTrackSchema>;
export type UpdateTrackDto = z.infer<typeof UpdateTrackSchema>;
export type CreateStageDto = z.infer<typeof CreateStageSchema>;
export type UpdateStageDto = z.infer<typeof UpdateStageSchema>;
export type UpdateAwardDto = z.infer<typeof UpdateAwardSchema>;
