export type UserAgentData = {
    name: string
    version: string
    comment: string
}

export type UserAgentTestFunction = (name: string, version: string, comment: string) => boolean

export type UserAgentTest = UserAgentTestFunction | string | (string | ((s: string) => boolean))[]

export function parseUA(ua: string, toLower = false) {
    const ua_str = toLower ? ua.toLowerCase() : ua
    const res = new Array<UserAgentData>()
    const regex = /^\s*([^\/\s]+)\/([^\/\s]+)(\s+[^\/]+)?/
    let next_ua_str = ua_str
    let r = regex.exec(ua_str)
    while (r !== null) {
        let [match, product_name, product_version, comment] = r
        comment = comment?.replace(/\S+$/, '').trim() || ''
        res.push({ name: product_name, version: product_version, comment })
        match = match.replace(/[^\/\s]+$/, '')
        next_ua_str = next_ua_str.slice(match.length)
        r = regex.exec(next_ua_str)
    }
    return res
}

export function testUA(ua: UserAgentData, test: UserAgentTest) {
    if (typeof test === 'string') test = [test]
    // UserAgentTestFunction
    if (typeof test === 'function') {
        return test(ua.name, ua.version, ua.comment)
    }
    // (string | function)[]
    let cmp = [ua.name, ua.version, ua.comment]
    cmp = cmp.slice(0, test.length)
    return cmp.every((e, i) => {
        if (typeof test[i] === 'function') return test[i](e)
        return test[i] === e
    })
}

export function containsUA(ua: string, ...tests: UserAgentTest[]) {
    let uas = parseUA(ua)
    for (let test of tests) {
        return uas.some(e => testUA(e, test))
    }
    return false
}

export function isContentType(headers: Headers, t: string): boolean {
    if (!headers.has("Content-Type")) return false
    let contentTypes = headers.get("Content-Type")?.split(",") || []
    return contentTypes.some(ct => ct.split(";")[0].trim() === t)
}

export async function hmac_sha256(key: ArrayBuffer, data: ArrayBuffer) {
    const key_1 = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )
    return await crypto.subtle.sign('HMAC', key_1, data)
}

export async function verify_hmac_sha256(key: ArrayBuffer, data: ArrayBuffer, signature: ArrayBuffer) {
    const key_1 = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    )
    return await crypto.subtle.verify('HMAC', key_1, signature, data)
}

export function pathStartsWith(path: string, prefix: string) {
    if (prefix.endsWith('/')) return path.startsWith(prefix)
    if (path.length === prefix.length) return path === prefix
    return path.startsWith(prefix + '/')
}

function toBase64(buffer: ArrayBuffer, padding: boolean = true) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let base64 = '';
    let pad = padding ? '=' : '';

    for (let i = 0; i < len; i += 3) {
        const c1 = bytes[i] >> 2;
        const c2 = ((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4);
        const c3 = ((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6);
        const c4 = bytes[i + 2] & 63;

        base64 += alphabet[c1] + alphabet[c2] + (isNaN(bytes[i + 1]) ? pad : alphabet[c3]) + (isNaN(bytes[i + 2]) ? pad : alphabet[c4]);
    }

    return base64;
}

function fromBase64(base64: string) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const padding = (base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0));
    const len = base64.length * 3 / 4 - padding;
    const arrayBuffer = new ArrayBuffer(len);
    const bytes = new Uint8Array(arrayBuffer);

    let enc1, enc2, enc3, enc4;
    let dec1, dec2, dec3;

    let i = 0;
    let p = 0;

    while (i < base64.length) {
        enc1 = alphabet.indexOf(base64[i++]);
        enc2 = alphabet.indexOf(base64[i++]);
        enc3 = alphabet.indexOf(base64[i++]);
        enc4 = alphabet.indexOf(base64[i++]);

        dec1 = (enc1 << 2) | (enc2 >> 4);
        dec2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        dec3 = ((enc3 & 3) << 6) | enc4;

        bytes[p++] = dec1;
        if (enc3 !== 64) bytes[p++] = dec2;
        if (enc4 !== 64) bytes[p++] = dec3;
    }

    return arrayBuffer;
}

export async function signData(data: Record<string, any>, key: string) {
    const encoder = new TextEncoder();
    const u = new Uint8Array(32)
    u.set(new Uint8Array(encoder.encode(key)))
    const keyBuf = u.buffer
    const dataBuf = encoder.encode(JSON.stringify(data));
    let sign = await hmac_sha256(keyBuf, dataBuf)
    return toBase64(dataBuf, false) + '.' + toBase64(sign, false)
}

export async function verifyData(data: string, key: string): Promise<Record<string, any> | null> {
    const encoder = new TextEncoder();
    const u = new Uint8Array(32)
    u.set(new Uint8Array(encoder.encode(key)))
    const keyBuf = u.buffer
    const [dataBuf, signBuf] = data.split('.').map(e => fromBase64(e));
    let verified = await verify_hmac_sha256(keyBuf, dataBuf, signBuf)
    if (verified) return JSON.parse(new TextDecoder().decode(dataBuf))
    return null
}