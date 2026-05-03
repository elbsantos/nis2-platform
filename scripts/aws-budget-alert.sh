#!/usr/bin/env bash
# scripts/aws-budget-alert.sh
#
# Cost Protection 1 — AWS monthly budget with email alerts.
#
# Creates a $20/month budget with 3 alert thresholds:
#   50 %  forecasted  → early warning
#   80 %  forecasted  → approaching limit
#  100 %  actual      → limit reached (stop if auto-action is enabled)
#
# Usage:
#   AWS_ACCOUNT_ID=123456789012 \
#   ALERT_EMAIL=emerson.burghi@gmail.com \
#   bash scripts/aws-budget-alert.sh
#
# Optional environment variables:
#   BUDGET_LIMIT_USD   — monthly limit in USD  (default: 20)
#   BUDGET_NAME        — name for the budget   (default: nis2-platform-monthly)
#
# Prerequisites:
#   - AWS CLI v2 installed and configured (aws configure)
#   - IAM permission: budgets:CreateBudget
#   - Run once per AWS account (idempotent: re-running updates the budget)

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
ACCOUNT_ID="${AWS_ACCOUNT_ID:?'Set AWS_ACCOUNT_ID=<your 12-digit account id>'}"
EMAIL="${ALERT_EMAIL:?'Set ALERT_EMAIL=<your email>'}"
LIMIT="${BUDGET_LIMIT_USD:-20}"
NAME="${BUDGET_NAME:-nis2-platform-monthly}"

echo "[Budget] Conta AWS : $ACCOUNT_ID"
echo "[Budget] Email     : $EMAIL"
echo "[Budget] Limite    : \$$LIMIT/mês"
echo "[Budget] Nome      : $NAME"
echo ""

# ── Create or update budget ───────────────────────────────────────────────────
aws budgets create-budget \
  --account-id "$ACCOUNT_ID" \
  --budget "{
    \"BudgetName\": \"$NAME\",
    \"BudgetLimit\": {
      \"Amount\": \"$LIMIT\",
      \"Unit\": \"USD\"
    },
    \"TimeUnit\": \"MONTHLY\",
    \"BudgetType\": \"COST\"
  }" \
  --notifications-with-subscribers "[
    {
      \"Notification\": {
        \"NotificationType\": \"FORECASTED\",
        \"ComparisonOperator\": \"GREATER_THAN\",
        \"Threshold\": 50,
        \"ThresholdType\": \"PERCENTAGE\",
        \"NotificationState\": \"ALARM\"
      },
      \"Subscribers\": [
        { \"SubscriptionType\": \"EMAIL\", \"Address\": \"$EMAIL\" }
      ]
    },
    {
      \"Notification\": {
        \"NotificationType\": \"FORECASTED\",
        \"ComparisonOperator\": \"GREATER_THAN\",
        \"Threshold\": 80,
        \"ThresholdType\": \"PERCENTAGE\",
        \"NotificationState\": \"ALARM\"
      },
      \"Subscribers\": [
        { \"SubscriptionType\": \"EMAIL\", \"Address\": \"$EMAIL\" }
      ]
    },
    {
      \"Notification\": {
        \"NotificationType\": \"ACTUAL\",
        \"ComparisonOperator\": \"GREATER_THAN\",
        \"Threshold\": 100,
        \"ThresholdType\": \"PERCENTAGE\",
        \"NotificationState\": \"ALARM\"
      },
      \"Subscribers\": [
        { \"SubscriptionType\": \"EMAIL\", \"Address\": \"$EMAIL\" }
      ]
    }
  ]" 2>/dev/null \
  || aws budgets update-budget \
       --account-id "$ACCOUNT_ID" \
       --new-budget "{
         \"BudgetName\": \"$NAME\",
         \"BudgetLimit\": {
           \"Amount\": \"$LIMIT\",
           \"Unit\": \"USD\"
         },
         \"TimeUnit\": \"MONTHLY\",
         \"BudgetType\": \"COST\"
       }"

echo ""
echo "[Budget] ✓ Orçamento '$NAME' criado/actualizado com sucesso."
echo ""
echo "Alertas configurados:"
echo "  • 50% previsto  (~\$$(echo "$LIMIT * 0.5" | bc)) → aviso antecipado"
echo "  • 80% previsto  (~\$$(echo "$LIMIT * 0.8" | bc)) → a aproximar-se do limite"
echo "  • 100% real     (\$$LIMIT) → limite atingido"
echo ""
echo "Emails de alerta enviados para: $EMAIL"
echo ""
echo "Para verificar o orçamento:"
echo "  aws budgets describe-budget --account-id $ACCOUNT_ID --budget-name $NAME"
