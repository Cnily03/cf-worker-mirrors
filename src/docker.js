import { Res, sniffUpstream } from './utils.js'

const DOCKER_HUB = "https://registry-1.docker.io"

export const UPSTREAM_MAP = {
    "/docker": "https://registry-1.docker.io",
    "/quay": "https://quay.io",
    "/gcr": "https://gcr.io",
    "/k8s-gcr": "https://k8s.gcr.io",
    "/k8s": "https://registry.k8s.io",
    "/ghcr": "https://ghcr.io",
    "/cloudsmith": "https://docker.cloudsmith.io",
}

function getUpstream(request) {
    let path = new URL(request.url).pathname

    let resp = sniffUpstream(path, UPSTREAM_MAP)
    if (typeof resp.upstream === "string") {
        return {
            path: resp.remain_path,
            prefix: resp.prefix,
            upstream: resp.upstream,
        }
    }

    // not find, check user-agent
    if ((request.headers.get("User-Agent") || "").toLowerCase().includes("docker/")) {
        return { path: path, prefix: "/docker", upstream: DOCKER_HUB }
    }

    return { path: path, prefix: "", upstream: null }
}

/**
 * @param {Request} request
 */
export async function handleRequest(request, env, ctx) {
    const urlobj = new URL(request.url)

    const { path: slicedPath, prefix, upstream } = getUpstream(request)

    // basic WAF
    if (typeof upstream !== "string") {
        return Res.NotFound()
    }

    urlobj.pathname = slicedPath

    const isDockerHub = upstream === DOCKER_HUB

    let authorization = request.headers.get("Authorization")

    if (urlobj.pathname === "/v2/") {
        let targetURL = new URL(upstream + "/v2/")
        const requestHeaders = new Headers()
        if (authorization) {
            requestHeaders.set("Authorization", authorization)
        }
        // check if need to authenticate
        const resp = await fetch(targetURL.toString(), {
            method: "GET",
            headers: requestHeaders,
            redirect: "follow",
            follow: 5,
        })

        const responseHeaders = new Headers(resp.headers)

        if (resp.status === 401) {
            let wwwAuthenticate = responseHeaders.get("WWW-Authenticate")
            let { realm, service } = parseAuthenticate(wwwAuthenticate)
            let realmPath = new URL(realm).pathname

            const protocol = env.DEBUG_PROTOCOL ? (env.DEBUG_PROTOCOL + "://") : "https://"
            responseHeaders.set(
                "Www-Authenticate",
                `Bearer realm="${protocol}${urlobj.host}${prefix}${realmPath}",service="cf-worker-${env.NAME}"`
            )

            return new Response(await resp.text(), {
                status: 401,
                headers: responseHeaders,
            })
        } else {
            return resp
        }
    }


    // get token
    if (urlobj.pathname === "/token" || urlobj.pathname === "/v2/auth") {

        let targetURL = new URL(upstream + "/v2/")
        const resp = await fetch(targetURL.toString(), {
            method: "GET",
            redirect: "follow",
            follow: 5,
        })
        if (resp.status !== 401) {
            return resp
        }
        let authenticateStr = resp.headers.get("WWW-Authenticate")
        if (authenticateStr === null) {
            return resp
        }
        const wwwAuthenticate = parseAuthenticate(authenticateStr)

        let scope = urlobj.searchParams.get("scope")
        // autocomplete repo part into scope for DockerHub library images
        // Example: repository:busybox:pull => repository:library/busybox:pull
        if (scope && isDockerHub) {
            let scopeParts = scope.split(":")
            if (scopeParts.length == 3 && !scopeParts[1].includes("/")) {
                scopeParts[1] = "library/" + scopeParts[1]
                scope = scopeParts.join(":")
            }
        }
        return fetchToken(request, wwwAuthenticate, scope)
    }

    // redirect for DockerHub library images
    // Example: /v2/busybox/manifests/latest => /v2/library/busybox/manifests/latest
    if (isDockerHub) {
        const pathParts = urlobj.pathname.split("/")
        if (pathParts.length == 5) {
            pathParts.splice(2, 0, "library")
            let redirectUrl = new URL(urlobj)
            redirectUrl.pathname = prefix + pathParts.join("/")
            return Response.redirect(redirectUrl, 301)
        }
    }

    // forward requests
    let targetURL = new URL(upstream + urlobj.pathname + urlobj.search)
    return fetch(new Request(targetURL.toString(), {
        method: request.method,
        headers: request.headers,
        redirect: "follow",
        follow: 5,
    }))
}

function parseAuthenticate(authenticateStr) {
    // sample: Bearer realm="https://auth.ipv6.docker.com/token",service="registry.docker.io"
    // match strings after =" and before "
    const re = /(?<=\=")(?:\\.|[^"\\])*(?=")/g
    const matches = authenticateStr.match(re)
    if (matches == null || matches.length < 2) {
        throw new Error(`Invalid Www-Authenticate Header: ${authenticateStr}`)
    }
    return {
        realm: matches[0],
        service: matches[1],
    }
}

async function fetchToken(request, wwwAuthenticate, scope) {
    const url = new URL(wwwAuthenticate.realm)
    if (wwwAuthenticate.service.length) {
        url.searchParams.set("service", wwwAuthenticate.service)
    }
    if (scope) {
        url.searchParams.set("scope", scope)
    }
    return fetch(url, {
        method: request.method,
        headers: request.headers,
        redirect: "follow",
        follow: 5,
    })
}