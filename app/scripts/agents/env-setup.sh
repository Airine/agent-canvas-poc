#!/usr/bin/env bash
# env-setup.sh — demo agent: environment bootstrap with multi-line progress.
# Protocol with the control plane: progress markers + outbox messages under
# $CANVAS_RUN_DIR (default /tmp/canvas-run). Exit code = node result.
set -u
NODE_ID="${1:-n-env}"
RUN_DIR="${CANVAS_RUN_DIR:-/tmp/canvas-run}"
mkdir -p "$RUN_DIR"
OUTBOX="$RUN_DIR/$NODE_ID.outbox"
PROGRESS="$RUN_DIR/$NODE_ID.progress"

step() {
  local pct="$1"; shift
  echo "[env-setup] $*"
  echo "$pct" > "$PROGRESS"
  echo "coord<-env: $*" >> "$OUTBOX"
  sleep 1
}

echo "[env-setup] starting environment bootstrap (node=$NODE_ID)"
step 0.1 "checking toolchain: bash $(bash --version | head -1 | cut -d' ' -f4)"
step 0.3 "mounting workspace volumes ... ok"
step 0.5 "pulling base images (3 layers) ... ok"
step 0.7 "verifying herdr control socket ... ok"
step 0.9 "writing env manifest to /tmp/canvas-run/env.json"
cat > "$RUN_DIR/env.json" <<'EOF'
{"env":"herdr-local","toolchain":"bash","status":"ready"}
EOF
step 1.0 "environment ready"
echo "[env-setup] done"
exit 0
