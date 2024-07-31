import { Hono } from 'hono';
import type { Env, BlankEnv, MiddlewareHandler } from 'hono/types';
import { createMiddleware } from 'hono/factory';
import { parseFunctional } from '@/utils';

type SubdomainRouteElem<T extends Env = BlankEnv> = {
    sub: string | string[],
    route: Hono<T> | MiddlewareHandler<T>,
    custom?: Record<string, any>
}

interface SubdomainRouteOptions {
    domains: Functional<string[]>
}

const defaultOptions: SubdomainRouteOptions = {
    domains: []
}

export default function subdomain<T extends Env = BlankEnv>(elem: SubdomainRouteElem<T>[], options: Partial<SubdomainRouteOptions> = {}) {
    const opts = Object.assign({}, defaultOptions, options)
    return createMiddleware<T>(async (c, next) => {
        opts.domains = parseFunctional(opts.domains)
        if (typeof opts.domains === 'undefined' || opts.domains.length === 0) return await next()
        for (let e of elem) {
            const urlobj = new URL(c.req.raw.url, 'http://localhost')
            const domains = opts.domains.map(d => [e.sub].flat().map(s => s + '.' + d)).flat()
            // support *
            const regexps = domains.map(e =>
                new RegExp("^" + e.replace(/\./g, '\\.').replace(/\*/g, '.*') + "$")
            )
            if (regexps.some(e => e.test(urlobj.hostname))) {
                if (e.route instanceof Hono) {
                    // hono
                    const req = c.req.raw.clone()
                    req.path_prefix = e.custom?.path_prefix || ''
                    req.custom_data = e.custom
                    return await e.route.fetch(req, c.env, c.executionCtx)
                } else {
                    // middleware
                    return await e.route(c, next)
                }
            }
        }
        await next()
    })
};