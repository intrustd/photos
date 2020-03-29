import { List } from 'immutable';

const defaultOptions = {
    keywords: [],
    tags: []
}

export function mkSearch(search) {
    return search.map((s) => s.toQuery()).join('&')
}

export const SearchTermTypes = {
    TYPE: 'TYPE',
    TAG: 'TAG',
    ALBUM: 'ALBUM',
    KEYWORD: 'KEYWORD'
}

export class SearchTerm {
    constructor(d) {
        Object.assign(this, d)
    }

    static type(type) {
        return new SearchTerm({type})
    }

    static tag(tag) {
        return new SearchTerm({tag})
    }

    static album(album) {
        return new SearchTerm({album})
    }

    static keyword(keyword) {
        return new SearchTerm({keyword})
    }

    toQuery() {
        switch ( this.termType ) {
        case SearchTermTypes.TYPE:
            return `type[]=${encodeURIComponent(this.type)}`
        case SearchTermTypes.TAG:
            return `tag[]=${encodeURIComponent(this.tag)}`
        case SearchTermTypes.ALBUM:
            return `album[]=${encodeURIComponent(this.album)}`
        case SearchTermTypes.KEYWORD:
            return `q[]=${encodeURIComponent(this.keyword)}`
        }
    }

    get termType() {
        if ( this.type ) {
            return SearchTermTypes.TYPE
        } else if ( this.tag ) {
            return SearchTermTypes.TAG
        } else if ( this.album ) {
            return SearchTermTypes.ALBUM
        } else if ( this.keyword ) {
            return SearchTermTypes.KEYWORD
        } else
            throw new TypeError('Invalid SearchTerm. Can\'t determine type')
    }

    isEqual(o) {
        var ourType = this.termType
        if ( o.termType != ourType )
            return false

        switch ( ourType ) {
        case SearchTermTypes.TYPE:
            return this.type == o.type;

        case SearchTermTypes.TAG:
            return this.tag == o.tag;

        case SearchTermTypes.ALBUM:
            return this.album == o.album;

        case SearchTermTypes.KEYWORD:
            return this.keyword == o.keyword;
        }
    }
}
