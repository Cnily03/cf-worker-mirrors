# Cloudflare Worker - Mirror

This is a Cloudflare Worker that mirrors to another HTTP connection.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Cnily03/cf-worker-mirror)

## Supported sites

- [x] Git Repositories
- [x] [Docker Hub](https://hub.docker.com)
- [x] [GitHub](https://github.com)
- [ ] [PyPI](https://pypi.org)
- [ ] [NPM](https://www.npmjs.com)

## Configuration

Create file `wrangler.prod.env.toml` at the root of the project, as what in [examples/](./examples/) directory shows.

For `SECURE_CONFIG` environment variable, please modify it according to comments and your preferences.

## Development

This project will be refactored and updated in the future.
