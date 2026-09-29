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

The `production` workflow runs only when manually dispatched from `main`. It builds the exact commit first, then receives short-lived AWS credentials through GitHub OIDC. The IAM role may run `AWS-RunShellScript` only on the named Outbox instance; the instance has a separate read-only GitHub deploy key. GitHub stores no EC2 SSH private key or production `.env` file. The deploy script takes a lock, fetches that commit, rebuilds containers, checks `/health`, and rolls back application code if the health check fails. Database migrations must remain backward compatible.

Repository variables: `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, and `AWS_INSTANCE_ID`. The AWS role trusts only this repository's immutable numeric identity on `main`. An instance profile with `AmazonSSMManagedInstanceCore` keeps the Systems Manager agent connected; the security group restricts SSH to the maintainer's current IP, while 80 and 443 are public for Caddy HTTPS.

A stable Elastic IP and `sslip.io` DNS hostname provide HTTPS without purchasing a domain. Register the *exact* deployed `/auth/google/callback` and `/auth/slack/callback` URLs in the providers before expecting those login/connection flows to work. Google may require a domain that the candidate owns for production OAuth; if it refuses the free hostname, acquire a domain and update `PUBLIC_URL` and both provider clients. Email/password sign-in remains available meanwhile.

## Backups and recovery

Run `bash deploy/backup.sh /private/backup/path` before a release. Backups contain tenant data and OAuth secrets; store them encrypted and restrict access. Keep an off-host copy. The script does not upload data anywhere.

Redis AOF and Postgres volumes survive ordinary container restarts. Never use `docker compose down -v` on production. After restoring a database backup into an isolated environment, the worker reconciles missing scheduled jobs into Redis. Do not replay an old backup into a live sender blindly: deliveries made after the backup could be duplicated. Verify restore procedures and mail status before enabling a recovered worker.

## Delivery semantics

Ethereal captures messages for preview; it does not deliver to real recipient inboxes. SMTP is transport encrypted, not end-to-end encrypted. Ambiguous SMTP outcomes remain failed rather than automatically resending. The queue dashboard spans tenants and is administrator-only in production.
