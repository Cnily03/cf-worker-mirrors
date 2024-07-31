import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { signData, verifyData } from "@/utils"
import Proxy from "@/mw/proxy"

const app = new Hono<EnvHono>()

const UPSTREAM = 'https://registry-1.docker.io'

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

// Login with token
app.get('/v2/', async c => {
    const PATH_PREFIX = c.req.raw.path_prefix || ''
    const upstream = c.req.raw.custom_data?.upstream || UPSTREAM

    let resp = await fetch(new URL(upstream + c.req.routePath), {
        method: c.req.method,
        headers: c.req.raw.headers,
        redirect: 'follow',
    })
    if (resp.status === 401) {
        const wwwAuth = resp.headers.get('WWW-Authenticate')
        const data = parseAuth(wwwAuth)
        if (!data || !data.kv["realm"] || !data.kv["service"]) return resp

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
        const respHeaders = new Headers(resp.headers)
        respHeaders.set('WWW-Authenticate', fmtWwwAuth)
        return new Response(resp.body, {
            status: resp.status,
            statusText: resp.statusText,
            headers: respHeaders,
        })
    } else {
        return resp
    }
})

// Get token (with account details)
app.on('GET', ['/token', '/v2/auth'], async c => {
    const upstream = c.req.raw.custom_data?.upstream || UPSTREAM
    const urlobj = new URL(c.req.url, "http://localhost")
    // Verify service
    let service = urlobj.searchParams.get('service')
    if (service !== c.env.SERVICE_NAME) {
        throw new HTTPException(401, { message: 'Invalid service' })
    }
    // Get the target url
    let mirror_token = urlobj.searchParams.get('mirror_token')
    let token_data = mirror_token && await verifyData(mirror_token, c.env["SIGN_SECRET"]!)
    const report_to = { realm: '', service: '' }
    if (token_data && token_data["realm"] && token_data["service"]) {
        report_to.realm = token_data["realm"]
        report_to.service = token_data["service"]
    } else {
        // Fallback, not valid token, throw
        throw new HTTPException(401, { message: 'Invalid mirror_token' })
        // Fallback, try to get the realm from the upstream
        // const r = await fetch(new URL(upstream + '/v2/'), {
        //     method: c.req.method,
        //     headers: c.req.raw.headers,
        //     redirect: 'follow',
        // })
        // if (r.status !== 401) throw new HTTPException(500, { message: 'Unknown response' })
        // const wwwAuth = r.headers.get('WWW-Authenticate')
        // const data = parseAuth(wwwAuth)
        // if (!data || !data.kv["realm"] || !data.kv["service"]) throw new HTTPException(500, { message: 'Invalid response' })
        // report_to.realm = JSON.parse(data.kv["realm"])
        // report_to.service = JSON.parse(data.kv["service"])
    }
    urlobj.searchParams.delete('mirror_token')

    // Format scope if needed
    // This support `docker pull example.com/image:tag`
    // (only for dockerhub images)
    // Transfer scope `repository:busybox:pull` to std format `repository:library/busybox:pull`
    // if username is not specified
    let scope = urlobj.searchParams.get('scope')
    if (scope && !c.req.raw.custom_data?.third_repo) {
        let arr = scope.split(':')
        if (arr.length === 3 && !arr[1].includes('/')) {
            arr[1] = 'library/' + arr[1]
            scope = arr.join(':')
            urlobj.searchParams.set('scope', scope)
        }
    }

    // send request
    let target_url = new URL(report_to.realm, "https://auth.docker.io")
    target_url.search = urlobj.search
    target_url.searchParams.set('service', report_to.service)

    return fetch(target_url, {
        method: c.req.method,
        headers: c.req.raw.headers,
        redirect: 'follow',
    })
})

app.use(Proxy.changeOrigin<EnvHono>(
    /* origin */
    function (c) {
        const upstream = c.req.raw.custom_data?.upstream || UPSTREAM
        return upstream
    },
    /* path_rewrite */
    function (c, path) {
        // This support `docker pull example.com/image:tag`
        // (only for dockerhub images)
        if (c.req.raw.custom_data?.third_repo) return path
        const match = /^\/(v2)\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path)
        if (match) {
            return `/${match[1]}/library/${match[2]}/${match[3]}/${match[4]}`
        }
        return path
    }))

export default app