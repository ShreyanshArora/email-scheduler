# Production operations

Deployment is deferred until a domain and monthly budget are chosen. No AWS resources have been provisioned by these scripts.

Check the existing AWS identity without displaying credentials:

```sh
aws sts get-caller-identity
aws configure get region
```

Use an Ubuntu EC2 host with Docker Compose, persistent storage, DNS, and HTTPS. Keep Postgres, Redis and Elasticsearch on the private Compose network. Only Caddy exposes ports 80/443. Restrict SSH to your own IP. Size the host for Elasticsearch and Docker image builds; monitor memory before selecting the final instance size.

Copy `.env.production.example` to `.env.production`, fill it on the server, and run `npm run check:deploy`. Set `QUEUE_ADMIN_EMAILS` to trusted administrator accounts. Never commit this file. Configure both providers with `https://YOUR_DOMAIN/auth/google/callback` and `https://YOUR_DOMAIN/auth/slack/callback`.

## Manual GitHub deployment

Create the GitHub environment `production`. Set secrets `EC2_HOST`, `EC2_SSH_KEY`, and `EC2_KNOWN_HOSTS`; verify the host fingerprint through the AWS console or an existing trusted SSH session before saving its known-hosts entry. Set variables `EC2_USER` (default ubuntu) and `DEPLOY_PATH` (default /home/ubuntu/outbox-sde-). The server needs read access to the private repository and the first checkout must contain `deploy/release.sh`.

Run Actions → Deploy → Run workflow on main. It builds first, verifies the SSH host, deploys the exact commit, and checks HTTP health. CI runs separately on pushes and pull requests. No deployment happens merely by pushing code.

The release lock prevents simultaneous releases. Docker grants the worker 120 seconds to drain SMTP work. If application startup or health fails, the previous code is rebuilt. Database migrations are not reversed: migrations must stay backward compatible, and a backup is required before destructive schema changes.

## Backups and recovery

Run `bash deploy/backup.sh /private/backup/path` before a release. Backups contain tenant data and OAuth secrets; store them encrypted and restrict access. Keep an off-host copy. The script does not upload data anywhere.

Redis AOF and Postgres volumes survive ordinary container restarts. Never use `docker compose down -v` on production. After restoring a database backup into an isolated environment, the worker reconciles missing scheduled jobs into Redis. Do not replay an old backup into a live sender blindly: deliveries made after the backup could be duplicated. Verify restore procedures and mail status before enabling a recovered worker.

## Delivery semantics

Ethereal captures messages for preview; it does not deliver to real recipient inboxes. SMTP is transport encrypted, not end-to-end encrypted. Ambiguous SMTP outcomes remain failed rather than automatically resending. The queue dashboard spans tenants and is administrator-only in production.
