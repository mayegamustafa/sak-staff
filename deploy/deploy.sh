#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Update the running system to the latest commit on GitHub.
#
# Run automatically by GitHub Actions after every push to main (see
# .github/workflows/deploy.yml), or by hand on the server:
#
#   /opt/sak-staffing/deploy/deploy.sh            # deploy if there is something new
#   /opt/sak-staffing/deploy/deploy.sh --force    # rebuild even if up to date
#
# Steps: back up the database → fetch the new code → build the new image while
# the old one keeps serving → swap containers (migrations run on start) → wait
# for the health check → if it fails, put the previous code back.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Everything lives in main(): bash reads scripts as it runs them, and this file
# is itself replaced by `git reset` below, so it must be fully parsed first.
main() {
  local app_dir branch force prev new
  app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  branch="${DEPLOY_BRANCH:-main}"
  force="${1:-}"
  cd "$app_dir"

  # One deploy at a time.
  exec 9>"$app_dir/.deploy.lock"
  if ! flock -n 9; then
    echo "Another deploy is already running." >&2
    exit 1
  fi

  [ -f .env.docker ] || { echo "Missing $app_dir/.env.docker – see docs/KVM-SETUP.md" >&2; exit 1; }

  prev="$(git rev-parse HEAD)"
  git fetch --quiet origin "$branch"
  new="$(git rev-parse "origin/$branch")"

  if [ "$prev" = "$new" ] && [ "$force" != "--force" ]; then
    echo "Already running $(git log -1 --format='%h %s' "$new")"
    exit 0
  fi

  log "Deploying $(git log -1 --format='%h %s' "$new")"

  if container_running app; then
    log "Backing up database before deploy…"
    "$app_dir/deploy/backup.sh" pre-deploy
  fi

  git reset --quiet --hard "$new"

  log "Building new version (the current one keeps serving meanwhile)…"
  if ! compose build app; then
    log "Build FAILED – restoring previous code; the running system is unchanged."
    git reset --quiet --hard "$prev"
    exit 1
  fi

  log "Starting new version…"
  if compose up -d --remove-orphans && wait_healthy; then
    log "Deploy succeeded: $(git log -1 --format='%h %s')"
    docker image prune -f >/dev/null
    exit 0
  fi

  log "New version did not start or did not become healthy. Recent logs:"
  compose logs --tail=60 app || true
  log "Rolling back to $(git log -1 --format='%h' "$prev")…"
  git reset --quiet --hard "$prev"
  if compose up -d --build --remove-orphans && wait_healthy; then
    log "Rolled back; the previous version is running again."
  else
    log "WARNING: the previous version is not healthy either – check 'docker compose logs'."
  fi
  log "If the failed version ran a database migration, the pre-deploy backup is in"
  log "${BACKUP_DIR:-/var/backups/sak-staffing}."
  exit 1
}

compose() { docker compose --env-file .env.docker "$@"; }

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }

container_running() {
  [ -n "$(compose ps -q --status running "$1" 2>/dev/null)" ]
}

# Wait up to ~3 minutes for the app's Docker health check (migrations run first).
# Gives up at once if the new container crashes, so a broken release is rolled
# back in seconds rather than after the full timeout.
wait_healthy() {
  local id status restarts i
  for i in $(seq 1 36); do
    id="$(compose ps -aq app)"
    status="$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)"
    restarts="$(docker inspect --format '{{.RestartCount}}' "$id" 2>/dev/null || echo 0)"
    [ "$status" = "healthy" ] && return 0
    if [ "${restarts:-0}" -gt 0 ]; then
      log "App container crashed on start."
      return 1
    fi
    sleep 5
  done
  return 1
}

main "$@"
