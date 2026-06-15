/**
 * Unit tests for the reminder service and email service.
 *
 * Redis is mocked via vi.mock so no real Redis connection is needed.
 * nodemailer transporter is replaced via setTransporterForTesting().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Redis ─────────────────────────────────────────────────────────────

const zaddMock = vi.fn().mockResolvedValue(1);
const zrangeMock = vi.fn().mockResolvedValue([]);
const zremMock = vi.fn().mockResolvedValue(1);
const execMock = vi.fn();
const multiMock = vi.fn(() => ({
  zrangebyscore: vi.fn().mockReturnThis(),
  zremrangebyscore: vi.fn().mockReturnThis(),
  exec: execMock,
}));

vi.mock('../../src/config/redis', () => ({
  getRedisClient: () => ({
    zadd: zaddMock,
    zrange: zrangeMock,
    zrem: zremMock,
    multi: multiMock,
  }),
}));

// ── Mock env ───────────────────────────────────────────────────────────────

vi.mock('../../src/config/env', () => ({
  env: {
    REMINDER_MINUTES_BEFORE: 15,
    SMTP_FROM: 'no-reply@hackflow.test',
    SMTP_HOST: '',
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASS: '',
    FRONTEND_URL: 'http://localhost:5173',
    NODE_ENV: 'test',
  },
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import {
  scheduleReminder,
  cancelReminder,
  popDueReminders,
  REMINDER_KEY,
  type ReminderJob,
} from '../../src/services/reminder.service';

import {
  sendMentorReminderEmail,
  setTransporterForTesting,
} from '../../src/services/email.service';
import type nodemailer from 'nodemailer';

// ═══════════════════════════════════════════════════════════════════════════
// scheduleReminder
// ═══════════════════════════════════════════════════════════════════════════

describe('scheduleReminder', () => {
  beforeEach(() => {
    zaddMock.mockClear();
  });

  const makeJob = (offsetMinutes: number): ReminderJob => ({
    slotId: 'slot-1',
    teamId: 'team-1',
    mentorId: 'mentor-1',
    startTime: new Date(Date.now() + offsetMinutes * 60_000).toISOString(),
    meetingLink: null,
  });

  it('adds job to ZSET with score = startTime - 15min (ms)', async () => {
    const job = makeJob(60); // starts in 60 minutes
    await scheduleReminder(job);

    expect(zaddMock).toHaveBeenCalledOnce();
    const [key, score] = zaddMock.mock.calls[0] as [string, number, string];
    expect(key).toBe(REMINDER_KEY);

    const expectedScore = new Date(job.startTime).getTime() - 15 * 60_000;
    expect(score).toBe(expectedScore);
  });

  it('skips scheduling when slot starts in less than 15 minutes', async () => {
    const job = makeJob(10); // only 10 min away — under the threshold
    await scheduleReminder(job);
    expect(zaddMock).not.toHaveBeenCalled();
  });

  it('skips scheduling when slot start is in the past', async () => {
    const job = makeJob(-30); // 30 min ago
    await scheduleReminder(job);
    expect(zaddMock).not.toHaveBeenCalled();
  });

  it('stores the serialised job payload in the ZSET', async () => {
    const job = makeJob(30);
    await scheduleReminder(job);
    const [, , member] = zaddMock.mock.calls[0] as [string, number, string];
    expect(JSON.parse(member)).toMatchObject({ slotId: 'slot-1', teamId: 'team-1' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// cancelReminder
// ═══════════════════════════════════════════════════════════════════════════

describe('cancelReminder', () => {
  beforeEach(() => {
    zrangeMock.mockClear();
    zremMock.mockClear();
  });

  it('removes matching job from ZSET by slotId', async () => {
    const job: ReminderJob = {
      slotId: 'slot-abc',
      teamId: 'team-1',
      mentorId: 'mentor-1',
      startTime: new Date().toISOString(),
      meetingLink: null,
    };
    zrangeMock.mockResolvedValueOnce([JSON.stringify(job), JSON.stringify({ slotId: 'other' })]);

    await cancelReminder('slot-abc');

    expect(zremMock).toHaveBeenCalledWith(REMINDER_KEY, JSON.stringify(job));
  });

  it('does nothing when slotId is not found in ZSET', async () => {
    zrangeMock.mockResolvedValueOnce([JSON.stringify({ slotId: 'different' })]);
    await cancelReminder('slot-not-found');
    expect(zremMock).not.toHaveBeenCalled();
  });

  it('does nothing when ZSET is empty', async () => {
    zrangeMock.mockResolvedValueOnce([]);
    await cancelReminder('slot-any');
    expect(zremMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// popDueReminders
// ═══════════════════════════════════════════════════════════════════════════

describe('popDueReminders', () => {
  beforeEach(() => {
    multiMock.mockClear();
    execMock.mockClear();
  });

  it('returns parsed jobs from ZRANGEBYSCORE result', async () => {
    const job: ReminderJob = {
      slotId: 's1',
      teamId: 't1',
      mentorId: 'm1',
      startTime: new Date().toISOString(),
      meetingLink: 'https://meet.example.com',
    };
    execMock.mockResolvedValueOnce([[null, [JSON.stringify(job)]], [null, 1]]);

    const result = await popDueReminders();
    expect(result).toHaveLength(1);
    expect(result[0].slotId).toBe('s1');
    expect(result[0].meetingLink).toBe('https://meet.example.com');
  });

  it('returns empty array when no due jobs', async () => {
    execMock.mockResolvedValueOnce([[null, []], [null, 0]]);
    const result = await popDueReminders();
    expect(result).toHaveLength(0);
  });

  it('filters out malformed members without throwing', async () => {
    execMock.mockResolvedValueOnce([[null, ['not-valid-json', '{"slotId":"good"}']], [null, 2]]);
    const result = await popDueReminders();
    expect(result).toHaveLength(1);
    expect(result[0].slotId).toBe('good');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// sendMentorReminderEmail
// ═══════════════════════════════════════════════════════════════════════════

describe('sendMentorReminderEmail', () => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test' });

  beforeEach(() => {
    sendMailMock.mockClear();
    setTransporterForTesting({ sendMail: sendMailMock } as unknown as nodemailer.Transporter);
  });

  afterEach(() => {
    // Flush all microtasks / fire-and-forget promises
    return new Promise((resolve) => setTimeout(resolve, 10));
  });

  const baseParams = {
    to: 'member@team.test',
    mentorName: 'Alice',
    teamName: 'Team Rocket',
    startTime: new Date('2025-06-01T10:00:00Z'),
    meetingLink: null,
  };

  it('calls sendMail with correct "to" and "subject"', async () => {
    await sendMentorReminderEmail(baseParams);
    await new Promise((r) => setTimeout(r, 20)); // flush fire-and-forget

    expect(sendMailMock).toHaveBeenCalledOnce();
    const [opts] = sendMailMock.mock.calls[0] as [nodemailer.SendMailOptions];
    expect(opts.to).toBe('member@team.test');
    expect(opts.subject).toContain('15 хвилин');
  });

  it('includes meetingLink as anchor in HTML when provided', async () => {
    await sendMentorReminderEmail({ ...baseParams, meetingLink: 'https://zoom.us/j/123' });
    await new Promise((r) => setTimeout(r, 20));

    const [opts] = sendMailMock.mock.calls[0] as [nodemailer.SendMailOptions];
    expect(String(opts.html)).toContain('https://zoom.us/j/123');
    expect(String(opts.html)).toContain('<a href=');
  });

  it('omits meeting link section when meetingLink is null', async () => {
    await sendMentorReminderEmail({ ...baseParams, meetingLink: null });
    await new Promise((r) => setTimeout(r, 20));

    const [opts] = sendMailMock.mock.calls[0] as [nodemailer.SendMailOptions];
    expect(String(opts.html)).not.toContain('<a href=');
  });

  it('swallows errors — does not throw when sendMail rejects', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP failure'));
    await expect(sendMentorReminderEmail(baseParams)).resolves.toBeUndefined();
  });
});
