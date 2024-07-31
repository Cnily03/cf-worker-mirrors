import { createMiddleware } from "hono/factory";
import type { Env, BlankEnv, MiddlewareHandler } from "hono/types";
import type { Context } from "hono";
import { pathStartsWith, isContentType } from "@/utils";

type ProxyRewrite<T extends Env> = (c: Context<T>, path: string, url: string) => string
const parseFunctional = <T>(v: T | (() => T)): T => typeof v === "function" ? (v as CallableFunction)() : v

interface ProxyOptions {
    forbidHTML: Functional<boolean>
}

const defaultOptions: ProxyOptions = {
    forbidHTML: true
}

export function changeOrigin<T extends Env = BlankEnv>(origin: string | ProxyRewrite<T>, path_rewrite?: ProxyRewrite<T>, options?: Partial<ProxyOptions>): MiddlewareHandler<any, string, {}>
export function changeOrigin<T extends Env = BlankEnv>(origin: string | ProxyRewrite<T>, mount_path?: string, options?: Partial<ProxyOptions>): MiddlewareHandler<any, string, {}>
export function changeOrigin<T extends Env = BlankEnv>(origin: string | ProxyRewrite<T>, arg: string | ProxyRewrite<T> = '', options?: Partial<ProxyOptions>) {
    const opts: ProxyOptions = Object.assign({}, defaultOptions, options)
    opts.forbidHTML = parseFunctional(opts.forbidHTML)
    return createMiddleware<T>(async (c, next) => {
        let newpath = ''
        if (typeof arg === "undefined") {
            newpath = c.req.path
        } if (typeof arg === "string") {
            newpath = c.req.path.substring(arg.length)
        } else {
            newpath = arg(c, c.req.path, c.req.url)
        }
        if (typeof arg === "string" && !pathStartsWith(c.req.path, arg)) return await next()
        if (typeof arg !== "string" && !newpath) return await next()

        let _origin = typeof origin === "string" ? origin : origin(c, c.req.path, c.req.url)
        const inobj = new URL(_origin, "http://localhost")
        const urlobj = new URL(c.req.url, inobj.origin)
        urlobj.protocol = inobj.protocol
        urlobj.host = inobj.host
        urlobj.port = inobj.port
        urlobj.pathname = newpath
        const resp = await fetch(urlobj, {
            method: c.req.method,
            headers: c.req.raw.headers,
            redirect: 'follow',
        })
        if (opts.forbidHTML && isContentType(resp.headers, 'text/html')) {
            resp.headers.delete('Content-Type')
            resp.headers.set('Content-Type', 'text/plain')
        }
    })
}

export function rewriteURL<T extends Env = BlankEnv>(rewrite: ProxyRewrite<T>, options?: Partial<ProxyOptions>): MiddlewareHandler<any, string, {}> {
    const opts: ProxyOptions = Object.assign({}, defaultOptions, options)
    opts.forbidHTML = parseFunctional(opts.forbidHTML)
    return createMiddleware<T>(async (c, next) => {
        let newurl = rewrite(c, c.req.path, c.req.url)
        if (!newurl) return await next()
        const resp = await fetch(newurl, {
            method: c.req.method,
            headers: c.req.raw.headers,
            redirect: 'follow',
        })
        if (opts.forbidHTML && isContentType(resp.headers, 'text/html')) {
            resp.headers.delete('Content-Type')
            resp.headers.set('Content-Type', 'text/plain')
        }
        return resp
    })
}


type ProxyForwardOptions = {
    forwardUrl: string
    forbidHTML: Functional<boolean>
    redirect: "manual" | "follow"
}

const defaultForwardOptions: ProxyForwardOptions = {
    forwardUrl: '',
    forbidHTML: true,
    redirect: "manual"
}

export function forwardPath<T extends Env = BlankEnv>(options?: Partial<ProxyForwardOptions>): MiddlewareHandler<any, string, {}> {
    const opts: ProxyForwardOptions = Object.assign({}, defaultForwardOptions, options)
    opts.forbidHTML = parseFunctional(opts.forbidHTML)
    return createMiddleware<T>(async (c, next) => {
        let next_url = opts.forwardUrl || c.req.path.substring(1)
        if (!/^https?:\/\//.test(next_url)) return await next()
        const thisUrlObj = new URL(c.req.url, "http://localhost")
        const forwardUrlObj = new URL(next_url) // no base parameter, if not valid, it will throw
        console.log(forwardUrlObj.href)
        const resp = await fetch(forwardUrlObj, {
            method: c.req.method,
            headers: c.req.raw.headers,
            redirect: opts.redirect,
        })
        if (opts.forbidHTML && isContentType(resp.headers, 'text/html')) {
            resp.headers.delete('Content-Type')
            resp.headers.set('Content-Type', 'text/plain')
        }
        if (opts.redirect === "manual" && resp.headers.has('Location')) {
            const location = resp.headers.get('Location')
            resp.headers.delete('Location')
            resp.headers.set('Location', new URL(thisUrlObj.origin + '/' + location).href)
        }
        return resp
    })
}

export const Proxy = {
    changeOrigin,
    rewriteURL,
    forwardPath
}

export default Proxy