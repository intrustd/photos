export const INTRUSTD_URL = 'intrustd+app://photos.intrustd.com';

export function makeAbsoluteUrl(hash, query) {
    var uri = new URL(location.href)
    uri.hash = hash
    uri.search = query
    return uri.toString()
}
