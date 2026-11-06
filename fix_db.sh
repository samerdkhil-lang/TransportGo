#!/usr/bin/env bash
# fix_db.sh - Diagnostic et reparation de la base MySQL "transport" (Ubuntu)
#
# Utilisation :
#   chmod +x fix_db.sh
#   ./fix_db.sh                      (demande le mot de passe de app_user)
#   DB_PASS=MonMotDePasse ./fix_db.sh
#
# Le script n'utilise pas "set -e" : chaque etape verifie son resultat,
# affiche OK / ECHEC / ATTENTION, puis continue ou s'arrete avec une explication.

DB_NAME="${DB_NAME:-transport}"
DB_USER="${DB_USER:-app_user}"
DB_PASS="${DB_PASS:-}"
SCHEMA_FILE="${SCHEMA_FILE:-}"

OK=0; FAIL=0; WARN=0
ADMIN_MODE=""
ROOT_PASS=""

green()  { printf '\033[32m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
titre()  { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok()     { green  "[OK]      $*"; OK=$((OK+1)); }
fail()   { red    "[ECHEC]   $*"; FAIL=$((FAIL+1)); }
warn()   { yellow "[ATTENTION] $*"; WARN=$((WARN+1)); }

resume() {
  titre "Resume"
  echo "OK : $OK   ATTENTION : $WARN   ECHEC : $FAIL"
  if [ "$FAIL" -eq 0 ]; then
    green "Tout est bon. Tu peux tester DBeaver et l'API (tunnel ouvert sur Windows)."
  else
    red "Il reste des echecs : lis les messages ci-dessus et renvoie-les moi."
  fi
}

stop_ici() { fail "$1"; resume; exit 1; }

# Commande SQL en administrateur
run_admin() {
  if [ "$ADMIN_MODE" = "socket" ]; then
    sudo mysql "$@"
  else
    MYSQL_PWD="$ROOT_PASS" mysql -u root "$@"
  fi
}

# Commande SQL en app_user via TCP (comme DBeaver et l'API)
run_user() {
  MYSQL_PWD="$DB_PASS" mysql -h 127.0.0.1 -P "${DB_PORT:-3306}" -u "$DB_USER" "$@"
}

# ---------------------------------------------------------------
titre "1. Client MySQL"
if command -v mysql >/dev/null 2>&1; then
  ok "Client mysql installe : $(mysql --version 2>/dev/null)"
else
  warn "Client mysql absent, tentative d'installation"
  if sudo apt-get install -y mysql-client >/dev/null 2>&1 && command -v mysql >/dev/null 2>&1; then
    ok "mysql-client installe"
  else
    stop_ici "Impossible d'installer le client. Lance : sudo apt update && sudo apt install mysql-server"
  fi
fi

# ---------------------------------------------------------------
titre "2. Service MySQL"
SERVICE=""
for s in mysql mysqld mariadb; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^${s}.service"; then SERVICE="$s"; break; fi
done
[ -z "$SERVICE" ] && stop_ici "Aucun service MySQL/MariaDB trouve. Installe-le : sudo apt install mysql-server"
ok "Service detecte : $SERVICE"

if systemctl is-active --quiet "$SERVICE"; then
  ok "Le service $SERVICE est actif"
else
  warn "Le service $SERVICE est arrete, demarrage..."
  sudo systemctl start "$SERVICE"
  sleep 3
  if systemctl is-active --quiet "$SERVICE"; then
    ok "Service demarre"
  else
    echo "--- Dernieres lignes du journal ---"
    sudo journalctl -u "$SERVICE" -n 15 --no-pager 2>/dev/null
    stop_ici "MySQL ne demarre pas (voir le journal ci-dessus)"
  fi
fi
sudo systemctl enable "$SERVICE" >/dev/null 2>&1 && ok "Demarrage automatique active"

# ---------------------------------------------------------------
titre "3. Acces administrateur"
if sudo mysql -e "SELECT 1;" >/dev/null 2>&1; then
  ADMIN_MODE="socket"
  ok "Acces admin via sudo mysql"
else
  warn "sudo mysql refuse, essai avec le mot de passe root MySQL"
  read -r -s -p "Mot de passe root MySQL (vide pour abandonner) : " ROOT_PASS; echo
  [ -z "$ROOT_PASS" ] && stop_ici "Acces admin impossible"
  if MYSQL_PWD="$ROOT_PASS" mysql -u root -e "SELECT 1;" >/dev/null 2>&1; then
    ADMIN_MODE="password"
    ok "Acces admin via mot de passe root"
  else
    stop_ici "Mot de passe root refuse"
  fi
fi

# ---------------------------------------------------------------
titre "4. Port et reseau"
DB_PORT="$(run_admin -N -e "SELECT @@port;" 2>/dev/null | tr -d '[:space:]')"
[ -z "$DB_PORT" ] && DB_PORT=3306 && warn "Port non lu, 3306 suppose"
ok "Port MySQL : $DB_PORT"

SKIPNET="$(run_admin -N -e "SELECT @@skip_networking;" 2>/dev/null | tr -d '[:space:]')"
if [ "$SKIPNET" = "1" ]; then
  fail "skip_networking est actif : MySQL refuse le TCP. Retire 'skip-networking' dans /etc/mysql/ puis redemarre."
else
  ok "Le reseau TCP est autorise"
fi

if ss -tln 2>/dev/null | grep -qE "(127\.0\.0\.1|0\.0\.0\.0|\*|\[::\]|\[::1\]):${DB_PORT}\b"; then
  ok "MySQL ecoute sur le port $DB_PORT : $(ss -tln | grep ":${DB_PORT}" | awk '{print $4}' | tr '\n' ' ')"
else
  fail "Rien n'ecoute sur le port $DB_PORT. Le tunnel doit viser le bon port : ssh -L 3307:127.0.0.1:${DB_PORT} ..."
fi

# ---------------------------------------------------------------
titre "5. Mot de passe de $DB_USER"
if [ -z "$DB_PASS" ]; then
  read -r -s -p "Mot de passe voulu pour $DB_USER : " DB_PASS; echo
fi
[ -z "$DB_PASS" ] && stop_ici "Mot de passe vide"
case "$DB_PASS" in
  *"'"*|*'\'*|*' '*) stop_ici "Le mot de passe ne doit pas contenir ' \\ ni espace. Utilise lettres et chiffres." ;;
esac
ok "Mot de passe accepte"

# ---------------------------------------------------------------
titre "6. Base de donnees $DB_NAME"
if run_admin -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/tmp/fixdb_err; then
  ok "Base $DB_NAME presente"
else
  fail "Creation de la base : $(cat /tmp/fixdb_err)"
fi

# ---------------------------------------------------------------
titre "7. Utilisateur $DB_USER"
for H in localhost 127.0.0.1; do
  if run_admin 2>/tmp/fixdb_err <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'${H}' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'${H}' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'${H}';
SQL
  then
    ok "Utilisateur '${DB_USER}'@'${H}' cree/mis a jour avec les droits sur $DB_NAME"
  else
    ERR="$(cat /tmp/fixdb_err)"
    if echo "$ERR" | grep -q "1819"; then
      fail "Mot de passe refuse par la politique de securite pour @${H}. Utilise un mot de passe plus long (majuscule, minuscule, chiffre, symbole)."
    else
      fail "@${H} : $ERR"
    fi
  fi
done
run_admin -e "FLUSH PRIVILEGES;" >/dev/null 2>&1 && ok "Privileges recharges"

# ---------------------------------------------------------------
titre "8. Test de connexion comme DBeaver et l'API"
if run_user "$DB_NAME" -e "SELECT 1;" >/dev/null 2>/tmp/fixdb_err; then
  ok "Connexion TCP 127.0.0.1:${DB_PORT} en tant que $DB_USER reussie"
else
  ERR="$(cat /tmp/fixdb_err)"
  if echo "$ERR" | grep -q "1045"; then
    fail "Erreur 1045 : acces refuse. Verifie le mot de passe saisi, il doit etre identique a l'etape 5."
  elif echo "$ERR" | grep -q "1049"; then
    fail "Erreur 1049 : la base $DB_NAME n'existe pas."
  elif echo "$ERR" | grep -qE "2002|2003"; then
    fail "Erreur 2002/2003 : MySQL ne repond pas sur ce port (voir etape 4)."
  else
    fail "Connexion : $ERR"
  fi
fi

# ---------------------------------------------------------------
titre "9. Tables du schema"
if run_user "$DB_NAME" -e "SELECT 1;" >/dev/null 2>&1; then
  MISSING=""
  for T in users vehicles trips reservations; do
    N="$(run_user "$DB_NAME" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DB_NAME}' AND table_name='${T}';" 2>/dev/null | tr -d '[:space:]')"
    if [ "$N" = "1" ]; then ok "Table $T presente"; else warn "Table $T absente"; MISSING="$MISSING $T"; fi
  done

  if [ -n "$MISSING" ]; then
    if [ -z "$SCHEMA_FILE" ]; then
      for C in "./schema.sql" "$HOME/schema.sql" "$HOME/3si/schema.sql"; do
        [ -f "$C" ] && SCHEMA_FILE="$C" && break
      done
    fi
    if [ -n "$SCHEMA_FILE" ] && [ -f "$SCHEMA_FILE" ]; then
      echo "Fichier trouve : $SCHEMA_FILE"
      read -r -p "Charger ce schema maintenant ? (o/N) " REP
      if [ "$REP" = "o" ] || [ "$REP" = "O" ]; then
        if run_user "$DB_NAME" < "$SCHEMA_FILE" 2>/tmp/fixdb_err; then
          ok "schema.sql charge"
        else
          fail "Chargement du schema : $(cat /tmp/fixdb_err)"
        fi
      else
        warn "Schema non charge"
      fi
    else
      warn "schema.sql introuvable. Copie-le depuis Windows : scp schema.sql hk@UBUNTU_IP:~/  puis relance."
    fi
  fi

  NB="$(run_user "$DB_NAME" -N -e "SELECT COUNT(*) FROM trips;" 2>/dev/null | tr -d '[:space:]')"
  if [ -n "$NB" ]; then
    ok "Trajets dans la table trips : $NB"
  else
    warn "Impossible de lire la table trips"
  fi
else
  warn "Etape ignoree : connexion impossible"
fi

rm -f /tmp/fixdb_err

# ---------------------------------------------------------------
titre "A copier dans s/.env (Windows)"
echo "DB_HOST=127.0.0.1"
echo "DB_PORT=3307"
echo "DB_USER=${DB_USER}"
echo "DB_PASSWORD=<le mot de passe saisi>"
echo "DB_NAME=${DB_NAME}"

resume
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
