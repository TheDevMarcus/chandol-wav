#!/bin/sh
# usage: radio-admin.sh clear | delete <msg id> | delete-name <name> | drop "<song name>" | skip | clear-queue
KEY=$(cat ~/.config/chandol/radio-admin-key)
case "$1" in
  delete) BODY="{\"key\":\"$KEY\",\"action\":\"delete\",\"id\":$2}" ;;
  drop) BODY="{\"key\":\"$KEY\",\"action\":\"drop\",\"songKey\":\"$2\"}" ;;
  delete-name) BODY="{\"key\":\"$KEY\",\"action\":\"delete-name\",\"name\":\"$2\"}" ;;
  *) BODY="{\"key\":\"$KEY\",\"action\":\"$1\"}" ;;
esac
curl -s -X POST -H 'content-type: application/json' --data "$BODY" https://YOUR-RADIO-WORKER.YOUR-SUBDOMAIN.workers.dev/admin; echo
