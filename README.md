# Cloudflare Worker - Mirrors

This is a Cloudflare Worker that mirrors to another HTTP connection.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Cnily03/cf-worker-mirrors)

## Supported sites

- [x] Proxy Server
- [x] Git Repositories
- [x] [Docker Hub](https://hub.docker.com)
- [ ] [PyPI](https://pypi.org)
- [ ] [NPM](https://www.npmjs.com)

## Getting Started

### Installation

Run the following command to install dependencies:

```bash
bun install
```

Other package managers can be used as well.

To start a development server, run:

```bash
bun run dev
```

Or to deploy to Cloudflare Workers, run:

```bash
bun run deploy
```

### Configuration

Create file `.dev.vars` at the root of the project and add the following content:

```env
SIGN_SECRET="<your secret>" # This is the secret key for signature
```

For more information about secrets, please refer to [Secrets - Cloudflare Workers docs](https://developers.cloudflare.com/workers/configuration/secrets/).

Move [wrangler.sample.toml](./wrangler.sample.toml) to `wrangler.toml` and modify environment variables to match your configuration.

```toml
# The version of your worker
VERSION = "2.1.0"
# This is the identifier of your worker service
SERVICE_NAME = "cf-worker-mirrors"
# Subdomains will be matched based on this value
# i.e. For docker, the subdomain will be `docker.example.com`
DOMAINS = ["example.com"]
# Convert `text/html` Content-Type to `text/plain` on fallback proxy
FORBID_HTML = true
```

## License

CopyRight (c) Cnily03. All rights reserved.

Licensed under the [MIT](./LICENSE) License.
