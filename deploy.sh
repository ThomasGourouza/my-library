#!/usr/bin/env bash
#
# Redéployer la bibliothèque sur Vercel, en une commande.
#
#   ./deploy.sh
#
# Options :
#   --tel-quel   déployer malgré des modifications non committées
#   --rapide     sauter tests / types / lint (le build reste fait)
#
# Le script vérifie d'abord ce qui, dans cette architecture, peut donner un
# déploiement « réussi » mais faux : du code non committé, des données non
# poussées (le site lit `master` sur GitHub, pas votre disque), ou un
# `.env.local` qui partirait dans l'archive. Puis il construit, déploie, et
# vérifie que le site répond vraiment.
#
# Si LIBRARY_PASSWORD est exporté, le contrôle final va jusqu'à se connecter et
# compter les livres. Sinon il s'arrête à la porte, ce qui suffit à prouver que
# l'application a démarré.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$REPO/app"
BRANCHE="${GITHUB_BRANCH:-master}"
SITE="${PROD_URL:-https://my-library-phi-six.vercel.app}"

TEL_QUEL=0
RAPIDE=0
for arg in "$@"; do
  case "$arg" in
    --tel-quel) TEL_QUEL=1 ;;
    --rapide)   RAPIDE=1 ;;
    -h|--help)  awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Option inconnue : $arg (voir --help)" >&2; exit 2 ;;
  esac
done

gras=$'\033[1m'; vert=$'\033[32m'; rouge=$'\033[31m'; jaune=$'\033[33m'; fin=$'\033[0m'
etape() { printf '\n%s▸ %s%s\n' "$gras" "$1" "$fin"; }
ok()    { printf '  %s✓%s %s\n' "$vert" "$fin" "$1"; }
avert() { printf '  %s!%s %s\n' "$jaune" "$fin" "$1"; }
mort()  { printf '\n  %s✗ %s%s\n\n' "$rouge" "$1" "$fin" >&2; exit 1; }

cd "$REPO"

# ---------------------------------------------------------------------------
etape "Contrôles préalables"

[ -d "$APP" ] || mort "Dossier app/ introuvable — lancez le script depuis le dépôt."

# `.env.local` serait téléversé par la CLI, et signifie que l'application locale
# parle à GitHub au lieu du fichier sur le disque.
if [ -f "$APP/.env.local" ]; then
  mort "app/.env.local existe : il partirait dans le déploiement.
     Les variables de production vivent dans Vercel, pas ici.
     Supprimez-le (rm app/.env.local) puis relancez."
fi
ok "pas de .env.local à téléverser"

if [ -n "$(git status --porcelain)" ]; then
  if [ "$TEL_QUEL" -eq 1 ]; then
    avert "modifications non committées — déployées telles quelles (--tel-quel)"
  else
    git status --short | sed 's/^/      /'
    mort "Modifications non committées : le code déployé ne correspondrait à aucun commit.
     Committez, ou relancez avec --tel-quel si c'est voulu."
  fi
else
  ok "arbre de travail propre"
fi

# Le site lit data/library.json sur `master` **via GitHub**. Un commit de
# données non poussé est invisible en ligne, quel que soit le déploiement.
git fetch --quiet origin "$BRANCHE" 2>/dev/null || avert "impossible de joindre origin (hors ligne ?)"
if git rev-parse --verify --quiet "origin/$BRANCHE" >/dev/null; then
  avance=$(git rev-list --count "origin/$BRANCHE..HEAD" 2>/dev/null || echo 0)
  retard=$(git rev-list --count "HEAD..origin/$BRANCHE" 2>/dev/null || echo 0)
  if [ "$avance" -gt 0 ]; then
    avert "$avance commit(s) non poussé(s) : le site lit origin/$BRANCHE, il ne les verra pas."
    avert "   → git push"
  fi
  [ "$retard" -gt 0 ] && avert "$retard commit(s) en retard sur origin/$BRANCHE (git pull)"
  [ "$avance" -eq 0 ] && [ "$retard" -eq 0 ] && ok "synchronisé avec origin/$BRANCHE"
fi

cd "$APP"

# ---------------------------------------------------------------------------
if [ "$RAPIDE" -eq 0 ]; then
  etape "Vérifications"
  npm test --silent >/dev/null 2>&1 || mort "npm test a échoué — lancez 'npm test' dans app/ pour le détail."
  ok "tests"
  npx tsc --noEmit || mort "erreurs de types."
  ok "types"
  npm run lint >/dev/null 2>&1 || mort "eslint a signalé des problèmes — lancez 'npm run lint' dans app/."
  ok "lint"
else
  etape "Vérifications sautées (--rapide)"
fi

# ---------------------------------------------------------------------------
etape "Build local"
# Fait avant le déploiement : une erreur est trouvée en quinze secondes plutôt
# qu'en consommant un des 100 déploiements quotidiens de l'offre Hobby.
npm run build >/dev/null 2>&1 || mort "le build a échoué — lancez 'npm run build' dans app/ pour le détail."
ok "next build"

# ---------------------------------------------------------------------------
etape "Déploiement"
sortie="$(npx vercel --prod 2>&1)" || { echo "$sortie" | tail -20; mort "vercel a refusé le déploiement."; }
url="$(printf '%s' "$sortie" | grep -oE 'https://[a-z0-9.-]*\.vercel\.app' | tail -1)"
echo "$sortie" | grep -q '"readyState": "READY"' || { echo "$sortie" | tail -20; mort "déploiement non prêt."; }
ok "déploiement prêt${url:+ : $url}"

# ---------------------------------------------------------------------------
etape "Contrôle du site en production"
sleep 3

code_racine="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/")"
redir="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 20 "$SITE/")"
case "$redir" in
  */connexion*) ok "la porte répond (307 vers /connexion)" ;;
  *sso-api*)    mort "ce domaine est protégé par l'authentification Vercel, pas par la nôtre.
     Utilisez le domaine de production, ou PROD_URL=… ./deploy.sh" ;;
  *) [ "$code_racine" = "200" ] \
       && avert "la racine répond 200 sans redirection : la porte est-elle désactivée ?" \
       || mort "réponse inattendue sur / : $code_racine" ;;
esac

[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/connexion")" = "200" ] \
  && ok "/connexion s'affiche" || mort "/connexion ne répond pas."

[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SITE/api/books")" = "401" ] \
  && ok "l'API refuse les requêtes non authentifiées (401)" \
  || avert "l'API ne renvoie pas 401 sans cookie — à vérifier."

if [ -n "${LIBRARY_PASSWORD:-}" ]; then
  cookie="$(curl -s -D - -o /dev/null --max-time 30 -X POST "$SITE/api/connexion" \
    -H 'Content-Type: application/json' \
    --data-raw "$(printf '{"password":%s}' "$(printf '%s' "$LIBRARY_PASSWORD" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')")" \
    | grep -i '^set-cookie:' | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1 | tr -d '\r')"
  if [ -z "$cookie" ]; then
    avert "connexion refusée : LIBRARY_PASSWORD ne correspond pas à celui de Vercel."
  else
    ok "connexion acceptée"
    n="$(curl -s --max-time 30 -H "Cookie: $cookie" "$SITE/api/books" \
      | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["books"]))' 2>/dev/null || echo "?")"
    [ "$n" != "?" ] && [ "$n" -gt 0 ] 2>/dev/null \
      && ok "lecture depuis GitHub : $n livres" \
      || mort "l'application ne lit pas les données (vérifiez GITHUB_TOKEN sur Vercel)."
  fi
else
  printf '  %s·%s export LIBRARY_PASSWORD=… pour que le contrôle aille jusqu'"'"'à lire les données\n' "$jaune" "$fin"
fi

printf '\n%s%s✓ En ligne : %s%s\n\n' "$gras" "$vert" "$SITE" "$fin"
