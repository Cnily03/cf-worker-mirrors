import { Res, secureConfig, sniffUpstream } from "./utils"

const GITHUB = "https://github.com"
const GIST = "https://gist.github.com"
const GITHUB_API = "https://api.github.com"

export const UPSTREAM_MAP = {
    "/github": GITHUB,
    "/gh": GITHUB,
    "/gist": GIST,
    "/github-api": GITHUB_API,
    "/gh-api": GITHUB_API,
}

/**
 * @param {Request} request
 */
export async function handleRequest(request, env, ctx) {
    const urlobj = new URL(request.url)

    const { prefix, upstream, remain_path } = sniffUpstream(urlobj.pathname, UPSTREAM_MAP)

    if (typeof upstream !== "string") {

        // if have github referer, proxy it
        let referer = request.headers.get("Referer") || "";
        let refererPath = referer && (referer + "/").startsWith(urlobj.origin + "/") ? new URL(referer).pathname : "";
        let { prefix, upstream } = sniffUpstream(refererPath, UPSTREAM_MAP)

        if (typeof upstream === "string") {
            let targetURL = new URL(urlobj.origin + prefix + urlobj.pathname + urlobj.search)
            return fetch(targetURL.toString(), {
                method: request.method,
                ...["GET", "HEAD"].includes(request.method) ? {} : { body: await request.arrayBuffer() },
                body: await request.arrayBuffer(),
                redirect: "follow",
                follow: 5
            })
        }

        return Res.NotFound()
    }

    let targetURL = new URL(upstream + remain_path + urlobj.search)

    const resp = await fetch(targetURL.toString(), {
        method: request.method,
        headers: request.headers,
        ...["GET", "HEAD"].includes(request.method) ? {} : { body: await request.arrayBuffer() },
        redirect: "follow",
        follow: 5
    })

    const contentType = resp.headers.get("Content-Type") || ""
    if (contentType.startsWith("image/") || contentType.startsWith("video/")) return resp
    if (contentType.startsWith("application/x-git-") || contentType.startsWith("application/x-github-")) return resp

    // if(contentType.startsWith("application/zip") || contentType.startsWith("application/octet-stream")) return resp
    // if(contentType.startsWith("application/json")) return resp

    if (contentType.startsWith("application/x-")) return resp

    const conf = secureConfig(env)
    if (!conf.AllowHTML && contentType.startsWith("text/html")) return Res.Forbidden("HTML is forbidden")


    if (["text/html", "text/css", "application/javascript"].some(t => contentType.startsWith(t))) {
        const text = await resp.text()
        let repalced = text
            .replace(new RegExp(GITHUB, "g"), urlobj.origin + (upstream === GITHUB ? prefix : "github"))
            .replace(new RegExp(GIST, "g"), urlobj.origin + (upstream === GIST ? prefix : "gist"))
            .replace(new RegExp(GITHUB_API, "g"), urlobj.origin + (upstream === GITHUB_API ? prefix : "github-api"))
        if (contentType.startsWith("text/html")) {
            // search href="/, href='/
            repalced = repalced.replace(/(href=["'])(\/[^/])/g, `$1${prefix}$2`)
        }
        return new Response(repalced, {
            status: resp.status,
            statusText: resp.statusText,
            headers: resp.headers
        })
    }

    return resp

}