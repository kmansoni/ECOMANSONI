import type { CallIdentity } from '@/calls-v2';
import { CryptoProvider } from './cryptoProvider';
import { DefaultCryptoProvider } from './defaultCryptoProvider';
import { PQXDHCryptoProvider } from './pqxdh/pqxdhCryptoProvider';
import { getCallsConfig } from '@/lib/calls/config/callsConfig';

export function createCryptoProvider(identity: CallIdentity): CryptoProvider {
  const config = getCallsConfig();
  if (config.usePq) {
    return new PQXDHCryptoProvider(identity);
  }
  // В будущем добавить выбор MLS и других
  // if (config.useMls) return new OpenMlsCryptoProvider(identity);
  // По умолчанию Double Ratchet
  return new DefaultCryptoProvider(identity);
}