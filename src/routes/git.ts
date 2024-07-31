import { Hono } from "hono";
import Proxy, { _testURLProtocol } from "@/mw/proxy";

const app = new Hono<EnvHono>();

app.use(async (c, next) => {
    let search = new URL(c.req.url, "http://localhost").search
    let path_url = c.req.path.substring(1) + search
    let _t = _testURLProtocol(path_url)
    if (_t === "invalid") return await next()
    else if (_t === "miss_protocol") {
        path_url = `https://${path_url}`
    }
    return await Proxy.forwardPath({
        forwardUrl: path_url,
        forbidHTML: false,
        redirect: 'manual'
    })(c, next)
})

export default app;