import { Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { signData, verifyData } from "@/utils"

function parseAuth(auth: string | null) {
    if (typeof auth !== 'string') { return null }
    // WWW-Authenticate: scheme k=v, k=v, k=v
    let scheme = /^(\S+)\s+/.exec(auth)![1]
    const parts = auth.replace(/^\S+\s+/, '').split(/,\s*/)
    const obj: Record<string, string> = {}
    for (const part of parts) {
        let where = part.indexOf('=')
        let k = part.slice(0, where)
        let v = part.slice(where + 1)
        obj[k] = v
    }
    return { scheme: scheme, kv: obj }
}

function genAuth(scheme: string, obj: Record<string, string>, join = ',') {
    let auth = scheme + ' '
    for (const [k, v] of Object.entries(obj)) {
        auth += `${k}=${v}${join}`
    }
    return auth.slice(0, -join.length)
}

async function tryReplaceAuthHeader<T extends EnvHono>(c: Context<T>) {
    const PATH_PREFIX = c.req.raw.path_prefix || ''
    const wwwAuth = c.res.headers.get('WWW-Authenticate')
    if (!wwwAuth) return

    const data = parseAuth(wwwAuth)
    if (!data || !data.kv["realm"] || !data.kv["service"]) return

    const thisUrlObj = new URL(c.req.url, "http://localhost")
    let realm: string = JSON.parse(data.kv["realm"])
    const realmUrlObj = new URL(realm, thisUrlObj.origin)
    thisUrlObj.pathname = PATH_PREFIX + realmUrlObj.pathname
    let token = await signData({
        realm: realm,
        service: JSON.parse(data.kv["service"]),
    }, c.env["SIGN_SECRET"]!)
    thisUrlObj.searchParams.set('mirror_token', token)
    const fmtWwwAuth = genAuth(data.scheme, {
        realm: JSON.stringify(thisUrlObj.href),
        service: JSON.stringify(c.env.SERVICE_NAME),
    })
    c.res.headers.set('WWW-Authenticate', fmtWwwAuth)
}

export default function wwwAuth<T extends EnvHono>() {
    return createMiddleware<T>(async (c, next) => {
        await next()
        if (c.res.status === 401) {
            await tryReplaceAuthHeader(c)
        }
    })
};