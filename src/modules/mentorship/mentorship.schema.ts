import { z } from 'zod';

export const CreateAvailabilitySchema = z.object({
  hackathonId: z.string().uuid().optional(),
  trackId: z.string().uuid().optional(),
  startDatetime: z.string().datetime(),
  endDatetime: z.string().datetime(),
  slotDuration: z.number().int().min(15).max(120).default(30),
});

export const AvailabilityQuerySchema = z.object({
  hackathonId: z.string().uuid().optional(),
  mentorId: z.string().uuid().optional(),
});

export const CreateMentorshipRequestSchema = z.object({
  mentorAvailabilityId: z.string().uuid(),
  startDatetime: z.string().datetime(),
  durationMinute: z.number().int().min(15).max(120),
  teamId: z.string().uuid().optional(),
  message: z.string().optional(),
});

export const BlockMentorshipSlotSchema = z.object({
  startDatetime: z.string().datetime(),
  durationMinute: z.number().int().min(15).max(120),
});

export const AcceptMentorshipRequestSchema = z.object({
  meetingLink: z.string().url().min(1, 'Meeting link is required to accept'),
});

export const RejectMentorshipRequestSchema = z.object({
  // reason could be added here in the future
});

export const UuidParamSchema = z.object({ id: z.string().uuid() });

export type CreateAvailabilityDto = z.infer<typeof CreateAvailabilitySchema>;
export type CreateMentorshipRequestDto = z.infer<typeof CreateMentorshipRequestSchema>;
export type AcceptMentorshipRequestDto = z.infer<typeof AcceptMentorshipRequestSchema>;
export type BlockMentorshipSlotDto = z.infer<typeof BlockMentorshipSlotSchema>;
