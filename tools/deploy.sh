#!/bin/sh
set -e
cd "$(dirname "$0")/.."
rm -rf /tmp/pages && mkdir -p /tmp/pages/data
cp -r index.html css js img /tmp/pages/
cp robots.txt sitemap.xml _redirects /tmp/pages/
cp data/released-meta.json data/tracker-index.json data/eras.json data/about.json /tmp/pages/data/
if [ -d data/lyrics ]; then cp -r data/lyrics /tmp/pages/data/; cp data/lyrics-index.json /tmp/pages/data/; fi
node tools/build-song-pages.mjs /tmp/pages
npx -y wrangler@latest pages deploy /tmp/pages --project-name=chandolwav --branch=main --commit-dirty=true
