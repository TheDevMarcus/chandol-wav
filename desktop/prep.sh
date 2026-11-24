#!/bin/sh
set -e
cd "$(dirname "$0")/.."
OUT="desktop/dist"
rm -rf "$OUT" && mkdir -p "$OUT/data"
cp -r index.html css js img "$OUT/"
cp data/released-meta.json data/tracker-index.json data/eras.json data/about.json "$OUT/data/"
if [ -d data/lyrics ]; then cp -r data/lyrics "$OUT/data/"; cp data/lyrics-index.json "$OUT/data/"; fi
rm -rf "$OUT/js/radio" "$OUT/css/radio"
echo "prepped $OUT"
