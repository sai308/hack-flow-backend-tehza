import nodemailer from 'nodemailer';
import { env } from '../config/env';

/**
 * Lazy-initialised singleton transporter.
 * Avoids creating a connection pool at module-load time when SMTP is not configured.
 */
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }
  return _transporter;
}

/**
 * Send a password-reset email.
 *
 * Design decisions:
 *  - Errors are caught and logged but never re-thrown.
 *    The caller (forgotPassword) must always return 200 to prevent
 *    user-existence enumeration via timing / error differences.
 *  - The transporter is created lazily so tests can inject a mock
 *    before the first call via `setTransporterForTesting()`.
 */
export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const mailOptions: nodemailer.SendMailOptions = {
    from: env.SMTP_FROM,
    to,
    subject: 'Reset your Hack-Flow password',
    text: [
      'You requested a password reset for your Hack-Flow account.',
      '',
      `Reset link (valid for 1 hour): ${resetUrl}`,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n'),
    html: `
      <p>You requested a password reset for your <strong>Hack-Flow</strong> account.</p>
      <p>
        <a href="${resetUrl}" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
          Reset Password
        </a>
      </p>
      <p style="color:#6b7280;font-size:12px;">
        This link expires in 1 hour. If you didn't request a reset, ignore this email.
      </p>
    `,
  };

  try {
    await getTransporter().sendMail(mailOptions);
  } catch (err) {
    // Log but swallow — never expose SMTP errors to the client
    console.error('[EmailService] Failed to send password reset email:', err);
  }
}

// ── Mentor session reminder ────────────────────────────────────────────────

export interface MentorReminderParams {
  to: string;
  mentorName: string;
  teamName: string;
  startTime: Date;
  meetingLink: string | null;
}

/**
 * Send a 15-minute mentor-session reminder to a team member.
 * Fire-and-forget — errors are logged silently, never thrown.
 */
export async function sendMentorReminderEmail(params: MentorReminderParams): Promise<void> {
  const { to, mentorName, teamName, startTime, meetingLink } = params;

  const formatted = startTime.toLocaleString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const linkLine = meetingLink ? `Посилання: ${meetingLink}` : '';
  const linkHtml = meetingLink
    ? `<p><a href="${meetingLink}" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Приєднатися до сесії</a></p>`
    : '';

  const mailOptions: import('nodemailer').SendMailOptions = {
    from: env.SMTP_FROM,
    to,
    subject: 'Нагадування: менторська сесія через 15 хвилин',
    text: [
      'Привіт!',
      'Через 15 хвилин починається ваша менторська сесія.',
      '',
      `Ментор: ${mentorName}`,
      `Команда: ${teamName}`,
      `Час: ${formatted}`,
      linkLine,
      '',
      'Вдалої сесії!',
    ]
      .filter((l) => l !== undefined)
      .join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;">
        <p>Привіт!</p>
        <p>Через <strong>15 хвилин</strong> починається ваша менторська сесія.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;">
          <tr><td style="padding:4px 8px;color:#6b7280;">Ментор</td><td style="padding:4px 8px;font-weight:600;">${mentorName}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280;">Команда</td><td style="padding:4px 8px;font-weight:600;">${teamName}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280;">Час</td><td style="padding:4px 8px;">${formatted}</td></tr>
        </table>
        ${linkHtml}
        <p style="color:#6b7280;font-size:13px;">Вдалої сесії!</p>
      </div>
    `,
  };

  void getTransporter().sendMail(mailOptions).catch((err: unknown) => {
    console.error('[EmailService] Failed to send mentor reminder email:', err);
  });
}


/**
 * Override the transporter — used in unit tests to inject a mock.
 * Not exported from the barrel index; test files import directly.
 */
export function setTransporterForTesting(t: nodemailer.Transporter): void {
  _transporter = t;
}
