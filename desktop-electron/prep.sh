#!/bin/sh
set -e
cd "$(dirname "$0")"
SITE=".."
OUT="dist"
rm -rf "$OUT" && mkdir -p "$OUT/data"
cp -r "$SITE/index.html" "$SITE/css" "$SITE/js" "$SITE/img" "$OUT/"
cp "$SITE/data/released-meta.json" "$SITE/data/tracker-index.json" "$SITE/data/eras.json" "$SITE/data/about.json" "$OUT/data/"
if [ -d "$SITE/data/lyrics" ]; then cp -r "$SITE/data/lyrics" "$OUT/data/"; cp "$SITE/data/lyrics-index.json" "$OUT/data/"; fi
rm -rf "$OUT/js/radio" "$OUT/css/radio"
echo "prepped $OUT"
