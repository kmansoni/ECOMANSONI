export type WsEnvelopeV1<TPayload extends object = any> = {
  v: 1;
  type: string;
  msgId: string;
  ts: number;
  seq?: number;
  ack?: {
    ackOfMsgId: string;
    ok?: boolean;
    error?: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
    };
  };
  trace?: {
    traceId?: string;
    spanId?: string;
  };
  payload: TPayload;
};

export type CallsWsConfig = {
  url: string; // wss://call.mansoni.com/ws
  heartbeatMs?: number; // default 10s
};

export type CallsWsAuth = {
  accessToken: string;
};
