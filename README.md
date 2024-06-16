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

For `SECURE_CONFIG` environment variable, you can use the following JSON format:

```javascript
{
  "AllowHTML": 0, // Allow responsing HTML
  "EnableMainSite": 1, // Expose to main domain
  "EnableSubDomain": 1, // Expose to sub domain
  "MainSiteDomain": [
    // type * to match all domain
    "example.com" // example.com is allowed
  ],
  "SubKeyList": [
    "abcde" // abcde.example.com is allowed
  ]
}
```
