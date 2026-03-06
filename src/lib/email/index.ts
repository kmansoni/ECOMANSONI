/**
 * src/lib/email/index.ts — Public API surface for the Email module.
 *
 * Consumers should import from this barrel file, not from individual modules,
 * to maintain a stable public interface as internals evolve.
 *
 * @example
 * import { sendVerificationEmail, checkEmailHealth } from '@/lib/email';
 */

export {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendNotification,
  checkEmailHealth,
} from './client';

export type {
  EmailPayload,
  EmailResult,
  EmailError,
  EmailSendResult,
} from './client';

export { getEmailRouterApiBases } from './backendEndpoints';
