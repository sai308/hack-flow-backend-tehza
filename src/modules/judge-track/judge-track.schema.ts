import { z } from 'zod';

export const AssignJudgeSchema = z.object({
  userId: z.string().uuid(),
  trackId: z.string().uuid(),
  isHeadJudge: z.boolean().default(false),
});

export const UpdateJudgeTrackSchema = z.object({
  isHeadJudge: z.boolean(),
});

export const JudgeTrackParamsSchema = z.object({
  hackathonId: z.string().uuid(),
});

export const JudgeTrackByIdParamsSchema = z.object({
  hackathonId: z.string().uuid(),
  judgeTrackId: z.string().uuid(),
});

export const JudgeTrackByTrackParamsSchema = z.object({
  hackathonId: z.string().uuid(),
  trackId: z.string().uuid(),
});

export type AssignJudgeDto = z.infer<typeof AssignJudgeSchema>;
export type UpdateJudgeTrackDto = z.infer<typeof UpdateJudgeTrackSchema>;
