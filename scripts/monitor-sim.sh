#!/bin/bash
# monitor-sim.sh — logs CPU/RAM of the iOS Simulator app process over time.
#
# Simulator apps run as regular macOS processes, so we sample them with `ps`
# in a loop and timestamp each line with `ts` (moreutils), matching the same
# logging style used for `expo start` output.
#
# Usage:
#   ./scripts/monitor-sim.sh ["Process Match" [interval-seconds [logfile]]]
#
# Examples:
#   ./scripts/monitor-sim.sh
#   ./scripts/monitor-sim.sh "Bleacher Rentals Driver" 1 ./expo-log-perf.txt
#   ./scripts/monitor-sim.sh "Bleacher Rentals Driver Dev" 2

set -uo pipefail

APP_MATCH="${1:-Bleacher Rentals Driver}"
INTERVAL="${2:-1}"
LOGFILE="${3:-./expo-log-perf.txt}"

if ! command -v ts >/dev/null 2>&1; then
  echo "error: 'ts' (moreutils) not found. Install with: brew install moreutils" >&2
  exit 1
fi

echo "Watching for process matching: \"$APP_MATCH\" (sampling every ${INTERVAL}s, logging to $LOGFILE)"

{
  while true; do
    PID=$(pgrep -f "$APP_MATCH" | head -n1)
    if [ -n "$PID" ]; then
      echo "found pid $PID, monitoring..."
      while kill -0 "$PID" 2>/dev/null; do
        ps -o pid,%cpu,%mem,rss,vsz,etime -p "$PID" | tail -n1
        sleep "$INTERVAL"
      done
      echo "process $PID exited, re-watching..."
    fi
    sleep 1
  done
} | ts '%Y-%m-%d %H:%M:%.S' | tee -a "$LOGFILE"
