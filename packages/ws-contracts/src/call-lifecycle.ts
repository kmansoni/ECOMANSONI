export type DevicePlatform = "ios" | "android" | "web";

export type CallState =
  | "incoming"
  | "ringing"
  | "accepted"
  | "joining_sfu"
  | "active"
  | "ended";

export type CallEndReason =
  | "decline"
  | "timeout"
  | "hangup"
  | "failed"
  | "network";

export interface IncomingCallEvent {
  v: 1;
  type: "incoming_call";
  callId: string;
  roomId: string;
  callerId: string;
  calleeId: string;
  media: "audio" | "video";
  createdAtMs: number;
  expiresAtMs: number;
}

export interface AcceptCallEvent {
  v: 1;
  type: "accept";
  callId: string;
  userId: string;
  deviceId: string;
  atMs: number;
}

export interface EndCallEvent {
  v: 1;
  type: "end";
  callId: string;
  userId: string;
  reason: CallEndReason;
  atMs: number;
}

export interface ReconnectCallEvent {
  v: 1;
  type: "reconnect";
  callId: string;
  userId: string;
  deviceId: string;
  atMs: number;
}

export interface MigrateRoomEvent {
  v: 1;
  type: "migrate";
  callId: string;
  roomId: string;
  fromNodeId: string;
  toNodeId: string;
  rejoinAfterMs: number;
}

export type CallLifecycleEvent =
  | IncomingCallEvent
  | AcceptCallEvent
  | EndCallEvent
  | ReconnectCallEvent
  | MigrateRoomEvent;
