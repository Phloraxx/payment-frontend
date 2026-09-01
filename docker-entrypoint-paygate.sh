#!/bin/sh
set -eu

PAYGATE_V4_API_URL="${PAYGATE_V4_API_URL:-${PAYGATE_URL:-https://pay.mulearnscet.in}}"
PAYGATE_V4_API_KEY="${PAYGATE_V4_API_KEY:-${PAYGATE_API_KEY:-}}"
: "${PAYGATE_V4_API_KEY:?PAYGATE_V4_API_KEY or PAYGATE_API_KEY is required}"
export PAYGATE_V4_API_URL PAYGATE_V4_API_KEY
exec /docker-entrypoint.sh nginx -g 'daemon off;'
