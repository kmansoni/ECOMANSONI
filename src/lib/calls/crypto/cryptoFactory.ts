import type { CallIdentity } from '@/calls-v2';
import { CryptoProvider } from './cryptoProvider';
import { DefaultCryptoProvider } from './defaultCryptoProvider';
import { PQXDHCryptoProvider } from './pqxdh/pqxdhCryptoProvider';
import { OpenMlsCryptoProvider } from './openmls/openmlsCryptoProvider';
import { SealedSenderCryptoProvider } from './sealedSender';
import { getCallsConfig } from '@/lib/calls/config/callsConfig';

export function createCryptoProvider(identity: CallIdentity): CryptoProvider {
  const config = getCallsConfig();
  let provider: CryptoProvider;
  if (config.usePq) {
    provider = new PQXDHCryptoProvider(identity);
  } else if (config.useMls) {
    provider = new OpenMlsCryptoProvider(identity);
  } else {
    provider = new DefaultCryptoProvider(identity);
  }
  if (config.sealedSender) {
    provider = new SealedSenderCryptoProvider(provider, identity);
  }
  return provider;
}