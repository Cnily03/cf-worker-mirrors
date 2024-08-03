import { Hono } from "hono";

const app = new Hono<EnvHono>();

app.get('/', async c => {
    return c.json({
        name: c.env['SERVICE_NAME']!,
        version: c.env['VERSION']!,
        repo: 'https://github.com/Cnily03/cf-workers-mirrors',
        author: 'Cnily03',
    }, 200)
})

export default app;
