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
  url?: string; // single endpoint
  urls?: string[]; // multi-region failover endpoints
  heartbeatMs?: number; // default 10s
  reconnect?: {
    enabled?: boolean;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
  ackRetry?: {
    maxRetries?: number;
    retryDelayMs?: number;
  };
};

export type CallsWsAuth = {
  accessToken: string;
};

export type CallsWsEvent =
  | "WELCOME"
  | "AUTH_OK"
  | "E2EE_POLICY"
  | "ROOM_CREATED"
  | "ROOM_JOIN_OK"
  | "ROOM_SNAPSHOT"
  | "PEER_JOINED"
  | "PEER_LEFT"
  | "TRANSPORT_CREATED"
  | "PRODUCER_ADDED"
  | "PRODUCED"
  | "CONSUMER_ADDED"
  | "ICE_RESTART_OK"
  | "REKEY_BEGIN"
  | "REKEY_COMMIT"
  | "KEY_PACKAGE"
  | "KEY_ACK";

export type CallsWsEventHandler = (frame: WsEnvelopeV1) => void;
