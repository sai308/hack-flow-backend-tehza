import { z } from 'zod';

export const CreateProjectSchema = z.object({
  teamId: z.string().uuid(),
  stageId: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

export const UpdateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED']).optional(),
  comment: z.string().optional(),
});

export const AddResourceSchema = z.object({
  projectTypeId: z.string().uuid(),
  url: z.string().url(),
  description: z.string().optional(),
});

export const UuidParamSchema = z.object({ id: z.string().uuid() });

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;
export type AddResourceDto = z.infer<typeof AddResourceSchema>;
