#!/usr/bin/env bash
# Prepara una VPS Ubuntu 24.04 limpia: actualizaciones, usuario "deploy",
# firewall, fail2ban, swap y Docker. Se corre como root, UNA vez:
#
#   bash bootstrap-server.sh            # paso 1: todo menos cerrar SSH
#   bash bootstrap-server.sh lock-ssh   # paso 2 (solo tras probar login con llave)
#
# El script NO toca ni pide contrasenas: tu llave publica SSH se copia de
# /root/.ssh/authorized_keys al usuario "deploy". La contrasena de "deploy"
# (para sudo) la defines tu a mano con `passwd deploy`.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root." >&2; exit 1; }
DEPLOY_USER=deploy
SSH_PORT=22

if [ "${1:-}" = "lock-ssh" ]; then
  [ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ] || { echo "No hay llave para $DEPLOY_USER; no se cierra SSH." >&2; exit 1; }
  cat > /etc/ssh/sshd_config.d/99-hardening.conf <<CONF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
CONF
  sshd -t
  systemctl reload ssh
  echo "SSH cerrado: sin root, sin contrasenas. Mantén abierta tu sesion actual y prueba entrar en otra terminal ANTES de cerrarla."
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ufw fail2ban unattended-upgrades git curl ca-certificates gnupg cron

# --- Usuario deploy (sudo) con tu llave SSH ---------------------------------
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -s /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
else
  echo "AVISO: /root/.ssh/authorized_keys vacio; anade tu llave a /home/$DEPLOY_USER/.ssh/authorized_keys antes de 'lock-ssh'."
fi

# --- Firewall: solo SSH, HTTP y HTTPS ---------------------------------------
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT"/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# --- fail2ban para SSH ------------------------------------------------------
cat > /etc/fail2ban/jail.d/sshd.local <<CONF
[sshd]
enabled = true
port = $SSH_PORT
maxretry = 5
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban
systemctl restart fail2ban

# --- Actualizaciones de seguridad automaticas -------------------------------
dpkg-reconfigure -f noninteractive unattended-upgrades

# --- Swap de 4 GB (los builds de Docker/Angular pueden picar en memoria) -----
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- Docker (repositorio oficial) -------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"
systemctl enable --now docker

cat <<MSG

Listo. Siguientes pasos (a mano, tu):
  1) passwd $DEPLOY_USER                      (define la clave para sudo)
  2) En OTRA terminal: ssh $DEPLOY_USER@<IP>  (debe entrar con tu llave)
  3) Como root:  bash bootstrap-server.sh lock-ssh
MSG
