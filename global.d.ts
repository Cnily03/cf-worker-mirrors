interface EnvHono {
    Bindings: Env;
    Variables: {
        path_prefix: string;
    }
}

declare interface Request {
    path_prefix?: string;
    custom_data?: Record<string, any>;
}

type Functional<T> = T | (() => T)