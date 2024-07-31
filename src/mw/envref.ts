import { createMiddleware } from 'hono/factory';

type EnvRef = { value?: Env }
const ref: EnvRef = {}

export default function envref() {
    return createMiddleware(async (c, next) => {
        ref.value = c.env
        await next()
    })
}

export function getenv<T extends keyof Env>(name: T): Env[T] | undefined {
    return ref.value?.[name]
}
