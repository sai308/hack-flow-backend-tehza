/**
 * EmailService unit tests
 * Uses a mocked nodemailer transport — no real SMTP connection needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock nodemailer BEFORE importing the module under test ─────────────────
// We use vi.mock() at the top level so Vitest hoists it before any imports.
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

// ── Also mock env so tests are hermetic ───────────────────────────────────
vi.mock('../../src/config/env', () => ({
  env: {
    SMTP_HOST: 'smtp.test.local',
    SMTP_PORT: 587,
    SMTP_USER: 'test@hackflow.app',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'no-reply@hackflow.app',
    FRONTEND_URL: 'https://hackflow.app',
  },
}));

// Import AFTER mocks are registered
import {
  sendPasswordResetEmail,
  setTransporterForTesting,
} from '../../src/services/email.service';

// Inject our mock transporter so the lazy singleton uses it
beforeEach(() => {
  mockSendMail.mockClear();
  setTransporterForTesting({ sendMail: mockSendMail } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EmailService — sendPasswordResetEmail', () => {
  const TO = 'user@example.com';
  const TOKEN = 'abc123-reset-token';
  const EXPECTED_URL = `https://hackflow.app/reset-password?token=${TOKEN}`;

  it('calls sendMail with correct from/to/subject', async () => {
    await sendPasswordResetEmail(TO, TOKEN);

    expect(mockSendMail).toHaveBeenCalledOnce();
    const [opts] = mockSendMail.mock.calls[0] as [Record<string, unknown>];
    expect(opts.from).toBe('no-reply@hackflow.app');
    expect(opts.to).toBe(TO);
    expect(opts.subject).toMatch(/password/i);
  });

  it('includes the reset URL in text body', async () => {
    await sendPasswordResetEmail(TO, TOKEN);

    const [opts] = mockSendMail.mock.calls[0] as [Record<string, unknown>];
    expect(opts.text).toContain(EXPECTED_URL);
  });

  it('includes the reset URL in html body', async () => {
    await sendPasswordResetEmail(TO, TOKEN);

    const [opts] = mockSendMail.mock.calls[0] as [Record<string, unknown>];
    expect(opts.html).toContain(EXPECTED_URL);
  });

  it('does NOT throw when sendMail rejects (swallows SMTP errors)', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP timeout'));

    // Must resolve (not reject) — email failures must never surface to caller
    await expect(sendPasswordResetEmail(TO, TOKEN)).resolves.toBeUndefined();
  });

  it('logs error to console when sendMail rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSendMail.mockRejectedValueOnce(new Error('connection refused'));

    await sendPasswordResetEmail(TO, TOKEN);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[EmailService]'),
      expect.any(Error),
    );
  });
});
