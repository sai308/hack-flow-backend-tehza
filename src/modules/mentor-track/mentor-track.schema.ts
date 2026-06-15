import { z } from 'zod';

export const AssignMentorDtoSchema = z.object({
  userId: z.string().uuid(),
  trackId: z.string().uuid(),
});

export type AssignMentorDto = z.infer<typeof AssignMentorDtoSchema>;
