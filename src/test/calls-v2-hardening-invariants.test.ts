/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CallKeyExchange } from '../calls-v2/callKeyExchange';

const repoRoot = process.cwd();

function walkFiles(dir: string, predicate: (file: string) => boolean, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walkFiles(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function readRel(file: string) {
  return readFileSync(path.join(repoRoot, file), 'utf8');
}

describe('calls-v2 E2EE hardening invariants', () => {
  it('CallKeyExchange evicts old epochs and destroy clears key access', async () => {
    const kx = new CallKeyExchange({ userId: 'life-user', deviceId: 'life-device', sessionId: 'life-session' });
    await kx.initialize();
    await kx.createEpochKey(1);
    await kx.createEpochKey(2);
    await kx.createEpochKey(3);
    await kx.createEpochKey(4);

    expect(kx.getEpochKey(1)).toBeNull();
    expect(kx.getEpochKey(2)).toBeTruthy();
    expect(kx.getEpochKey(3)).toBeTruthy();
    expect(kx.getEpochKey(4)).toBeTruthy();

    kx.destroy();
    expect(kx.getCurrentEpochKey()).toBeNull();
    expect(kx.getEpochKey(2)).toBeNull();
    await expect(kx.getPublicKeyBase64()).rejects.toThrow(/Not initialized/);
  });

  it('calls-v2 crypto sources do not contain weak algorithms or insecure storage', () => {
    const files = walkFiles(path.join(repoRoot, 'src/calls-v2'), (file) => file.endsWith('.ts'));
    const findings: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
      const forbidden = [
        /Math\.random\s*\(/,
        /AES-CBC/,
        /AES-ECB/,
        /localStorage/,
        /sessionStorage/,
        /privateKey\s*[:=]\s*['"]/,
        /secret\s*[:=]\s*['"]/,
      ];
      for (const pattern of forbidden) {
        if (pattern.test(content)) findings.push(`${rel}: ${pattern}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it('server and calls-v2 logs do not emit full key material fields', () => {
    const files = [
      'server/calls-ws/index.mjs',
      ...walkFiles(path.join(repoRoot, 'src/calls-v2'), (file) => file.endsWith('.ts')).map((file) => path.relative(repoRoot, file).replace(/\\/g, '/')),
      'src/contexts/video-call/useCallsV2E2eeSignals.ts',
    ];
    const findings: string[] = [];
    for (const file of files) {
      const content = readRel(file);
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!/logger\.|console\./.test(line)) return;
        if (/\b(ciphertext|sig|identitySig|salt|senderPublicKey|senderSigningPublicKey|joinToken|accessToken)\b/.test(line)) {
          // Allow explicit boolean/length/status-only logs; full values must not be logged.
          if (!/missing|has|length|count|rejected|verified|FAILED|error|epoch|roomId|senderUserId|senderDeviceId/.test(line)) {
            findings.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        }
      });
    }
    expect(findings).toEqual([]);
  });
});
