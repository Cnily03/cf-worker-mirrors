/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { Res, DomainTools, pathStartsWith, Logger } from "./src/utils"
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

	let isUserAgentDocker = (request.headers.get("User-Agent") || "").toLowerCase().includes("docker/")
	let isUserAgentGit = (request.headers.get("User-Agent") || "").toLowerCase().includes("git/")

	// if (isUserAgentDocker) return "docker"
	// if (isUserAgentGit) return "git"

	let hasDockerPrefix = pathStartsWith(basicURLObj.pathname, ...Object.keys(DockerMirror.UPSTREAM_MAP))
	if (isUserAgentDocker || hasDockerPrefix) {
		return "docker"
	}

	let hasGithubPrefix = pathStartsWith(basicURLObj.pathname, ...Object.keys(GithubMirror.UPSTREAM_MAP))
	let referer = request.headers.get("Referer") || ""
	let refererPath = referer && (referer + "/").startsWith(basicURLObj.origin + "/") ? new URL(referer).pathname : ""
	let hasGithubReferer = refererPath && pathStartsWith(refererPath, ...Object.keys(GithubMirror.UPSTREAM_MAP))
	if (hasGithubPrefix || hasGithubReferer) {
		return "github"
	}

	let isGithubURL = /^(https?:\/\/)?github\.com($|\/)/.test(basicURLObj.pathname.substring(1))
	if (isUserAgentGit && isGithubURL) {
		return "git"
	}

	const whitelistRegex = {
		GithubContent: /^(https?:\/\/)?(raw|gist)\.githubusercontent\.com($|\/)/i,
		Github: /^(https?:\/\/)?github\.com($|\/)/i,
		GithubStatus: /^(https?:\/\/)?(www\.)?githubstatus\.com($|\/)/i,
	}
	if (Object.values(whitelistRegex).some(r => r.test(basicURLObj.pathname.substring(1)))) {
		return "proxy"
	}

	return "unknown"
}

/**
 * @param {Request} request
 */
async function handleRequest(request, env, ctx) {
	if (!DomainTools.auth(request, env, ctx)) {
		return Res.Forbidden("NOT PERMITTED")
	}

	const basicURLObj = new URL(request.url)
	const pathAsURLString = () => {
		let baseURL = basicURLObj.pathname.substring(1) + basicURLObj.search
		baseURL = /^https?:\/\//.test(baseURL) ? baseURL : "https://" + baseURL
		return baseURL
	}

	const service = sniffService(request)

	Logger.debug(request, {
		Service: ":bold:" + service,
		RequestMethod: request.method,
		RequestURL:  Logger.utils.wrap(request.url),
		RequestHeaders: Logger.utils.headers(request, ["Host", "User-Agent", "Referer"])
	})

	if (service === "docker") {
		return DockerMirror.handleRequest(request, env, ctx)
	} else if (service === "github") {
		return GithubMirror.handleRequest(request, env, ctx)
	} else if (service === "git") {
		let baseURL = pathAsURLString()
		baseURL = baseURL.replace(/^http:\/\//, "https://")
		return Res.proxy(baseURL, request, env, ctx)
	} else if (service === "proxy") {
		let baseURL = pathAsURLString()
		return Res.proxy(baseURL, request, env, ctx)
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
