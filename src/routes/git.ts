import { Hono } from "hono";
import Proxy from "@/mw/proxy";

const app = new Hono<EnvHono>();

app.use(async (c, next) => {
    let path_url = c.req.path.substring(1)
    if (!/\w+:\/\/./.test(path_url)) {
        let domain_url = ''
        if (/@/.test(path_url)) {
            domain_url = path_url.slice(path_url.indexOf('@') + 1)
        } else {
            domain_url = path_url
        }
        // (auth@)domain(/path)
        let match = /([0-9a-zA-Z-.]+)(\/|$)/.exec(domain_url)
        if (match === null) return await next()
        path_url = `https://${path_url}`
    }
    return await Proxy.forwardPath({
        forwardUrl: path_url,
        forbidHTML: false,
        redirect: 'manual'
    })(c, next)
})

export default app;