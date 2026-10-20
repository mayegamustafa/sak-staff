#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-time preparation of a fresh Ubuntu 24.04 VPS for SAK Staffing.
# Run as root, once, right after the VPS is created:
#
#   curl -fsSL https://raw.githubusercontent.com/mayegamustafa/sak-staff/main/deploy/server-setup.sh -o setup.sh
#   less setup.sh          # read it first
#   bash setup.sh
#
# It: updates the system · turns on automatic security updates · adds swap ·
# installs Docker · sets up the firewall (SSH, HTTP, HTTPS only) · enables
# fail2ban · creates your admin login and a restricted `deploy` user · turns
# off root and password logins (only if an SSH key is in place, so you cannot
# be locked out) · clones the app into /opt/sak-staffing.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ADMIN_USER="${ADMIN_USER:-sakadmin}"
REPO_URL="${REPO_URL:-https://github.com/mayegamustafa/sak-staff.git}"
APP_DIR=/opt/sak-staffing

[ "$(id -u)" -eq 0 ] || { echo "Run as root." >&2; exit 1; }
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

say "Updating the system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -yq upgrade
apt-get -yq install ca-certificates curl git ufw fail2ban unattended-upgrades

say "Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Africa/Kampala || true

say "Swap (protects the 4 GB server during builds)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

say "Firewall: allow SSH, HTTP, HTTPS only"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

say "fail2ban (blocks SSH password guessing)"
systemctl enable --now fail2ban

say "Admin user '$ADMIN_USER' (log in as this from now on)"
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN_USER"
  usermod -aG sudo,docker "$ADMIN_USER"
  echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$ADMIN_USER"
  chmod 440 "/etc/sudoers.d/90-$ADMIN_USER"
fi
if [ -s /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
  install -m 600 -o "$ADMIN_USER" -g "$ADMIN_USER" /root/.ssh/authorized_keys "/home/$ADMIN_USER/.ssh/authorized_keys"
fi

say "Restricted 'deploy' user (used only by GitHub to trigger updates)"
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
  usermod -aG docker deploy
fi
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
install -d -m 700 -o deploy -g deploy /var/backups/sak-staffing

say "Application code in $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
install -d -o deploy -g deploy "$APP_DIR/downloads"
chown -R deploy:deploy "$APP_DIR"
chmod +x "$APP_DIR"/deploy/*.sh
# Everything in $APP_DIR is run as the deploy user:  sudo -iu deploy

say "SSH hardening"
if [ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/90-sak-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
  systemctl reload ssh || systemctl reload sshd
  echo "Root login and password login are now OFF. Log in with:  ssh $ADMIN_USER@<server-ip>"
else
  echo "WARNING: no SSH key found for root, so password login was left ON."
  echo "Add your public key (docs/KVM-SETUP.md step 1) and re-run this script."
fi

say "Done"
cat <<EOF

Next steps (docs/KVM-SETUP.md):
  1. Open a NEW terminal and check you can log in:  ssh $ADMIN_USER@<server-ip>
     (keep this root session open until that works)
  2. sudo -iu deploy
     cd $APP_DIR && cp .env.docker.example .env.docker && chmod 600 .env.docker && nano .env.docker
EOF
