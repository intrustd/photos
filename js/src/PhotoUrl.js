export const KITE_URL = 'kite+app://photos.flywithkite.com';
// export const KITE_URL = 'http://localhost:50051';

export function makeAbsoluteUrl(hash, query) {
    var uri = new URL(location.href)
    uri.hash = hash
    uri.search = query
    return uri.toString()
}
