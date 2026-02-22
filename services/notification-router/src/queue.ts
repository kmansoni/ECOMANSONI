import { Queue, Worker } from "bullmq";
import type IORedis from "ioredis";
import type { NotificationEvent } from "./contracts/events";
import { mapQueueName } from "./routing/policy";

export interface RouterQueues {
  high: Queue<NotificationEvent>;
  normal: Queue<NotificationEvent>;
  low: Queue<NotificationEvent>;
}

export function createQueues(connection: IORedis, prefix: string): RouterQueues {
  return {
    high: new Queue<NotificationEvent>("notif:high", { connection, prefix }),
    normal: new Queue<NotificationEvent>("notif:normal", { connection, prefix }),
    low: new Queue<NotificationEvent>("notif:low", { connection, prefix }),
  };
}

export async function enqueueEvent(queues: RouterQueues, event: NotificationEvent): Promise<void> {
  const queueName = mapQueueName(event);
  const queue = queueName === "notif:high" ? queues.high : queueName === "notif:normal" ? queues.normal : queues.low;
  await queue.add("dispatch", event, {
    jobId: event.eventId,
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 1,
  });
}

export function createWorker(
  name: string,
  connection: IORedis,
  prefix: string,
  processor: (event: NotificationEvent) => Promise<void>,
): Worker<NotificationEvent> {
  return new Worker<NotificationEvent>(name, async (job) => processor(job.data), {
    connection,
    prefix,
    concurrency: 20,
  });
}
