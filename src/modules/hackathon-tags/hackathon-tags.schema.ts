import { z } from 'zod';

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(64).trim(),
});

export const AttachTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1).max(20),
});

export const HackathonTagFilterSchema = z.object({
  tags: z.string().optional(), // comma-separated tag names
});

export const HackathonTagParamsSchema = z.object({
  hackathonId: z.string().uuid(),
});

export const TagParamsSchema = z.object({
  tagId: z.string().uuid(),
});

export const HackathonTagByIdParamsSchema = z.object({
  hackathonId: z.string().uuid(),
  tagId: z.string().uuid(),
});

export type CreateTagDto = z.infer<typeof CreateTagSchema>;
export type AttachTagsDto = z.infer<typeof AttachTagsSchema>;
