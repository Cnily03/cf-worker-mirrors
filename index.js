/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { Res, secureConfig, pathStartsWith } from "./src/utils"
import * as DockerMirror from "./src/docker"
import * as GithubMirror from "./src/github"

export default {
	async fetch(request, env, ctx) {
		ctx.passThroughOnException()
		return handleRequest(request, env, ctx)
	},
}

function sniffService(request) {
	const basicURLObj = new URL(request.url)

	let hasDockerPrefix = pathStartsWith(basicURLObj.pathname, ...Object.keys(DockerMirror.UPSTREAM_MAP))
	let isUserAgentDocker = (request.headers.get("User-Agent") || "").toLowerCase().includes("docker/")
	if (hasDockerPrefix || isUserAgentDocker) {
		return "docker"
	}

	let hasGithubPrefix = pathStartsWith(basicURLObj.pathname, ...Object.keys(GithubMirror.UPSTREAM_MAP))
	let referer = request.headers.get("Referer") || ""
	let refererPath = referer && (referer + "/").startsWith(basicURLObj.origin + "/") ? new URL(referer).pathname : ""
	let hasGithubReferer = refererPath && pathStartsWith(refererPath, ...Object.keys(GithubMirror.UPSTREAM_MAP))
	if (hasGithubPrefix || hasGithubReferer) {
		return "github"
	}

	let isGitUserAgent = (request.headers.get("User-Agent") || "").toLowerCase().includes("git/")
	let isGithubURL = /^(https?:\/\/)?github\.com($|\/)/.test(basicURLObj.pathname.substring(1))
	if (isGitUserAgent && isGithubURL) {
		return "git"
	}

	let isGithubContentURL = /^(https?:\/\/)?(raw|gist)\.githubusercontent\.com($|\/)/.test(basicURLObj.pathname.substring(1))
	if (isGithubContentURL || isGithubURL) {
		return "proxy"
	}

	return "unknown"
}

/**
 * @param {Request} request
 */
async function handleRequest(request, env, ctx) {
	if (!verifyDomain(request, env, ctx)) {
		return Res.Forbidden("NOT PERMITTED")
	}

	const basicURLObj = new URL(request.url)
	const pathAsURLString = () => {
		let baseURL = basicURLObj.pathname.substring(1) + basicURLObj.search
		baseURL = /^https?:\/\//.test(baseURL) ? baseURL : "https://" + baseURL
		return baseURL
	}

	const service = sniffService(request)

	if (service === "docker") {
		return DockerMirror.handleRequest(request, env, ctx)
	} else if (service === "github") {
		return GithubMirror.handleRequest(request, env, ctx)
	} else if (service === "git") {
		let baseURL = pathAsURLString()
		baseURL = baseURL.replace(/^http:\/\//, "https://")
		return Res.proxy(baseURL, request, env)
	} else if (service === "proxy") {
		let baseURL = pathAsURLString()
		return Res.proxy(baseURL, request, env)
	}

	if (basicURLObj.pathname !== "/") return Res.NotFound()

	const mainPageJSON = {
		"service": `cf-worker-${env.NAME}`,
		"version": env.VERSION,
		"author": "Cnily03",
		"usage": {
			"docker": DockerMirror.UPSTREAM_MAP,
			"github": GithubMirror.UPSTREAM_MAP,
			"git": "<repo-url>",
			"proxy": "<url>"
		}
	}

	return Response.json(mainPageJSON, { status: 200 })
}

/**
 * @param {Request} request
 */
function verifyDomain(request, env, ctx) {
	const basicURLObj = new URL(request.url)
	const curDomain = basicURLObj.hostname

	const conf = secureConfig(env)

	if (!conf.EnableMainSite && !conf.EnableSubDomain) return false

	if (conf.MainSiteDomain.some(s => (s = s.trim()) === "" || s === "*")) {
		if (conf.EnableMainSite) return true
		if (conf.EnableSubDomain) return conf.SubKeyList.map(String).some(s => curDomain.startsWith(s + "."))
		return false
	}

	conf.MainSiteDomain = conf.MainSiteDomain.sort((a, b) => b.length - a.length)

	for (let d of conf.MainSiteDomain) {
		if (conf.EnableMainSite && d === curDomain) return true // main domain

		if (conf.EnableSubDomain && curDomain.endsWith("." + d)) { // possible sub domain
			for (let k of conf.SubKeyList) {
				if (curDomain === k + "." + d) return true // sub domain
			}
		}
	}

	return false
}