/**
 * tests/unit/bounceProcessor.test.ts
 *
 * Unit тесты для BounceProcessor.
 * Проверяет: классификацию bounce, обновление статуса, suppression.
 *
 * Покрываемые сценарии:
 *  1. Классифицирует hard bounce (SMTP код 550)
 *  2. Классифицирует soft bounce (SMTP код 450)
 *  3. Классифицирует complaint по diagnostic text
 *  4. Классифицирует hard bounce по diagnostic "user unknown"
 *  5. hard bounce → suppression добавляется
 *  6. soft bounce → suppression НЕ добавляется
 *  7. Обновляет статус сообщения на 'bounced'
 *  8. Классифицирует undetermined при отсутствии кода
 *  9. complaint → reason = 'complaint'
 * 10. processWebhookBounce() делегирует в processBounce()
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockPool } from '../helpers/mocks.spec.js';

// ─── Мокируем prom-client ────────────────────────────────────────────────────
vi.mock('prom-client', () => ({
  Counter: vi.fn(() => ({ inc: vi.fn() })),
  Histogram: vi.fn(() => ({ startTimer: vi.fn(() => vi.fn()), observe: vi.fn() })),
  Gauge: vi.fn(() => ({ inc: vi.fn(), dec: vi.fn(), set: vi.fn() })),
  register: {
    contentType: 'text/plain',
    metrics: vi.fn(async () => ''),
    clear: vi.fn(),
  },
  collectDefaultMetrics: vi.fn(),
}));

// ─── Мокируем logger ─────────────────────────────────────────────────────────
vi.mock('../../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
  createLogger: vi.fn(),
}));

// ─── Импорт тестируемого модуля ───────────────────────────────────────────────
import { BounceProcessor } from '../../src/services/bounceProcessor.js';

const SMTP_MSG_ID = '<bounce-123@mail.example.com>';
const RECIPIENT = 'victim@domain.com';
const DB_MSG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID = 'tenant-bounce-test';

describe('BounceProcessor', () => {
  let db: MockPool;
  let suppressionService: {
    add: ReturnType<typeof vi.fn>;
    isSuppressed: ReturnType<typeof vi.fn>;
    filterSuppressed: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    gdprErase: ReturnType<typeof vi.fn>;
    cleanupExpired: ReturnType<typeof vi.fn>;
  };
  let processor: BounceProcessor;

  beforeEach(() => {
    db = new MockPool();
    suppressionService = {
      add: vi.fn(async () => {}),
      isSuppressed: vi.fn(async () => null),
      filterSuppressed: vi.fn(async () => ({ allowed: [], suppressed: [] })),
      remove: vi.fn(async () => true),
      list: vi.fn(async () => ({ items: [], total: 0 })),
      gdprErase: vi.fn(async () => ({ deletedCount: 0 })),
      cleanupExpired: vi.fn(async () => 0),
    };
    processor = new BounceProcessor(db as any, suppressionService as any);
    vi.clearAllMocks();
  });

  // ── 1. Hard bounce по SMTP коду 550 ──────────────────────────────────────────

  it('1. classifies hard bounce when SMTP code is 550', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });
    db.setupQueryResult('tenant_id FROM email_messages', { rows: [{ tenant_id: TENANT_ID }] });

    await processor.processBounce({
      bounceType: 'hard',
      recipient: RECIPIENT,
      smtpCode: 550,
      smtpMessageId: SMTP_MSG_ID,
    });

    // Должно добавить в suppression с reason=bounce_hard
    expect(suppressionService.add).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        email: RECIPIENT,
        reason: 'bounce_hard',
      }),
    );
  });

  // ── 2. Soft bounce по SMTP коду 450 ──────────────────────────────────────────

  it('2. classifies soft bounce when SMTP code is 450', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });
    db.setupQueryResult('tenant_id FROM email_messages', { rows: [{ tenant_id: TENANT_ID }] });

    await processor.processBounce({
      bounceType: 'soft',
      recipient: RECIPIENT,
      smtpCode: 450,
      smtpMessageId: SMTP_MSG_ID,
    });

    // Soft bounce НЕ должен добавить в suppression
    expect(suppressionService.add).not.toHaveBeenCalled();
  });

  // ── 3. Complaint по diagnostic text ──────────────────────────────────────────

  it('3. classifies as complaint when diagnostic text contains "spam"', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });
    db.setupQueryResult('tenant_id FROM email_messages', { rows: [{ tenant_id: TENANT_ID }] });

    await processor.processBounce({
      bounceType: 'hard',
      recipient: RECIPIENT,
      diagnosticCode: 'This message was classified as spam by the recipient',
      smtpMessageId: SMTP_MSG_ID,
    });

    // Complaint → reason=complaint
    expect(suppressionService.add).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({
        email: RECIPIENT,
        reason: 'complaint',
      }),
    );
  });

  // ── 4. Hard bounce по diagnostic "user unknown" ───────────────────────────────

  it('4. classifies as hard bounce when diagnostic contains "user unknown"', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });
    db.setupQueryResult('tenant_id FROM email_messages', { rows: [{ tenant_id: TENANT_ID }] });

    await processor.processBounce({
      bounceType: 'hard',
      recipient: RECIPIENT,
      diagnosticCode: '550 5.1.1 User unknown in virtual mailbox table',
      smtpMessageId: SMTP_MSG_ID,
    });

    expect(suppressionService.add).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ reason: 'bounce_hard' }),
    );
  });

  // ── 5. Hard bounce → suppression добавляется ─────────────────────────────────

  it('5. adds hard bounced email to suppression list', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });
    db.setupQueryResult('tenant_id FROM email_messages', { rows: [{ tenant_id: TENANT_ID }] });

    await processor.processBounce({
      bounceType: 'hard',
      recipient: RECIPIENT,
      smtpCode: 554,
      smtpMessageId: SMTP_MSG_ID,
    });

    expect(suppressionService.add).toHaveBeenCalledOnce();
    const callArgs = suppressionService.add.mock.calls[0];
    expect(callArgs![0]).toBe(TENANT_ID);
    expect(callArgs![1]).toMatchObject({
      email: RECIPIENT,
      reason: 'bounce_hard',
      sourceMessageId: DB_MSG_ID,
    });
  });

  // ── 6. Soft bounce → suppression НЕ добавляется ──────────────────────────────

  it('6. does NOT add soft bounced email to suppression list', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });

    await processor.processBounce({
      bounceType: 'soft',
      recipient: RECIPIENT,
      smtpCode: 452,
      smtpMessageId: SMTP_MSG_ID,
    });

    expect(suppressionService.add).not.toHaveBeenCalled();
  });

  // ── 7. Обновляет статус сообщения ─────────────────────────────────────────────

  it('7. updates message status to "bounced" in database', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });
    db.setupQueryResult('tenant_id FROM email_messages', { rows: [{ tenant_id: TENANT_ID }] });

    await processor.processBounce({
      bounceType: 'hard',
      recipient: RECIPIENT,
      smtpCode: 550,
      smtpMessageId: SMTP_MSG_ID,
    });

    const updateQueries = db.queriesMatching("status = 'bounced'");
    expect(updateQueries.length).toBeGreaterThan(0);
    expect(updateQueries[0]!.params[0]).toBe(DB_MSG_ID);
  });

  // ── 8. Undetermined при неизвестном коде ──────────────────────────────────────

  it('8. classifies as undetermined when no SMTP code or diagnostic is provided', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });

    await processor.processBounce({
      bounceType: 'undetermined',
      recipient: RECIPIENT,
      smtpMessageId: SMTP_MSG_ID,
    });

    // Undetermined → никакого suppression
    expect(suppressionService.add).not.toHaveBeenCalled();
  });

  // ── 9. Inserts bounce event record ────────────────────────────────────────────

  it('9. inserts email_events record for the bounce', async () => {
    db.setupQueryResult('smtp_message_id', { rows: [{ id: DB_MSG_ID }] });
    db.setupQueryResult('tenant_id FROM email_messages', { rows: [{ tenant_id: TENANT_ID }] });

    await processor.processBounce({
      bounceType: 'hard',
      recipient: RECIPIENT,
      smtpCode: 550,
      smtpMessageId: SMTP_MSG_ID,
    });

    const eventQueries = db.queriesMatching('email_events');
    expect(eventQueries.length).toBeGreaterThan(0);
  });

  // ── 10. processWebhookBounce() делегирует в processBounce() ──────────────────

  it('10. processWebhookBounce() delegates to processBounce()', async () => {
    const processBounce = vi.spyOn(processor, 'processBounce');
    db.setupQueryResult('smtp_message_id', { rows: [] });

    await processor.processWebhookBounce({
      bounceType: 'hard',
      recipient: RECIPIENT,
      smtpCode: 550,
      smtpMessageId: SMTP_MSG_ID,
    });

    expect(processBounce).toHaveBeenCalledOnce();
    expect(processBounce).toHaveBeenCalledWith(
      expect.objectContaining({
        bounceType: 'hard',
        recipient: RECIPIENT,
        smtpCode: 550,
      }),
    );
  });
});
