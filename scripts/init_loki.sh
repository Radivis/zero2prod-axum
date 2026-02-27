#!/usr/bin/env bash
set -x
set -eo pipefail

# Check if Loki container is already running
RUNNING_LOKI=$(docker ps --filter 'name=loki' --format '{{.ID}}')
if [[ -n $RUNNING_LOKI ]]; then
  echo >&2 "There is a Loki container already running, kill it with:"
  echo >&2 "    docker kill ${RUNNING_LOKI}"
  exit 1
fi

# Check if Promtail container is already running
RUNNING_PROMTAIL=$(docker ps --filter 'name=promtail' --format '{{.ID}}')
if [[ -n $RUNNING_PROMTAIL ]]; then
  echo >&2 "There is a Promtail container already running, kill it with:"
  echo >&2 "    docker kill ${RUNNING_PROMTAIL}"
  exit 1
fi

# Check if Grafana container is already running
RUNNING_GRAFANA=$(docker ps --filter 'name=grafana' --format '{{.ID}}')
if [[ -n $RUNNING_GRAFANA ]]; then
  echo >&2 "There is a Grafana container already running, kill it with:"
  echo >&2 "    docker kill ${RUNNING_GRAFANA}"
  exit 1
fi

# Get the absolute path to the project root (where the script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Launch Loki
echo >&2 "Starting Loki..."
docker run \
  -d \
  --name "loki_$(date '+%s')" \
  -p "3100:3100" \
  -v "${PROJECT_ROOT}/loki-config.yaml:/etc/loki/local-config.yaml:ro" \
  grafana/loki:3.0.0 \
  -config.file=/etc/loki/local-config.yaml

# Wait for Loki to be ready
echo >&2 "Waiting for Loki to be ready..."
until curl -s http://localhost:3100/ready > /dev/null 2>&1; do
  sleep 1
done
echo >&2 "Loki is ready!"

# Launch Promtail
echo >&2 "Starting Promtail..."
docker run \
  -d \
  --name "promtail_$(date '+%s')" \
  -v "${PROJECT_ROOT}/promtail-config.yaml:/etc/promtail/config.yaml:ro" \
  -v /var/lib/docker/containers:/var/lib/docker/containers:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --network host \
  grafana/promtail:3.0.0 \
  -config.file=/etc/promtail/config.yaml

echo >&2 "Promtail is ready!"

# Launch Grafana
echo >&2 "Starting Grafana..."
docker run \
  -d \
  --name "grafana_$(date '+%s')" \
  -p "3000:3000" \
  -e "GF_SECURITY_ADMIN_USER=admin" \
  -e "GF_SECURITY_ADMIN_PASSWORD=admin" \
  -e "GF_USERS_ALLOW_SIGN_UP=false" \
  -v "${PROJECT_ROOT}/grafana-datasource.yaml:/etc/grafana/provisioning/datasources/datasource.yaml:ro" \
  --network host \
  grafana/grafana:11.0.0

# Wait for Grafana to be ready
echo >&2 "Waiting for Grafana to be ready..."
until curl -s http://localhost:3000/api/health > /dev/null 2>&1; do
  sleep 1
done

echo >&2 ""
echo >&2 "======================================"
echo >&2 "Logging stack is ready!"
echo >&2 "======================================"
echo >&2 ""
echo >&2 "Grafana UI: http://localhost:3000"
echo >&2 "  Username: admin"
echo >&2 "  Password: admin"
echo >&2 ""
echo >&2 "Loki API: http://localhost:3100"
echo >&2 ""
echo >&2 "To view logs:"
echo >&2 "  1. Open http://localhost:3000"
echo >&2 "  2. Navigate to Explore (compass icon)"
echo >&2 "  3. Select 'Loki' data source"
echo >&2 "  4. Try query: {container_name=~\".*zero2prod.*\"}"
echo >&2 ""
