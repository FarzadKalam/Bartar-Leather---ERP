# Deployment (GitHub Actions + Nginx)

This project is a Vite-built SPA. Production deployment is copying the built `dist/` output to the server.

## What You Get

- CI on every push/PR: install, typecheck, build
- CD on `main`: upload `dist/`, create a timestamped release, switch `current` symlink (atomic deploy), keep rollback history

## Direct Deploy From Laptop

If GitHub Actions is not reachable, you can run the same deployment flow directly from your Windows laptop with PowerShell:

```powershell
npm run deploy:server -- `
  -ServerHost 212.23.201.161 `
  -ServerUser deploy `
  -ServerPort 22 `
  -DeployPath /var/www/erp-mehrbanoo `
  -IdentityFile C:\Users\YourUser\.ssh\erp_deploy
```

The script is at `scripts/deploy.ps1` and it does the same core steps as the GitHub workflow:

- `npm ci`
- `npx tsc --noEmit`
- `npm run build`
- archive `dist/`
- upload with `scp`
- create a timestamped release on the server and switch `current`

You can also pass the server settings through environment variables instead of command arguments:

```powershell
$env:SERVER_HOST = "212.23.201.161"
$env:SERVER_USER = "deploy"
$env:SERVER_PORT = "22"
$env:DEPLOY_PATH = "/var/www/erp-mehrbanoo"
$env:SERVER_SSH_KEY_PATH = "C:\Users\YourUser\.ssh\erp_deploy"
npm run deploy:server
```

Optional switches:

- `-SkipInstall` if `node_modules` is already up to date
- `-SkipTypecheck` if you want faster deploys and accept skipping CI-equivalent validation
- `-SkipBuild` if `dist/` is already built and you only want to upload it
- `-SkipUpload` if the archive is already on the server and you only want to activate it
- `-SkipHostKeyScan` if the server host key is already present in `~/.ssh/known_hosts`

Notes:
- `deploy:server:quick` still runs `npm run build`; it only skips `npm ci` and typecheck. Your local `node_modules` must already contain a healthy `vite` install.
- If you already have a fresh `dist/` and only want to send it, use `deploy:server:uploadonly`.

## GitHub Secrets (Required)

In your GitHub repo: Settings -> Secrets and variables -> Actions -> Repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SERVER_HOST` (example: `212.23.201.161`)
- `SERVER_PORT` (example: `22`)
- `SERVER_USER` (example: `deploy`)
- `SERVER_SSH_KEY` (private key)
- `DEPLOY_PATH` (example: `/var/www/erp-mehrbanoo`)

## Server Setup (One-Time)

## SSH Keys (Windows -> Ubuntu)

You create an SSH key pair. The **public key** goes on the server, the **private key** goes into GitHub Secrets.

- Public key file: `erp_github_actions.pub` (single line starting with `ssh-ed25519 ...`)
- Private key file: `erp_github_actions` (multi-line, starts with `-----BEGIN OPENSSH PRIVATE KEY-----`)

On Windows (PowerShell) to print the public key:

```powershell
Get-Content -Raw .\erp_github_actions.pub
```

On Windows (CMD) to print the public key:

```bat
type erp_github_actions.pub
```

On Ubuntu, `Get-Content` does not exist; use `cat` only if the file is actually on the server.

### 1) Create deploy folder structure

Example:

```bash
sudo mkdir -p /var/www/erp-mehrbanoo/releases
sudo chown -R deploy:deploy /var/www/erp-mehrbanoo
```

### 1.5) First-time cutover (if you currently deploy directly into `/var/www/erp-mehrbanoo`)

If Nginx currently uses `root /var/www/erp-mehrbanoo;` and your files live directly in that folder, do one of these before switching Nginx root to `current`:

Option A (recommended): move current files into an initial release and create `current` symlink:

```bash
sudo mkdir -p /var/www/erp-mehrbanoo/releases/initial
sudo rsync -a --delete /var/www/erp-mehrbanoo/ /var/www/erp-mehrbanoo/releases/initial/ \
  --exclude releases --exclude shared --exclude current
sudo ln -sfn /var/www/erp-mehrbanoo/releases/initial /var/www/erp-mehrbanoo/current
```

Option B: run the GitHub deploy workflow once first (it will create `current`), then switch Nginx root.

### 2) Configure Nginx root to `current`

Change:

- `root /var/www/erp-mehrbanoo;`

To:

- `root /var/www/erp-mehrbanoo/current;`

Keep SPA routing:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 3) Allow HTTP access by IP (optional)

If you want `http://212.23.201.161` to open the app, add a separate port 80 server block for the IP:

```nginx
server {
  listen 80;
  server_name 212.23.201.161;
  root /var/www/erp-mehrbanoo/current;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Notes:
- HTTPS on IP will show certificate mismatch (normal with Let's Encrypt).
- Your current certbot-managed port 80 block returns 404 for non-domain hosts; the extra IP block is the clean fix.

## Supabase URL on HTTPS sites

The browser blocks an `http://` Supabase request when the ERP itself is loaded with `https://`. The production app must therefore use the HTTPS gateway below; it must **not** use `http://212.23.201.161:8000`.

1. Create this DNS record (the project’s local environment already uses this address):

   ```text
   api-mehrbanoo.tazesystem.ir.  A  212.23.201.161
   ```

2. On the server, copy [deploy/nginx/api-mehrbanoo.tazesystem.ir.conf](deploy/nginx/api-mehrbanoo.tazesystem.ir.conf) to `/etc/nginx/sites-available/api-mehrbanoo.tazesystem.ir`, enable it, and validate Nginx. This initial HTTP-only config lets Certbot complete its domain validation:

   ```bash
   sudo ln -s /etc/nginx/sites-available/api-mehrbanoo.tazesystem.ir /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

   Once Certbot enables HTTPS, this config proxies the public Supabase requests to the self-hosted gateway on `127.0.0.1:8000`; do not expose port 8000 publicly.

3. After DNS has propagated, obtain the certificate (and make HTTP redirect to HTTPS) and reload Nginx:

   ```bash
   sudo certbot --nginx --redirect -d api-mehrbanoo.tazesystem.ir
   sudo nginx -t && sudo systemctl reload nginx
   curl -fsSI https://api-mehrbanoo.tazesystem.ir/auth/v1/health
   ```

4. In GitHub Actions → repository **Secrets**, set `VITE_SUPABASE_URL` to exactly:

   ```text
   https://api-mehrbanoo.tazesystem.ir
   ```

   Then redeploy from `main`. The build now refuses an HTTP `VITE_SUPABASE_URL`, so this configuration error cannot be released again.

### 4) Let deploy user reload nginx without password (recommended)

Create `/etc/sudoers.d/deploy-nginx`:

```text
deploy ALL=NOPASSWD: /bin/systemctl reload nginx
```

## Rollback

On server:

```bash
ls -1 /var/www/erp-mehrbanoo/releases
sudo ln -sfn /var/www/erp-mehrbanoo/releases/<OLD_TIMESTAMP> /var/www/erp-mehrbanoo/current
sudo systemctl reload nginx
```
