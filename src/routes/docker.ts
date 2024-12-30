import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { signData, verifyData } from "@/utils"
import Proxy from "@/mw/proxy"
import wwwAuth from "@/mw/docker-auth"

const app = new Hono<EnvHono>()

const UPSTREAM = 'https://registry-1.docker.io'

// replace the `WWW-Authenticate` header with the current origin before responding
app.use(wwwAuth())

// Login with token
// app.on('GET', ['/v2', '/v2/'], async c => {
// * This is already handled by the `wwwAuth` middleware
// })

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
        //     body: c.req.raw.body
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
        body: c.req.raw.body
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