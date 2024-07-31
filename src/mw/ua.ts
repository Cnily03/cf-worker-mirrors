import { Hono } from 'hono';
import type { Env, BlankEnv, MiddlewareHandler } from 'hono/types';
import type { UserAgentTest } from '@/utils';
import { createMiddleware } from 'hono/factory';
import { parseUA, testUA } from '@/utils';

type UARouteElem<T extends Env = BlankEnv> = {
    test: UserAgentTest,
    route: Hono<T> | MiddlewareHandler<T>,
    pathPrefix?: string,
    custom?: Record<string, any>
}

interface UARouteOptions {
    toLower: boolean
}

const defaultOptions: UARouteOptions = {
    toLower: false
}

export default function ua<T extends Env = BlankEnv>(elem: UARouteElem<T> | UARouteElem<T>[], options: Partial<UARouteOptions> = {}) {
    const opts = Object.assign({}, defaultOptions, options)
    if (!Array.isArray(elem)) elem = [elem]
    return createMiddleware<T>(async (c, next) => {
        const _ua = c.req.header('User-Agent') || ''
        let uas = parseUA(_ua, opts.toLower)
        for (const w of elem) {
            if (uas.some(e => testUA(e, w.test))) {
                if (w.route instanceof Hono) {
                    // hono
                    const req = c.req.raw.clone()
                    req.path_prefix = w.pathPrefix || ''
                    req.custom_data = w.custom
                    return await w.route.fetch(req, c.env, c.executionCtx)
                } else {
                    // middleware
                    return await w.route(c, next)
                }
            }
        }
        await next()
    })
};