// Shared TypeScript types across the entire backend

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export type UUID = string;
export type ISODateString = string;

export type TokenType =
  | 'EMAIL_CONFIRM'
  | 'PASSWORD_RESET'
  | 'CHANGE_EMAIL'
  | 'TWO_FACTOR'
  | 'GITHUB';

export type SocialType = 'discord' | 'telegram' | 'viber' | 'github';

export type RoleName = 'admin' | 'judge' | 'mentor' | 'participant';

export type TeamMemberRole = 'captain' | 'participant';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISQUALIFIED';

export type ProjectStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED' | 'REJECTED';

export type MentorAvailabilityStatus = 'available' | 'blocked';

export type MentorSlotStatus = 'booked' | 'completed' | 'cancelled';
