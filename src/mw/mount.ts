import { Hono } from 'hono';
import type { Env, BlankEnv, MiddlewareHandler } from 'hono/types';
import { createMiddleware } from 'hono/factory';
import { pathStartsWith } from '@/utils';

type MountRouteElem<T extends Env = BlankEnv> = {
    path: string | string[],
    route: Hono<T> | MiddlewareHandler<T>,
    custom?: Record<string, any>
}

export default function mount<T extends Env = BlankEnv>(...elem: (MountRouteElem<T> | MountRouteElem<T>[])[]) {
    return createMiddleware<T>(async (c, next) => {
        for (let e of elem) {
            if (!Array.isArray(e)) e = [e]
            for (let w of e) {
                let paths = [w.path].flat()
                for (let p of paths) {
                    if (pathStartsWith(c.req.path, p)) {
                        if (w.route instanceof Hono) {
                            const urlobj = new URL(c.req.url, 'http://localhost')
                            urlobj.pathname = c.req.path.substring(w.path.length)
                            const req = new Request(urlobj, c.req)
                            req.path_prefix = p
                            req.custom_data = w.custom
                            return await w.route.fetch(req, c.env, c.executionCtx)
                        } else {
                            return await w.route(c, next)
                        }
                    }
                }
            }
        }
        await next()
    })
};