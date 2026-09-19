# Hosting SMBify OS

This application needs a long-running Node process and persistent disk because it uses SQLite, schedulers, WebSockets, and local scraper output. A small Ubuntu VPS with Nginx is the simplest reliable production target. Render, Railway, Fly.io, or DigitalOcean App Platform can also work only when a persistent volume is mounted for `db/` and scraper output.

## Production checklist

1. Install Node.js 24, Nginx, and a process manager such as systemd or PM2.
2. Copy the project to `/opt/smbify-os`, run `npm ci`, `npm --prefix client ci`, `npm run migrate`, and `npm run build`.
3. Generate unique secrets for `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY`. Do not reuse development values.
4. Set these environment values:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5050
TRUST_PROXY=1
APP_BASE_URL=https://lead.smbify.net
CLIENT_URL=https://lead.smbify.net
CORS_ORIGIN=https://lead.smbify.net
DATABASE_PATH=/var/lib/smbify/smbify_os.db
SCRAPER_OUTPUT_DIR=/var/lib/smbify/scraper-output
OUTBOUND_EMAIL_ENABLED=false
JWT_SECRET=<64+ random hex characters>
TOKEN_ENCRYPTION_KEY=<64+ random hex characters>
```

5. Serve `client/dist` through Nginx and proxy `/api`, `/public-api`, `/track`, `/unsubscribe`, and WebSocket upgrades to `http://127.0.0.1:5050`.
6. Point `lead.smbify.net` DNS to the server and issue a TLS certificate with Certbot or your hosting provider.
7. Keep outbound email disabled until SMTP login, SPF, DKIM, DMARC, signed unsubscribe URLs, and a test mailbox are verified. Then change `OUTBOUND_EMAIL_ENABLED=true` and restart the service.
8. Back up `/var/lib/smbify` daily. SQLite and uploaded/runtime data must survive deployments.

## Start command

```bash
npm run migrate
npm start
```

Do not deploy this project to a stateless serverless function. Its SQLite database, schedulers, and WebSocket connections require a persistent process and disk.