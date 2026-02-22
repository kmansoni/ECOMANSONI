import IORedis from "ioredis";

export function createRedis(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
  });
}
