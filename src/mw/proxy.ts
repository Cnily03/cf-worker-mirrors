import { createMiddleware } from "hono/factory";
import type { Env, BlankEnv, MiddlewareHandler } from "hono/types";
import type { Context } from "hono";
import { parseFunctional, pathStartsWith, replaceContentType } from "@/utils";

type ProxyRewrite<T extends Env> = (c: Context<T>, path: string, url: string) => string

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
    return createMiddleware<T>(async (c, next) => {
        opts.forbidHTML = parseFunctional(opts.forbidHTML)
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
        urlobj.search = urlobj.search
        const resp = await fetch(urlobj, {
            method: c.req.method,
            headers: c.req.raw.headers,
            redirect: 'follow',
            body: c.req.raw.body
        })
        const headers = new Headers(resp.headers)
        if (opts.forbidHTML) {
            replaceContentType(headers, 'text/html', 'text/plain')
        }
        return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers
        })
    })
}

export function rewriteURL<T extends Env = BlankEnv>(rewrite: ProxyRewrite<T>, options?: Partial<ProxyOptions>): MiddlewareHandler<any, string, {}> {
    const opts: ProxyOptions = Object.assign({}, defaultOptions, options)
    return createMiddleware<T>(async (c, next) => {
        opts.forbidHTML = parseFunctional(opts.forbidHTML)
        let newurl = rewrite(c, c.req.path, c.req.url)
        if (!newurl) return await next()
        const resp = await fetch(newurl, {
            method: c.req.method,
            headers: c.req.raw.headers,
            redirect: 'follow',
            body: c.req.raw.body
        })
        const headers = new Headers(resp.headers)
        if (opts.forbidHTML) {
            replaceContentType(headers, 'text/html', 'text/plain')
        }
        return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers
        })
    })
}


type ProxyForwardOptions = {
    forwardUrl: string
    forbidHTML: Functional<boolean>
    redirect: "manual" | "follow"
    autoCompleteProtocol: boolean
}

const defaultForwardOptions: ProxyForwardOptions = {
    forwardUrl: '',
    forbidHTML: true,
    redirect: "manual",
    autoCompleteProtocol: true
}

export function _testURLProtocol(url: string): "invalid" | "miss_protocol" | "has_protocol" {
    if (!/\w+:\/\/./.test(url)) {
        let domain_url = ''
        if (/@/.test(url)) {
            domain_url = url.slice(url.indexOf('@') + 1)
        } else {
            domain_url = url
        }
        // (auth@)domain(/path)
        let match = /([0-9a-zA-Z-.]+)(\/|$)/.exec(domain_url)
        if (match === null) return "invalid"
        return "miss_protocol"
    }
    return "has_protocol"
}

export function forwardPath<T extends Env = BlankEnv>(options?: Partial<ProxyForwardOptions>): MiddlewareHandler<any, string, {}> {
    const opts: ProxyForwardOptions = Object.assign({}, defaultForwardOptions, options)
    return createMiddleware<T>(async (c, next) => {
        opts.forbidHTML = parseFunctional(opts.forbidHTML)
        // format url to standard
        let search = new URL(c.req.url, "http://localhost").search
        let next_url = opts.forwardUrl || c.req.path.substring(1) + search
        const thisUrlObj = new URL(c.req.url, "http://localhost")
        let _t = _testURLProtocol(next_url)
        if (_t === "invalid") return await next()
        else if (_t === "miss_protocol") {
            if (opts.autoCompleteProtocol) next_url = `${thisUrlObj.protocol}//${next_url}`
            else return await next()
        }

        const forwardUrlObj = new URL(next_url) // no base parameter, if not valid, it will throw
        const resp = await fetch(forwardUrlObj, {
            method: c.req.method,
            headers: c.req.raw.headers,
            redirect: opts.redirect,
            body: c.req.raw.body
        })

        const headers = new Headers(resp.headers)

        // convert `text/html` to `text/plain`
        if (opts.forbidHTML) {
            replaceContentType(headers, 'text/html', 'text/plain')
        }

        // redirect to the same domain
        if (opts.redirect === "manual" && headers.has('Location')) {
            const location = headers.get('Location')
            headers.delete('Location')
            headers.set('Location', new URL(thisUrlObj.origin + '/' + location).href)
        }

        return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers
        })
    })
}

export const Proxy = {
    changeOrigin,
    rewriteURL,
    forwardPath
}

export default Proxy