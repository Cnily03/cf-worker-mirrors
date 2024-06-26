export const Logger = new (class {
	constructor() {
		this.ansi = {
			reset: "\x1b[0m",
			bold: "\x1b[1m",
			magenta: "\x1b[35m",
			orange: "\x1b[33m",
			blue: "\x1b[34m",
			cyan: "\x1b[36m",
			gray: "\x1b[90m",
			bold_magenta: "\x1b[1;35m",
			bold_orange: "\x1b[1;33m",
			bold_blue: "\x1b[1;34m",
			bold_cyan: "\x1b[1;36m",
		}

		const that = this

		this.utils = {
			headers(request, extractHeaders, important = false) {
				if (important) return extractHeaders.filter(name => request.headers.get(name)).map(name => that.utils.wrap(`${name}: ${request.headers.get(name)}`)).join(that.utils.applyAnsi(", ", "gray"))
				else return that.utils.applyAnsi(extractHeaders.filter(name => request.headers.get(name)).map(name => `"${name}: ${request.headers.get(name)}"`).join(", "), "gray")
			},
			wrap(str, important = false) {
				if (important) return that.utils.applyAnsi('"', "gray") + String(str) + that.utils.applyAnsi('"', "gray")
				else return that.utils.applyAnsi(`"${str}"`, "gray")
			},
			/**
			 * @param {keyof typeof that.ansi} key
			 */
			applyAnsi(str, key) {
				return that.ansi[key] + String(str) + that.ansi.reset
			}
		}
	}

	debug(request, { ...args }) {
		const fmt = `${this.ansi.magenta}[DEBUG]${this.ansi.reset} %s`
		let arr = []
		for (const key in args) {
			if (Object.prototype.hasOwnProperty.call(args, key)) {
				const value = String(args[key])
				let _key = key.startsWith(":bold:") ? this.utils.applyAnsi(key.substring(6), "bold_orange") : this.utils.applyAnsi(key, "orange")
				let _value = value.startsWith(":bold:") ? this.utils.applyAnsi(value.substring(6), "bold") : value
				arr.push(`${_key}${this.ansi.orange}(${this.ansi.reset}${_value}${this.ansi.orange})${this.ansi.reset}`)
			}
		}
		console.debug(fmt, arr.join(" "))
	}
})()

export const EnvTools = new (class {
	constructor() {
		this._defaultEnv = {
			SECURE_CONFIG: {
				AllowMainSiteHTML: { type: "boolean", default: 0 },
				AllowSubDomainHTML: { type: "boolean", default: 1 },
				EnableMainSite: { type: "boolean", default: 1 },
				MainSiteDomain: { type: "array", default: ["*"] },
				EnableSubDomain: { type: "boolean", default: 1 },
				SubKeyList: { type: "array", default: [] },
			}
		}
		this._cache = {}
	}

	boolean(key) {
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

	take(value, _default) {
		return typeof value === "undefined" ? _default : value
	}

	/**
	 * @returns {Record<keyof typeof this._defaultEnv.SECURE_CONFIG, any>}
	 */
	secureConfig(env, useCache = true) {
		if (useCache && this._cache.secureConfig) return this._cache.secureConfig
		const isJSON = (obj) => {
			try {
				return JSON.stringify(obj).startsWith("{")
			} catch (e) {
				return false
			}
		}
		const _secureDef = this._defaultEnv.SECURE_CONFIG
		let secure = isJSON(env.SECURE_CONFIG) ? env.SECURE_CONFIG : {}
		for (const key in _secureDef) {
			if (Object.prototype.hasOwnProperty.call(_secureDef, key)) {
				const { type, default: def } = _secureDef[key]
				let rawValue = this.take(secure[key], def)
				if (type === "boolean") rawValue = this.boolean(rawValue)
				secure[key] = rawValue
			}
		}
		this._cache.secureConfig = secure
		return secure
	}

	allowHTML(request, env, ctx) {
		let type = DomainTools.type(request, env, ctx)
		const conf = this.secureConfig(env)
		if (type === "main") return this.boolean(conf.AllowMainSiteHTML)
		if (type === "sub") return this.boolean(conf.AllowSubDomainHTML)
		return false
	}
})()

export const DomainTools = new (class {
	constructor() {
		this._cache = {}
	}

	/**
	 * @param {Request} request
	 */
	type(request, env, ctx, useCache = true) {
		const basicURLObj = new URL(request.url)
		const curDomain = basicURLObj.hostname

		if (useCache && this._cache[curDomain]) return this._cache[curDomain]
		const ret = v => (this._cache[curDomain] = v)

		const conf = EnvTools.secureConfig(env)

		if (!conf.EnableMainSite && !conf.EnableSubDomain) return this._cache[curDomain] = ret("unknown")

		if (conf.MainSiteDomain.some(s => (s = s.trim()) === "" || s === "*")) {
			if (conf.EnableMainSite) return ret("main") // main domain
			if (conf.EnableSubDomain) return conf.SubKeyList.map(String).some(s => curDomain.startsWith(s + ".")) ? ret("sub") : ret("unknown") // sub domain
			return ret("unknown")
		}

		conf.MainSiteDomain = conf.MainSiteDomain.sort((a, b) => b.length - a.length)

		for (let d of conf.MainSiteDomain) {
			if (conf.EnableMainSite && d === curDomain) return ret("main") // main domain

			if (conf.EnableSubDomain && curDomain.endsWith("." + d)) { // possible sub domain
				for (let k of conf.SubKeyList) {
					if (curDomain === k + "." + d) return ret("sub") // sub domain
				}
			}
		}

		return ret("unknown")
	}

	/**
	 * @param {Request} request
	 */
	auth(request, env, ctx) {
		let type = this.type(request, env, ctx)
		if (type === "unknown") return false
		return true
	}

	/**
	 * @param {Request} request
	 */
	isMain(request, env, ctx) {
		return this.type(request, env, ctx) === "main"
	}

	/**
	 * @param {Request} request
	 */
	isSub(request, env, ctx) {
		return this.type(request, env, ctx) === "sub"
	}
})()

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
	async proxy(url, request, env, ctx, follow = true) {
		// const conf = EnvTools.secureConfig(env)

		const resp = await fetch(url.toString(), {
			method: request.method,
			headers: request.headers,
			...["GET", "HEAD"].includes(request.method) ? {} : { body: await request.arrayBuffer() },
			redirect: follow ? "follow" : "manual",
			...(follow ? { follow: typeof follow === "boolean" ? 5 : follow } : {}),
		})

		// not allow html, return text/html as plain text
		if (!EnvTools.allowHTML(request, env, ctx)) {
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