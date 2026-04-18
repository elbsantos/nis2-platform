#!/usr/bin/env bash
# scripts/setup-repo.sh
# Run once to initialise the local repo and push to GitHub.
# Usage: bash scripts/setup-repo.sh <github-username> <repo-name>

set -e

GITHUB_USER="${1:?Usage: $0 <github-username> <repo-name>}"
REPO_NAME="${2:?Usage: $0 <github-username> <repo-name>}"

echo "==> Initialising git repository..."
git init
git checkout -b main

echo "==> Creating initial commit..."
git add .
git commit -m "chore: initial project structure

- Monolito Node.js + React 19 + tRPC + Drizzle + MySQL
- Rate limiting com Redis (rateLimit.ts)
- Scanner agentless Shodan + Censys (substitui Nmap)
- NIS2 score por artigo (Art. 21(2)(a)–(j))
- 4 novas tabelas: subscriptions, questionnaire_sessions,
  remediation_items, course_progress
- GitHub Actions CI/CD para Hetzner
- docker-compose para desenvolvimento local

Refs: Plano de desenvolvimento NIS2 PT — Semana 1"

echo ""
echo "==> Repository initialised locally."
echo ""
echo "Next steps:"
echo ""
echo "  1. Cria o repositório no GitHub (privado):"
echo "     https://github.com/new"
echo "     Nome: $REPO_NAME"
echo "     Visibilidade: Private"
echo "     NAO inicializes com README (já temos um)"
echo ""
echo "  2. Liga o repositório remoto e faz push:"
echo "     git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git"
echo "     git push -u origin main"
echo ""
echo "  3. Cria o branch develop:"
echo "     git checkout -b develop"
echo "     git push -u origin develop"
echo ""
echo "  4. No GitHub, define develop como default branch:"
echo "     Settings > Branches > Default branch > develop"
echo ""
echo "  5. Adiciona os GitHub Secrets para CI/CD:"
echo "     Settings > Secrets > Actions:"
echo "     - HETZNER_HOST     (IP do servidor)"
echo "     - HETZNER_USER     (utilizador SSH, ex: ubuntu)"
echo "     - HETZNER_SSH_KEY  (chave privada SSH)"
echo ""
echo "Feito! O pipeline CI/CD vai correr automaticamente em cada push para main."
