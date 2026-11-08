#!/usr/bin/env bash
# Moves the GitHub Pages site to a custom domain, but only once its DNS points to GitHub Pages.
# Usage: scripts/activate-domain.sh diagonalecalcio.it
set -euo pipefail
DOMAIN="${1:?usage: $0 <domain>}"
REPO="${REPO:-iltempe/diagonale}"
GH_IPS="185.199.108.153 185.199.109.153 185.199.110.153 185.199.111.153"

echo "Checking DNS for ${DOMAIN}…"
A=$(dig +short A "${DOMAIN}" | sort | tr '\n' ' ')
WWW=$(dig +short CNAME "www.${DOMAIN}" | tr '\n' ' ')
ok=1
for ip in $GH_IPS; do [[ " $A " == *" $ip "* ]] || ok=0; done
if [[ $ok -ne 1 ]]; then
  echo "✗ ${DOMAIN} A records are '$A' — expected all of: $GH_IPS"
  echo "  The site was NOT changed (switching now would redirect visitors to a dead domain)."
  exit 1
fi
[[ "$WWW" == *"github.io."* ]] || echo "! www.${DOMAIN} has no CNAME to <user>.github.io (optional but recommended)"

echo "✓ DNS ok. Configuring the repository…"
gh variable set PAGES_DOMAIN --repo "${REPO}" --body "${DOMAIN}"
gh api -X PUT "repos/${REPO}/pages" -f cname="${DOMAIN}" >/dev/null
gh workflow run pages.yml --repo "${REPO}"
echo "✓ Custom domain set and deploy started. HTTPS is enabled once GitHub issues the certificate:"
echo "  gh api -X PUT repos/${REPO}/pages -F https_enforced=true   # run when the certificate is ready"
