#!/bin/sh
KEY=$(cat ~/.config/chandol/radio-admin-key)
case "$1" in
  delete) BODY="{\"key\":\"$KEY\",\"action\":\"delete\",\"id\":$2}" ;;
  drop) BODY="{\"key\":\"$KEY\",\"action\":\"drop\",\"songKey\":\"$2\"}" ;;
  delete-name) BODY="{\"key\":\"$KEY\",\"action\":\"delete-name\",\"name\":\"$2\"}" ;;
  *) BODY="{\"key\":\"$KEY\",\"action\":\"$1\"}" ;;
esac
curl -s -X POST -H 'content-type: application/json' --data "$BODY" https://chandolwav-radio.codename1121111.workers.dev/admin; echo
