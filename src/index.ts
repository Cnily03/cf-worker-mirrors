import { Hono } from "hono";
import { HTTPException } from 'hono/http-exception'
import envref, { getenv } from "./mw/envref";
import subdomain from "./mw/subdomain";
import ua from "@/mw/ua";
import mount from "./mw/mount";
import Proxy from "./mw/proxy";
import indexApp from "@/routes/index";
import dockerApp from "@/routes/docker";
import gitApp from "@/routes/git";

const app = new Hono<EnvHono>();

app.use(envref())

app.use(subdomain<EnvHono>([{
	sub: 'docker',
	route: dockerApp
}, {
	sub: 'ghcr',
	route: dockerApp,
	custom: { upstream: "https://ghcr.io", third_repo: true }
}, {
	sub: 'quay',
	route: dockerApp,
	custom: { upstream: "https://quay.io", third_repo: true }
}, {
	sub: 'gcr',
	route: dockerApp,
	custom: { upstream: "https://gcr.io", third_repo: true }
}, {
	sub: 'k8s',
	route: dockerApp,
	custom: { upstream: "https://registry.k8s.io", third_repo: true }
}, {
	sub: 'k8s-gcr',
	route: dockerApp,
	custom: { upstream: "https://k8s.gcr.io", third_repo: true }
}], { domains: () => getenv('DOMAINS')! }))

app.use(ua<EnvHono>([{
	test: 'docker',
	route: dockerApp
}, {
	test: 'git',
	route: gitApp
}], { toLower: false }))

app.use(mount([{
	path: '/docker',
	route: dockerApp
}, {
	path: '/ghcr',
	route: dockerApp,
	custom: { upstream: "https://ghcr.io", third_repo: true }
}, {
	path: '/quay',
	route: dockerApp,
	custom: { upstream: "https://quay.io", third_repo: true }
}, {
	path: '/gcr',
	route: dockerApp,
	custom: { upstream: "https://gcr.io", third_repo: true }
}, {
	path: '/k8s',
	route: dockerApp,
	custom: { upstream: "https://registry.k8s.io", third_repo: true }
}, {
	path: '/k8s-gcr',
	route: dockerApp,
	custom: { upstream: "https://k8s.gcr.io", third_repo: true }
}]))

app.use(Proxy.forwardPath<EnvHono>({
	forbidHTML: () => getenv('FORBID_HTML')!,
	redirect: 'manual',
	autoCompleteProtocol: true
}))

app.route('/', indexApp)

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return err.getResponse()
	}
	console.error(err)
	return c.json({ code: 500, message: 'Internal Server Error' }, 500)
})

export default app