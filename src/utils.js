export function envBool(key) {
	if (typeof key === "undefined") return false
	if (typeof key === "boolean") return key
	if (typeof key === "number") return Boolean(key)
	if (typeof key === "string") {
		if (/^\d+$/.test(key)) return Boolean(Number(key))
		if (/^true|false$/.test(key)) return key === "true"
		if (key.trim() === "") return false
		return true
	}
	return true
}

export function secureConfig(env) {
	const isJSON = (obj) => {
		try {
			return JSON.stringify(obj).startsWith("{")
		} catch (e) {
			return false
		}
	}
	const setDefault = (v, d) => (typeof v === "undefined" ? d : v)
	let secure = {
		AllowHTML: 0,
		EnableMainSite: 1,
		MainSiteDomain: ['*'],
		EnableSubDomain: 1,
		SubKeyList: [],
	}
	secure = isJSON(env.SECURE_CONFIG) ? env.SECURE_CONFIG : {}
	secure.AllowHTML = envBool(setDefault(secure.AllowHTML, 0))
	secure.EnableMainSite = envBool(setDefault(secure.EnableMainSite, 1))
	secure.MainSiteDomain = setDefault(secure.MainSiteDomain, ['*'])
	secure.EnableSubDomain = envBool(setDefault(secure.EnableSubDomain, 1))
	secure.SubKeyList = setDefault(secure.SubKeyList, [])
	return secure
}

export function pathStartsWith(path, ...prefix) {
	return prefix.some(p => {
		if (path.length < p.length) return false
		if (path.length === p.length) return path === p
		return path.startsWith(p) && path[p.length] === "/"
	})
}

export function sniffUpstream(path, map) {
	const keys = Object.keys(map)
	keys.sort((a, b) => b.length - a.length) // longer first
	for (const key of keys) {
		if (path.length >= key.length && path.startsWith(key)) {
			// example: `/service` pass `/service/xxx` pass, `/servicesubfix` rejected
			if (path.length == key.length || path[key.length] == "/") {
				return { prefix: key, key: key, upstream: map[key], remain_path: path.substring(key.length) }
			}
		}
	}

	return { prefix: "", key: null, upstream: null, remain_path: path }
}

export const Res = new (class {
	async proxy(url, request, env, follow = true) {
		const conf = secureConfig(env)

		const resp = await fetch(url.toString(), {
			method: request.method,
			headers: request.headers,
			...["GET", "HEAD"].includes(request.method) ? {} : { body: await request.arrayBuffer() },
			redirect: follow ? "follow" : "manual",
			...(follow ? { follow: typeof follow === "boolean" ? 5 : follow } : {}),
		})

		// not allow html, return text/html as plain text
		if (!conf.AllowHTML) {
			const headers = new Headers(resp.headers)
			const contentType = headers.get("Content-Type") || ""
			if (contentType.startsWith("text/html")) headers.set("Content-Type", "text/plain")
			return new Response(resp.body, {
				status: resp.status,
				statusText: resp.statusText,
				headers: headers
			})
		}

		return resp
	}

	BadRequest(s) {
		return new Response(s || "Bad Request", { status: 400 })
	}

	Unauthorized(s) {
		return new Response(s || "Unauthorized", { status: 401 })
	}

	Forbidden(s) {
		return new Response(s || "Forbidden", { status: 403 })
	}

	NotFound(s) {
		return new Response(s || "Not Found", { status: 404 })
	}

	ServerError(s) {
		return new Response(s || "Internal Server Error", { status: 500 })
	}
})()