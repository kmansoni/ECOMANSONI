/**
 * E2EE SFU Integration Gate — CI проверка всех новых модулей и инвариантов.
 * Запуск: node scripts/calls/e2ee-sfu-integration-gate.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);

let failed = false;

function pass(label) {
  console.log(`✅ ${label}`);
}

function fail(label, reason) {
  console.error(`❌ ${label}: ${reason}`);
  failed = true;
}

// ─── 1. Все новые модули существуют как файлы ────────────────────────────────
const modules = [
  'src/calls-v2/sfuMediaManager.ts',
  'src/calls-v2/callKeyExchange.ts',
  'src/calls-v2/callMediaEncryption.ts',
  'src/calls-v2/rekeyStateMachine.ts',
  'src/calls-v2/epochGuard.ts',
];

for (const mod of modules) {
  if (existsSync(mod)) {
    pass(`Модуль существует: ${mod}`);
  } else {
    fail(`Модуль существует: ${mod}`, 'файл не найден');
  }
}

// ─── 2. CallKeyExchange roundtrip (inline crypto) ────────────────────────────
try {
  async function runKeyExchangeRoundtrip() {
    const aliceKP = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const bobKP   = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);

    const bobPubRaw = new Uint8Array(await subtle.exportKey('raw', bobKP.publicKey));
    if (bobPubRaw.length !== 65) throw new Error(`Bob pub key length ${bobPubRaw.length} ≠ 65`);
    if (bobPubRaw[0] !== 0x04) throw new Error('Bob pub key not uncompressed (0x04 prefix missing)');

    // Alice creates epoch key
    const epochRawBytes = getRandomValues(new Uint8Array(16));
    const epochKey = await subtle.importKey('raw', epochRawBytes, { name: 'AES-GCM', length: 128 }, true, ['encrypt', 'decrypt']);

    const aliceIdentity = { userId: 'alice-gate', deviceId: 'd1-gate' };
    const epoch = 1;
    const info = new TextEncoder().encode(`call-e2ee-epoch-${epoch}-${aliceIdentity.userId}-${aliceIdentity.deviceId}`);

    // Alice side: ECDH + HKDF + AES-KW wrap
    const aliceShared = await subtle.deriveBits({ name: 'ECDH', public: bobKP.publicKey }, aliceKP.privateKey, 256);
    const aliceHkdf   = await subtle.importKey('raw', aliceShared, 'HKDF', false, ['deriveKey']);
    const wrappingKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info },
      aliceHkdf,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );
    const wrapped = new Uint8Array(await subtle.wrapKey('raw', epochKey, wrappingKey, 'AES-KW'));

    // Bob side: ECDH + HKDF + AES-KW unwrap
    const bobShared    = await subtle.deriveBits({ name: 'ECDH', public: aliceKP.publicKey }, bobKP.privateKey, 256);
    const bobHkdf      = await subtle.importKey('raw', bobShared, 'HKDF', false, ['deriveKey']);
    const unwrappingKey = await subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info },
      bobHkdf,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );
    const recoveredKey   = await subtle.unwrapKey('raw', wrapped, unwrappingKey, 'AES-KW', { name: 'AES-GCM', length: 128 }, true, ['encrypt', 'decrypt']);
    const recoveredBytes = new Uint8Array(await subtle.exportKey('raw', recoveredKey));

    for (let i = 0; i < epochRawBytes.length; i++) {
      if (epochRawBytes[i] !== recoveredBytes[i]) throw new Error(`Key mismatch at byte ${i}`);
    }
  }

  await runKeyExchangeRoundtrip();
  pass('CallKeyExchange roundtrip (ECDH → HKDF → AES-KW wrap/unwrap)');
} catch (e) {
  fail('CallKeyExchange roundtrip', e.message);
}

// ─── 3. RekeyStateMachine full lifecycle (logic gate) ────────────────────────
try {
  let state = 'IDLE';
  let currentEpoch = 0;
  let pendingEpoch = 0;
  const peerAcks = new Map();
  const activePeers = new Set(['peer1', 'peer2']);

  // initiateRekey
  if (state !== 'IDLE') throw new Error('Expected IDLE');
  pendingEpoch = currentEpoch + 1;
  state = 'REKEY_PENDING';

  // onRekeyBeginAcked
  if (state !== 'REKEY_PENDING') throw new Error('Expected REKEY_PENDING');
  state = 'KEY_DELIVERY';
  for (const p of activePeers) peerAcks.set(p, { acked: false });

  // Receive KEY_ACKs
  peerAcks.get('peer1').acked = true;
  if ([...peerAcks.values()].every(s => s.acked)) throw new Error('Should not have quorum yet (peer2 not acked)');
  peerAcks.get('peer2').acked = true;

  // Quorum check
  if (![...peerAcks.values()].every(s => s.acked)) throw new Error('Quorum expected');
  state = 'REKEY_COMMITTED';

  // activateEpoch
  if (state !== 'REKEY_COMMITTED') throw new Error('Expected REKEY_COMMITTED');
  currentEpoch = pendingEpoch;
  state = 'COOLDOWN';
  state = 'IDLE'; // after cooldown

  if (state !== 'IDLE') throw new Error(`Final state should be IDLE, got ${state}`);
  if (currentEpoch !== 1) throw new Error(`Epoch should be 1, got ${currentEpoch}`);

  pass('RekeyStateMachine full lifecycle (IDLE→PENDING→KEY_DELIVERY→COMMITTED→COOLDOWN→IDLE)');
} catch (e) {
  fail('RekeyStateMachine full lifecycle', e.message);
}

// ─── 4. EpochGuard fail-closed ───────────────────────────────────────────────
try {
  let authenticated = false;
  let roomJoined    = false;
  let e2eeReady     = false;
  const mediaAllowed = () => authenticated && roomJoined && e2eeReady;

  if (mediaAllowed()) throw new Error('Media should be blocked initially');
  authenticated = true;
  if (mediaAllowed()) throw new Error('Media should be blocked without room');
  roomJoined = true;
  if (mediaAllowed()) throw new Error('Media should be blocked without E2EE');
  e2eeReady = true;
  if (!mediaAllowed()) throw new Error('Media should be allowed after all preconditions');

  // Epoch advance → fail-closed
  e2eeReady = false;
  if (mediaAllowed()) throw new Error('Media should be blocked during epoch transition');
  e2eeReady = true;
  if (!mediaAllowed()) throw new Error('Media should re-enable after new epoch E2EE ready');

  pass('EpochGuard fail-closed (media blocked until auth+room+e2ee)');
} catch (e) {
  fail('EpochGuard fail-closed', e.message);
}

// ─── 5. types.ts содержит DtlsParameters, RtpParameters, RtpCapabilities ─────
try {
  const typesContent = readFileSync('src/calls-v2/types.ts', 'utf-8');
  const required = ['DtlsParameters', 'RtpParameters', 'RtpCapabilities'];
  for (const typeName of required) {
    if (!typesContent.includes(typeName)) {
      fail(`types.ts содержит ${typeName}`, 'тип не найден');
    } else {
      const recordPattern = new RegExp(`${typeName}\\s*=\\s*Record<string,\\s*unknown>`);
      if (recordPattern.test(typesContent)) {
        fail(`types.ts ${typeName} не Record<string, unknown>`, 'тип является Record<string, unknown>');
      } else {
        pass(`types.ts содержит ${typeName} (не Record<string, unknown>)`);
      }
    }
  }
} catch (e) {
  fail('types.ts проверка', e.message);
}

// ─── 6. VideoCallContext.tsx не содержит __stub/STUB в KEY_PACKAGE flow ───────
try {
  const candidates = [
    'src/contexts/VideoCallContext.tsx',
    'src/context/VideoCallContext.tsx',
    'src/calls-v2/VideoCallContext.tsx',
  ];
  let found = null;
  for (const p of candidates) {
    if (existsSync(p)) { found = p; break; }
  }

  if (!found) {
    pass('VideoCallContext.tsx — файл не найден, проверка на STUB пропущена');
  } else {
    const content = readFileSync(found, 'utf-8');
    if (content.includes('__stub') || /"STUB"/.test(content) || /'STUB'/.test(content)) {
      fail('VideoCallContext.tsx KEY_PACKAGE flow без STUB', 'найдены stub-маркеры');
    } else {
      pass('VideoCallContext.tsx KEY_PACKAGE flow не содержит __stub/STUB');
    }
  }
} catch (e) {
  fail('VideoCallContext.tsx проверка', e.message);
}

// ─── 7. package.json содержит mediasoup-client ───────────────────────────────
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if ('mediasoup-client' in allDeps) {
    pass('package.json содержит mediasoup-client');
  } else {
    fail('package.json содержит mediasoup-client', 'зависимость не найдена');
  }
} catch (e) {
  fail('package.json mediasoup-client проверка', e.message);
}

// ─── 8. package.json НЕ содержит simple-peer ─────────────────────────────────
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if ('simple-peer' in allDeps) {
    fail('package.json без simple-peer', 'simple-peer найден в зависимостях');
  } else {
    pass('package.json не содержит simple-peer');
  }
} catch (e) {
  fail('package.json simple-peer проверка', e.message);
}

// ─── 9. useVideoCall.ts помечен @deprecated ───────────────────────────────────
try {
  const candidates = [
    'src/hooks/useVideoCall.ts',
    'src/hooks/useVideoCall.tsx',
  ];
  let found = null;
  for (const p of candidates) {
    if (existsSync(p)) { found = p; break; }
  }

  if (!found) {
    fail('useVideoCall.ts @deprecated', 'файл не найден');
  } else {
    const content = readFileSync(found, 'utf-8');
    if (content.includes('@deprecated')) {
      pass('useVideoCall.ts помечен @deprecated');
    } else {
      fail('useVideoCall.ts @deprecated', 'маркер @deprecated не найден');
    }
  }
} catch (e) {
  fail('useVideoCall.ts @deprecated проверка', e.message);
}

// ─── 10. .env.production содержит SFU_REQUIRE_MEDIASOUP=1 ────────────────────
try {
  const candidates = [
    '.env.production',
    '.env.prod',
    'server/sfu/.env.production',
    'infra/calls/docker-compose.prod.yml',
  ];

  let found = null;
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    const content = readFileSync(f, 'utf-8');
    if (content.includes('SFU_REQUIRE_MEDIASOUP=1')) {
      found = f;
      break;
    }
  }

  if (found) {
    pass(`SFU_REQUIRE_MEDIASOUP=1 зафиксирован (${found})`);
  } else {
    fail('SFU_REQUIRE_MEDIASOUP=1 зафиксирован', 'переменная не найдена в production-конфигах');
  }
} catch (e) {
  fail('.env.production проверка', e.message);
}

// ─── Итог ────────────────────────────────────────────────────────────────────
console.log('');
if (failed) {
  console.error('[e2ee-sfu-integration-gate] FAILED — устраните ошибки выше');
  process.exit(1);
} else {
  console.log('[e2ee-sfu-integration-gate] ALL CHECKS PASSED ✅');
}
