#!/bin/bash
# Chrome Extension 배포 zip 생성
set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": *"\(.*\)".*/\1/')
FILENAME="how-many-time-left-v${VERSION}.zip"

rm -f "$FILENAME"

zip -r "$FILENAME" \
  manifest.json \
  content/ \
  data/ \
  icons/ \
  lib/ \
  popup/ \
  -x '*.DS_Store'

echo "✅ ${FILENAME} ($(du -h "$FILENAME" | cut -f1))"
