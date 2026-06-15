import { z } from 'zod';

export const CreateCriteriaSchema = z.object({
  trackId: z.string().uuid(),
  name: z.string().min(1).max(255),
  weight: z.number().positive().max(100),
  maxScore: z.number().positive().max(100),
});

export const SubmitScoreSchema = z.object({
  projectId: z.string().uuid(),
  criteriaId: z.string().uuid(),
  assessment: z.number().min(0).max(100),
  comment: z.string().optional(),
});

// TODO(enum-decision): The spec mentions reason values MENTORED and RELATIVE.
// We intentionally keep `reason` as a `text` column in Postgres rather than
// migrating to a pg enum. Rationale:
//  1. ALTER TYPE ADD VALUE cannot run inside a transaction — it would require
//     a separate manual migration step (same issue we hit with token_type).
//  2. The domain is narrow: Zod enum validation at the API boundary is
//     sufficient to enforce valid values without a schema migration.
//  3. Keeping it as text makes it trivial to add new reason types in the
//     future without a DDL migration.
export const ConflictReasonEnum = z.enum(['MENTORED', 'RELATIVE']);
export type ConflictReason = z.infer<typeof ConflictReasonEnum>;

export const ReportConflictSchema = z.object({
  teamId: z.string().uuid(),
  reason: ConflictReasonEnum.optional(),
});

export const AllConflictsQuerySchema = z.object({
  hackathonId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
});

export const UuidParamSchema = z.object({ id: z.string().uuid() });

export const UpdateCriteriaSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  weight: z.number().positive().max(100).optional(),
  maxScore: z.number().positive().max(100).optional(),
  description: z.string().optional(),
});

export type CreateCriteriaDto = z.infer<typeof CreateCriteriaSchema>;
export type UpdateCriteriaDto = z.infer<typeof UpdateCriteriaSchema>;
export type SubmitScoreDto = z.infer<typeof SubmitScoreSchema>;
export type ReportConflictDto = z.infer<typeof ReportConflictSchema>;
