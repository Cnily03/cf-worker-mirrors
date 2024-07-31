# Cloudflare Worker - Mirrors

This is a Cloudflare Worker that mirrors to another HTTP connection.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Cnily03/cf-worker-mirrors)

## Supported sites

- [x] Proxy Server
- [x] Git Repositories
- [x] [Docker Hub](https://hub.docker.com)
- [ ] [PyPI](https://pypi.org)
- [ ] [NPM](https://www.npmjs.com)

## Configuration

Create file `.dev.vars` at the root of the project and add the following content:

```env
SIGN_SECRET="<your secret>" # This is the secret key for signature
```

For more information about secrets, please refer to [Secrets - Cloudflare Workers docs](https://developers.cloudflare.com/workers/configuration/secrets/).

Modify environment variables in [wrangler.deploy.toml](./wrangler.deploy.toml) to match your configuration.

```toml
# This is the identifier of your worker service
SERVICE_NAME = "cf-worker-mirrors"
# Subdomains will be matched based on this value
# i.e. For docker, the subdomain will be `docker.example.com`
DOMAINS = ["example.com"]
# Convert `text/html` Content-Type to `text/plain` on fallback proxy
FORBID_HTML = true
```

## Development

This project will be refactored and updated in the future.
