import type { CallLifecycleEvent } from "./call-lifecycle";
import type { PushPayload } from "./notification";

export interface EventEnvelope<TType extends string, TPayload> {
  eventId: string;
  type: TType;
  userId: string;
  createdAtMs: number;
  payload: TPayload;
}

export type CallEventEnvelope = EventEnvelope<"call_event", CallLifecycleEvent>;
export type PushEventEnvelope = EventEnvelope<"push_event", PushPayload>;
