interface CallsConfig {
  usePq: boolean;
  useMls: boolean;
  sealedSender: boolean;
  forceRelay: boolean;
  insertableStreamsRequired: boolean;
  // Можно добавить другие флаги и параметры
}

const config: CallsConfig = {
  usePq: (process.env.REACT_APP_CALLS_USE_PQ ?? 'false').toLowerCase() === 'true',
  useMls: (process.env.REACT_APP_CALLS_USE_MLS ?? 'false').toLowerCase() === 'true',
  sealedSender: (process.env.REACT_APP_CALLS_SEALED_SENDER ?? 'false').toLowerCase() === 'true',
  forceRelay: (process.env.REACT_APP_CALLS_FORCE_RELAY ?? 'false').toLowerCase() === 'true',
  insertableStreamsRequired: (process.env.REACT_APP_CALLS_INSERTABLE_STREAMS_REQUIRED ?? 'false').toLowerCase() === 'true',
};

export function getCallsConfig(): CallsConfig {
  return config;
}