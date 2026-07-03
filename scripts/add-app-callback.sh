#!/usr/bin/env bash
# Add the accelerator's origins to the SHARED Cognito app client's callback +
# logout URLs, WITHOUT disturbing anything procap-ui relies on. Run once.
#
#   ./scripts/add-app-callback.sh
#
# The accelerator reuses the same user pool + app client as procap-ui
# (see src/app/auth.config.ts). NOTE: update-user-pool-client is a FULL
# replacement — any field you omit is reset to its default. So we read the
# entire current client config, append our URLs to the two lists, strip the
# read-only fields, and feed the whole object back via --cli-input-json. Every
# other setting (token validity, auth flows, IdPs, scopes) is preserved exactly.
set -euo pipefail

REGION="us-east-1"
POOL_ID="us-east-1_JaPgCz1dO"
CLIENT_ID="45t7vpm9f95t8sg5ofa4plbrs9"

# Origins this app is served from (Cognito matches the exact registered URL).
ADD_CALLBACKS='["https://app.procap.ai","http://localhost:4200"]'
ADD_LOGOUTS='["https://app.procap.ai","http://localhost:4200"]'

echo "Reading current config for client $CLIENT_ID ..."
CURRENT=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "$POOL_ID" --client-id "$CLIENT_ID" --region "$REGION")

# Merge (existing ∪ ours), de-dupe, drop read-only fields update rejects.
INPUT=$(echo "$CURRENT" | jq \
  --argjson addCb "$ADD_CALLBACKS" \
  --argjson addLo "$ADD_LOGOUTS" '
  .UserPoolClient
  | .CallbackURLs = ((.CallbackURLs // []) + $addCb | unique)
  | .LogoutURLs   = ((.LogoutURLs   // []) + $addLo | unique)
  | del(.ClientSecret, .CreationDate, .LastModifiedDate)
')

echo "Callback URLs will become:"; echo "$INPUT" | jq -r '.CallbackURLs[]' | sed 's/^/  - /'
echo "Logout URLs will become:";   echo "$INPUT" | jq -r '.LogoutURLs[]'   | sed 's/^/  - /'

aws cognito-idp update-user-pool-client --region "$REGION" \
  --cli-input-json "$INPUT" >/dev/null

echo "Done. app.procap.ai is now a valid redirect for the accelerator."
