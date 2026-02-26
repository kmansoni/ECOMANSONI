# Analytics Infrastructure (Redpanda)

## Local dev

```bash
docker compose -f infra/analytics/docker-compose.yml up -d
```

Create topic:

```bash
docker exec -it $(docker ps -qf "ancestor=redpandadata/redpanda") rpk topic create analytics.v1
```

## Ingest service env

```
ANALYTICS_KAFKA_BROKERS=localhost:9092
ANALYTICS_KAFKA_TOPIC=analytics.v1
ANALYTICS_KAFKA_CLIENT_ID=mansoni-analytics-ingest
ANALYTICS_INGEST_PORT=4010
```
