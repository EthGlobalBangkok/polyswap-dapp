#!/usr/bin/env sh

set -eu

image="${1:?listener image is required}"
env_file="${2:-/opt/polyswap/listener.env}"
docker_config="${3:-}"
container="polyswap-listener"
previous_container="${container}-previous"

docker_command() {
  if [ -n "$docker_config" ]; then
    docker --config "$docker_config" "$@"
  else
    docker "$@"
  fi
}

if [ ! -r "$env_file" ]; then
  echo "Listener environment file is not readable: $env_file" >&2
  exit 1
fi

docker_command pull "$image"
docker rm -f "$previous_container" >/dev/null 2>&1 || true

had_previous=false
if docker container inspect "$container" >/dev/null 2>&1; then
  had_previous=true
  docker stop "$container"
  docker rename "$container" "$previous_container"
fi

rollback() {
  echo "The new listener did not start; restoring the previous container." >&2
  docker logs "$container" >&2 || true
  docker rm -f "$container" >/dev/null 2>&1 || true

  if [ "$had_previous" = true ]; then
    docker rename "$previous_container" "$container"
    docker start "$container"
  fi

  exit 1
}

if ! docker run --detach \
  --name "$container" \
  --restart unless-stopped \
  --stop-timeout 30 \
  --init \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  --env-file "$env_file" \
  "$image"; then
  rollback
fi

sleep 10

if [ "$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)" != "true" ]; then
  rollback
fi

if [ "$had_previous" = true ]; then
  docker rm "$previous_container" >/dev/null
fi

echo "Listener deployed: $image"
