import { INTRUSTD_URL } from './PhotoUrl.js';
import { justifiedLayout } from './Layout.js';
import { PhotoUpload } from './Uploads.js';

import { EventTarget } from "event-target-shim";

import { Seq, Map, Set } from 'immutable';
import { Image } from 'intrustd';
import LRU from 'lru-cache';
import Moment from 'moment';
import mkFingerTree, {Monoid, Measured} from 'fingertree-js';
import uuid from 'uuid';

const minDate = Moment('0000-01-01 00:00:00')

const LOAD_INCREMENT = 10
const PRELOAD_COUNT = 10
const MAX_SEARCHES_RETAINED = 10

class GalleryMonoid extends Monoid {
    static get mempty() {
        return { images: Set(), items: Set(),
                 count: 0, loadedCount: 0,
                 height: 0,

                 firstDate: null,
                 lastDate: null,

                 lastRowHeight: null,

                 lastImage: null,
                 firstImage: null,

                 firstItem: null,
                 lastItem: null }
    }

    static mappend(a, b) {
        return { images: a.images.union(b.images),
                 items: a.items.union(b.items),

                 height: a.height + b.height,
                 loadedCount: a.loadedCount + b.loadedCount,
                 count: a.count + b.count,

                 lastDate: b.lastDate || a.lastDate,
                 firstDate: a.firstDate || b.firstDate,

                 lastRowHeight: b.lastRowHeight || a.lastRowHeight,
                 lastImage: b.lastImage || a.lastImage,
                 firstImage: a.firstImage || b.firstImage,

                 firstItem: a.firstItem || b.firstItem,
                 lastItem: a.lastItem || b.lastItem }
    }
}

class Item extends Measured {
    constructor(id) {
        super()
        this.id = id
    }
}

export class PhotoItem extends Item {
    constructor(id, cache) {
        super(id)
        this.cache = cache
    }

    get description() {
        return this.cache.get(this.id)
    }

    get created() {
        return Moment(this.description.created)
    }

    get itemId() { return this.id }

    cacheAtSize(sz) {
        var desc = this.description
        if ( desc.image ) {
            return desc.image.atSize(sz)
        }
    }

    measure() {
        return { firstDate: this.created,
                 lastDate: this.created,
                 images: Set([this.id]),
                 items: Set(),
                 loadedCount: 1,
                 count: 1, height: 0,
                 lastRowHeight: null,
                 lastImage: this.id, firstImage: this.id,
                 lastItem: null, firstItem: null }
    }
}

export class AlbumItem extends PhotoItem {
    constructor(desc, imageCache) {
        super(desc.photo.id, imageCache)

        this.albumItemId = desc.id
        this.albumItemCreated = desc.created
    }

    get itemId() { return this.albumItemId }

    measure() {
        var r = super.measure()
        r.created = this.albumItemCreated
        r.items = Set([this.albumItemId])
        r.firstItem = this.albumItemId
        r.lastItem = this.albumItemId
        return r
    }
}

export class TextItem extends Item {
    constructor(desc) {
        super(desc.id)
        this.origId = desc.origId || desc.id
        this.created = desc.created
        this.text = desc.text
        this.height = 100 // Guesstimate

        if ( desc.unsaved )
            this.saved = false
        else
            this.saved = true
    }

    get itemId() { return this.id }

    get description() { return { text: this.text } }

    _copy() {
        var item = new TextItem({id: this.id, created: this.created,
                                 text: this.text, origId: this.origId })
        item.saved = this.saved
        item.height = this.height
        return item
    }

    withHeight( ht ) {
        var d = this._copy()
        d.height = ht
        return d
    }

    withNewId( id ) {
        var d = this._copy()
        d.id = id
        return d
    }

    withNewText(text) {
        var d = this._copy()
        d.text = text
        return d
    }

    measure() {
        return { firstDate: this.created,
                 lastDate: this.created,
                 images: Set(),
                 items: Set([this.id]),
                 loadedCount: 1,
                 count: 1, height: this.height,
                 lastRowHeight: this.height,
                 lastImage: null, firstImage: null,
                 lastItem: this.id, firstItem: this.id }
    }
}

export class Placeholder extends Measured {
    constructor(count, estHeight) {
        super()

        if ( estHeight === undefined )
            throw new TypeError("Estimated height must not be undefined")

        this.count = count
        this.height = estHeight
    }

    measure() {
        return { images: Set(), items: Set(),
                 loadedCount: 0,
                 count: this.count,
                 height: this.height,
                 lastRowHeight: this.height,
                 firstImage: null, lastImage: null,
                 firstItem: null, lastItem: null }
    }

    combine(other) {
        var r = new Placeholder(Math.min(this.count, other.count),
                                Math.max(this.height, other.height)),
            remainingThis = null,
            remainingOther = null

        if ( r.count < this.count )
            remainingThis = new Placeholder(this.count - r.count,
                                            this.height)

        if ( r.count < other.count )
            remainingOther = new Placeholder(other.count - r.count,
                                             other.height)

        return [ r, remainingThis, remainingOther ]
    }

    removeOne() {
        if ( this.count == 1 )
            return null

        return new Placeholder(this.count - 1,
                               this.height)
    }
}

export class Row extends Measured {
    constructor(height) {
        super()
        this.height = height
    }

    measure() {
        return { images: Set(),
                 items: Set(),
                 loadedCount: 0,
                 count: 0,
                 height: this.height,
                 lastRowHeight: this.height,
                 firstImage: null, lastImage: null,
                 firstItem: null, lastItem: null }
    }
}

const GallerySeqBase = mkFingerTree(GalleryMonoid).FingerTree

export class GallerySeq {
    constructor(base) {
        if ( !(base instanceof GallerySeqBase) )
            throw new TypeError("Base must be a finger tree")
        this._base = base
    }

    static fromList(items) {
        return new GallerySeq(GallerySeqBase.fromList(items))
    }

    toList() {
        return this._base.toList()
    }

    append(a) {
        var lastItem = this._base.viewr(true)
        if ( lastItem instanceof Placeholder &&
             a instanceof Placeholder ) {
            var [newBase, _] = this._base.viewr()
            return new GallerySeq(newBase.append(lastItem.combine(a)[0]))
        } else
            return new GallerySeq(this._base.append(a))
    }

    prepend(a) {
        var firstItem = this._base.viewl(true)
        if ( firstItem instanceof Placeholder &&
             a instanceof Placeholder ) {
            var [_, newBase] = this._base.viewl()
            return new GallerySeq(newBase.prepend(firstItem.combine(a)[0]))
        } else
            return new GallerySeq(this._base.prepend(a))
    }

    measure() {
        return this._base.measure()
    }

    get size() {
        return this.measure().count
    }

    get loadedCount() {
        return this.measure().loadedCount
    }

    get needsLoad() {
        var { loadedCount, count } = this.measure()
        return loadedCount < count
    }

    isPhotoLoaded(id) {
        return this._base.measure().images.contains(id)
    }

    isItemLoaded(id) {
        return this._base.measure().items.contains(id)
    }

    _searchForPhoto(id) {
        var p = (vl) => vl.images.contains(id)
        return this._base.search(p)
    }

    _searchForItem(id) {
        var p = (vl) => vl.items.contains(id)
        return this._base.search(p)
    }

    _emptyOnNull(a) {
        if ( a )
            return new GallerySeq(a)
        else
            return GallerySeq.fromList([])
    }

    searchForPhoto(id) {
        var [ before, match, after ] = this._searchForPhoto(id)
        return [ this._emptyOnNull(before),
                 match,
                 this._emptyOnNull(after) ]
    }

    searchForItem(id) {
        var [ before, match, after ] = this._searchForItem(id)
        return [ this._emptyOnNull(before),
                 match,
                 this._emptyOnNull(after) ]
    }

    splitAtPhoto(id, where) {
        if ( this._base.measure().images.contains(id) ) {
            var [ before, match, after ] = this._searchForPhoto(id)

            before = this._emptyOnNull(before)
            after = this._emptyOnNull(after)

            if ( !(match instanceof Item) ) {
                throw new TypeError('Could not split at photo')
            } else {
                if ( where == 'after' )
                    return [ before.append(match),
                             after ]
                else
                    return [ before,
                             after.prepend(match) ]
            }
        } else
            return [ this, GallerySeq.fromList([]) ]
    }

    splitAtIndex(ix) {
        var p
        if ( ix < 0 )
            p = (vl, vr) => vr.count < -ix
        else
            p = (vl, vr) => vl.count > ix

        if ( Math.abs(ix) >= this._base.measure().count ) {
            if ( ix < 0 )
                return [ GallerySeq.fromList([]),
                         this ]
            else
                return [ this, GallerySeq.fromList([]) ]
        }

        var [before, match, after] = this._base.search(p)
        if ( match instanceof Placeholder ) {
            var leftPlaceholder = ix - before.measure().count + 1
            var rightPlaceholder = match.count - leftPlaceholder

            if ( leftPlaceholder > 0 )
                before = before.append(new Placeholder(leftPlaceholder, match.height))

            if ( rightPlaceholder > 0 )
                after = after.prepend(new Placeholder(rightPlaceholder, match.height))

            return [ before, after ]
        } else if ( match instanceof Row ) {
            throw new TypeError("Should not encounter Row when splitting at index")
        } else
            return [ before, after.prepend(match) ]
    }

    splitAtDate(whatDate, id) {
        const findFirstDate = (vl, vr) => {
            return vl.lastDate !== null && vl.lastDate.isSameOrAfter(whatDate)
        }
        var searchRes = this._base.search(findFirstDate)
        var [before, match, after] = searchRes

        if ( before === undefined ) {
            if ( this._base.measure().firstDate.isAfter(whatDate) ) {
                return [ GallerySeq.fromList([]),
                         this ]
            } else {
                return [ this,
                         GallerySeq.fromList([]) ]
            }
        }

        var allPossibilities = after.prepend(match)
        const findLastDate = (vl, vr) => {
            return !vl.lastDate.isSame(whatDate)
        }
        var [matching, lastMatch, afterAll] = allPossibilities.search(findLastDate)

        if ( matching === undefined )
            console.error("Internal error: matching must at least contain the match we added")

        var allMatching = matching.append(lastMatch)
        const findId = (vl, vr) => {
            return vl.images.max() > id
        }
        if ( beforeButMatching === undefined ) {
            // There is no photo for which adding it makes the last id more than id.
            // This means all these photos are ahead of it
            return [ new GallerySeq(GallerySeqBase.concat(before, allMatching)),
                     new GallerySeq(afterAll) ]
        }

        var [beforeButMatching, justOneAfter, afterButMatching] = allMatching.search(findId)
        return [ new GallerySeq(GallerySeqBase.concat(before, beforeButMatching)),
                 new GallerySeq(GallerySeqBase.concat(afterButMatching.prepend(justOneAfter), afterAll)) ]
    }

    splitAtY(y, where) {
        // Broken placeholders get put in both splits, so combining the result of this op is not identity
        var p

        if ( where == 'after' ) {
            p = (vl, vr) => {
                const r = (vl.height - (vl.lastRowHeight ? vl.lastRowHeight : 0)) >= y
                return r
            }
        } else {
            p = (vl, vr) => {
                const r = vl.height >= y
                return r
            }
        }

        var searchRes = this._base.search(p)
        var [ before, match, after ] = searchRes
        if ( before === undefined ) {
            if ( y <= 0 )
                return [ GallerySeq.fromList([]),
                         this ]
            else
                return [ this,
                         GallerySeq.fromList([]) ]
        }

        if ( match instanceof Placeholder ) {
            return [ new GallerySeq(before.append(match)),
                     new GallerySeq(after.prepend(match)) ]
        } else {
            return [ new GallerySeq(before),
                     new GallerySeq(after.prepend(match)) ]
        }
    }

    get empty() {
        return this._base.viewl(true) === undefined
    }

    viewr(preview) {
        var res = this._base.viewr(preview)
        if ( !preview && res === undefined ) {
            return [ GallerySeq.fromList([]), res ]
        } else if ( !preview && res.length == 2 ) {
            return [ new GallerySeq(res[0]),
                     res[1] ]
        } else
            return res
    }

    viewl(preview) {
        var res = this._base.viewl(preview)
        if ( !preview && res === undefined ) {
            return [ res, GallerySeq.fromList([]) ]
        } else if ( !preview && res.length == 2 ) {
            return [ res[0], new GallerySeq(res[1]) ]
        } else
            return res
    }

    static concat(a, b) {
        var aRight = a.viewr(true)
        var bLeft = b.viewl(true)
        if ( aRight instanceof Placeholder && bLeft instanceof Placeholder ) {
            var aRest = a.viewr()
            var bRest = b.viewl()
            return new GallerySeq(GallerySeqBase.concat(aRest.append(new Placeholder(aRight.count + bLeft.count, Math.max(aRight.estHeight, bLeft.estHeight))),
                                                        bRest))
        } else
            return new GallerySeq(GallerySeqBase.concat(a._base, b._base))
    }

    mergeHelper(what) {
        var whatFirst = what.viewl(true)
        if ( whatFirst === null || whatFirst === undefined )
            return [ this.gallery,
                     GallerySeq.fromList([]),
                     GallerySeq.fromList([]) ]

        var before, after

        if ( whatFirst instanceof PhotoItem )
            [ before, after ] = this.splitAtPhoto(whatFirst.itemId, 'before')
        else {
            before = GallerySeq.fromList([])
            after = this
        }

        var newMiddle = GallerySeq.fromList([])

//        console.log("Start merge", this.toList())
//        console.log("Broke at ", what.measure().firstImage)
//        console.log("Considering", after.toList(), what.toList())

        while ( !after.empty || !what.empty ) {
            if ( what.empty ) break

            if ( after.empty ) {
                after = what
                break
            }

            var afterNext = after.viewl(true),
                whatNext = what.viewl(true)

            var newItem = whatNext,
                curItem = afterNext

            if ( curItem instanceof Row ) {
                after = after.viewl()[1]
                continue
            }

            if ( newItem instanceof Row ) {
                what = what.viewl()[1]
                continue
            }

            if ( curItem instanceof Placeholder &&
                 newItem instanceof Placeholder ) {
                var [newPlaceholder, remainingCur, remainingNew] = curItem.combine(newItem)
                newMiddle = newMiddle.append(newPlaceholder)

                after = after.viewl()[1]
                if ( remainingCur )
                    after = after.prepend(remainingCur)

                what = what.viewl()[1]
                if ( remainingNew )
                    what = what.prepend(remainingNew)

                newMiddle = newMiddle.append(newPlaceholder)
            } else if ( curItem instanceof Placeholder ) {
                var remainingCur = curItem.removeOne()

                newMiddle = newMiddle.append(newItem)

                after = after.viewl()[1]
                if ( remainingCur )
                    after = after.prepend(remainingCur)
                what = what.viewl()[1]
            } else if ( newItem instanceof Placeholder ) {
                var remainingNew = newItem.removeOne()

                newMiddle = newMiddle.append(curItem)

                what = what.viewl()[1]
                if ( remainingNew )
                    what = what.prepend(remainingNew)
                after = after.viewl()[1]
            } else {
                if ( curItem.itemId == newItem.itemId ) {
//                    console.log("Matching", curItem.id, newItem.id, after.toList(), what.toList())
//                    console.log("Middle is", newMiddle.toList())
                    newMiddle = newMiddle.append(curItem)
                    what = what.viewl()[1]
                    after = after.viewl()[1]
                } else {
                    console.error("Misaligned sequence in merge. Expected: ", curItem, " GOt: ", newItem)
                    throw new TypeError('Misaligned sequence in merge')
                }
            }
        }

        return [ before, newMiddle, after ]
    }
}

export class PhotoNotFoundError {
    constructor(id) {
        this.id = id
    }
}

export class AlbumNotFoundError {
    constructor(id) {
        this.albumId = id
    }
}

export class InvalidResponseError {
    constructor(status, when) {
        this.status = status
        this.when = when
    }
}

class GalleryStartsEvent {
    constructor() {
        this.type = 'starts'
    }
}

export class PhotoChangesEvent {
    constructor() {
        this.type = 'change'
    }
}

export class PhotosLoadedEvent {
    constructor() {
        this.type = 'load'
    }
}

export class GalleryErrorEvent {
    constructor(msg) {
        this.type = 'error'
        this.message = msg
    }
}

class SizeCache {
    constructor(id) {
        this.id = id
        this.sizes = {}
    }

    _imageUrl(size) {
        return `${INTRUSTD_URL}/image/${this.id}?size=${size}`;
    }


    atSize(size) {
        if ( this.sizes.hasOwnProperty(size) ) {
            return this.sizes[size]
        } else {
            var im = new Image(this._imageUrl(size))
            this.sizes[size] = im
            return im
        }
    }
}

export class ImageCache extends EventTarget(['change']) {
    constructor() {
        super()

        this.images = Map()
    }

    update(description) {
        var old = this.images.get(description.id) || {}

        var newImage = Object.assign({}, old)

        if ( newImage.id === undefined )
            newImage.id = description.id

        if ( description.description !== undefined )
            newImage.description = description.description

        if ( description.created !== undefined && newImage.created === undefined )
            newImage.created = description.created

        if ( description.modified !== undefined && newImage.modified === undefined )
            newImage.modified = description.modified

        if ( description.width !== undefined && newImage.width === undefined )
            newImage.width = description.width

        if ( description.height !== undefined && newImage.height === undefined )
            newImage.height = description.height

        if ( description.type !== undefined && newImage.type === undefined )
            newImage.type = description.type

        if ( description.progress === undefined && newImage.progress !== undefined )
            delete newImage.progress

        if ( description.progress !== undefined )
            newImage.progress = Object.assign({}, description.progress)

        if ( description.formats !== undefined )
            newImage.formats = description.formats

        if ( newImage.image === undefined && newImage.type == 'photo' ) {
            newImage.image = new SizeCache(newImage.id)
        }

        this.images = this.images.set(description.id, newImage)
    }

    get(id) {
        return this.images.get(id)
    }
}

export class BaseGalleryModel extends EventTarget(['change', 'new', 'load', 'error', 'starts' ]) {
    constructor(opts) {
        super()

        if ( opts === undefined )
            opts = { imageCache: new ImageCache() }

        var { imageCache } = opts

        this.imageCache = imageCache

        this.hitBeginning = false
        this.hitEnd = false
        this.loadsInProgress = 0

        this.gallery = GallerySeq.fromList([])
        this.started = false
    }

    get height() {
        return this.gallery.measure().height
    }

    get loadedPhotosCount() {
        return this.gallery.measure().count
    }

    getItemAt({x, y}) {
        var [ before, afterY ] = this.gallery.splitAtY(y)
        var nextItem = afterY.viewl()
        if ( !nextItem || nextItem.length == 0 ) {
            var lastItem = before.viewr(true)
            if ( !lastItem )
                return null;

            if ( lastItem instanceof PhotoItem )
                return { 'after': lastItem.itemId }
            else
                return { 'after': lastItem.id }
        }

        if ( nextItem[0] instanceof Row ) {
            var rowHeight = nextItem[0].height
            afterY = nextItem[1]
            nextItem = afterY.viewl()
            var left = this.margin
            while ( nextItem && nextItem.length > 0 ) {
                [nextItem, afterY] = nextItem
                if ( nextItem instanceof Row ) return null;
                else if ( nextItem instanceof TextItem ) return null
                else if ( nextItem instanceof PhotoItem ) {
                    var photo = nextItem.description
                    var thisWidth = photo.width * (rowHeight/photo.height)
                    var halfWidth = thisWidth / 2
                    if ( x < (left + halfWidth))
                        return { 'before': nextItem.itemId }

                    left += thisWidth

                    if ( x < left )
                        return { 'after': nextItem.itemId }

                    left += this.margin
                }
                nextItem = afterY.viewl()
            }
            return null
        } else if ( nextItem[0] instanceof TextItem ) {
            var margin = Math.ceil(this.width * 0.20)

            if ( x <= margin )
                return { 'before': nextItem[0].id }
            else if ( x >= (this.width - margin) )
                return { 'after': nextItem[0].id }
            else
                return null
        }

        return null
    }

    getBetween(minY, maxY) {
        var [ beforeScroll, afterScroll ] = this.gallery.splitAtY(minY, 'before')
        var [ target, afterVisible ] = afterScroll.splitAtY(maxY - minY, 'after')


        var msBefore = beforeScroll.measure()
        var msAfter = afterVisible.measure()

//        console.log("Getting", minY, maxY, this.gallery.measure(), this.gallery)
//        console.log("Splits are before:", beforeScroll.measure())
//        console.log("After:", afterScroll.measure())
//        console.log("Target:", target.measure())
//        console.log("After visible:", afterVisible.measure())

        var res = []

        while ( true ) {
            var nextItemRes = target.viewl()
            if ( !nextItemRes || nextItemRes.length == 0 )
                break

            var [ nextItem, targetNext ] = nextItemRes

            res.push( [ msBefore,
                        GalleryMonoid.mappend(targetNext.measure(), msAfter),
                        nextItem ] )

            msBefore = GalleryMonoid.mappend(msBefore, nextItem.measure())
            target = targetNext
        }

        return { images: res,
                 beforeHeight: minY,
                 afterHeight: msAfter.height,
                 afterStart: msBefore.height + target.measure().height }
    }

    _loadPhoto(id) {
        return fetch(`${INTRUSTD_URL}/image/${id}/meta?countFrom[]=beginning`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((desc) => {
                        this.imageCache.update(desc)
                        return desc
                    })
                } else if ( r.status == 404 ) {
                    throw new PhotoNotFoundError(id)
                } else
                    return Promise.reject(`_loadPhoto: Invalid status: ${r.status}`)
            })
    }

    _callAfterStart(toCall) {
        return new Promise((resolve, reject) => {
            if ( this.started )
                resolve(toCall())
            else {
                const fn = () => {
                    resolve(toCall())
                    this.removeEventListener('starts', fn)
                }
                this.addEventListener('starts', fn)
            }
        })
    }

    /// Starts loading around the given photo
    loadAround(aroundWhat) {
        return this._callAfterStart(() => {
            if ( this.gallery.isPhotoLoaded(aroundWhat) ) {
                var [ before, middle, after ] = this.gallery.searchForPhoto(aroundWhat)
                var [ _, immBefore ] = before.splitAtIndex(-LOAD_INCREMENT)
                var [ immAfter, _ ] = after.splitAtIndex(LOAD_INCREMENT)

                var beforePromise, afterPromise

                if ( immAfter.measure().loadedCount < immAfter.measure().count ) {
                    afterPromise = this.loadAfter(aroundWhat)
                        .then(() => {
                            var [ _, _, after ] = this.gallery.searchForPhoto(aroundWhat)
                            return after.measure().firstImage
                        })
                } else {
                    afterPromise = Promise.resolve(after.measure().firstImage)
                }

                if ( immBefore.measure().loadedCount < immBefore.measure().count ) {
                    beforePromise = this.loadBefore(aroundWhat)
                    beforePromise = beforePromise
                        .then(() => {
                            var [ before, _, _ ] = this.gallery.searchForPhoto(aroundWhat)
                            return before.measure().lastImage
                        })
                } else {
                    beforePromise = Promise.resolve(before.measure().lastImage)
                }

                return Promise.all([beforePromise, afterPromise])
                    .then(([beforeId, afterId]) => {
                        var curImage
                        if ( middle instanceof PhotoItem )
                            curImage = this.imageCache.get(middle.id)
                        else
                            curImage = middle
                        return { beforeId, afterId,
                                 curImage,
                                 context: this.getAllAround(aroundWhat) }
                    })
            } else {
                // Load this photo
                return this._loadPhoto(aroundWhat)
                    .then((desc) => {
                        var before = desc.countsFrom['beginning']
                        var items = []
                        if ( before > 0 )
                            items.push(new Placeholder(before, 0))

                        this.imageCache.update(desc)
                        items.push(new PhotoItem(aroundWhat, this.imageCache))

                        this._merge(GallerySeq.fromList(items))

                        return this.loadAfter(aroundWhat)
                    })
                    .then(() => {
                        return this.loadBefore(aroundWhat)
                    }).then(() => {
                        this.dispatchEvent(new PhotosLoadedEvent())

                        var [ before, middle, after ] = this.gallery.searchForPhoto(aroundWhat)
                        return { beforeId: before.measure().lastImage,
                                 afterId: after.measure().firstImage,
                                 curImage: middle.description,
                                 context: this.getAllAround(aroundWhat) }
                    })
            }
        })
    }

    getAllAround(aroundWhat) {
        var [ before, middle, after ] = this.gallery.searchForPhoto(aroundWhat)
        var [ _, immBefore ] = before.splitAtIndex(-LOAD_INCREMENT)
        var [ immAfter, _ ] = after.splitAtIndex(LOAD_INCREMENT)

        return [...immBefore.toList(),
                middle,
                ...immAfter.toList()]
    }

    loadAfter(afterWhich) {
        return this._callAfterStart(() => {
            var afterPhoto = this.imageCache.get(afterWhich)
            var [ before, _, after ] = this.gallery.searchForPhoto(afterWhich, 'after')
            var firstAfter = after.measure().firstImage
            var lastBefore = before.measure().lastImage

            return this._doLoadBetween({ after: afterPhoto,
                                         count: LOAD_INCREMENT,
                                         prevPhoto: lastBefore,
                                         nextPhoto: firstAfter })
                .then(this._prepareMerge(lastBefore, firstAfter))
                .then(this._merge.bind(this))
                .then(() => {
                    //                console.log("Gallery changed")
                    this.dispatchEvent(new PhotosLoadedEvent())
                })
        })
    }

    loadBefore(beforeWhich) {
        return this._callAfterStart(() => {
            var beforePhoto = this.imageCache.get(beforeWhich)
            var [ before, _, after ] = this.gallery.searchForPhoto(beforeWhich, 'before')
            var lastBefore = before.measure().lastImage
            var firstAfter = after.measure().firstImage

            return this._doLoadBetween({ before: beforePhoto,
                                         count: LOAD_INCREMENT,
                                         prevPhoto: lastBefore,
                                         nextPhoto: firstAfter })
                .then(this._prepareMerge(lastBefore, firstAfter))
                .then(this._merge.bind(this))
                .then(() => {
                    this.dispatchEvent(new PhotosLoadedEvent())
                })
        })
    }

    _prepareMerge(lastId, nextId) {
        return ({afterCount, beforeCount, images}) => {
            var items = []

            if ( lastId && beforeCount !== undefined ) {
//                console.log("Adding lastId", lastId, beforeCount)
                if ( beforeCount > 0 ) {
                    items.push(new PhotoItem(lastId, this.imageCache))
                    items.push(new Placeholder(beforeCount, 100))
                } else {
                    // It's possible lastId is within images. If so, then discard
                    if ( images.every(({id}) => id != lastId) ) {
                        items.push(new PhotoItem(lastId, this.imageCache))
                    }
                }
            }

            images.map((im) => {
                this.imageCache.update(im)
                items.push(new PhotoItem(im.id, this.imageCache))
            })

            if ( nextId && afterCount !== undefined ) {
                if ( afterCount > 0 ) {
                    items.push(new Placeholder(afterCount, 100))
                    items.push(new PhotoItem(nextId, this.imageCache))
                } else {
                    // See note above
                    if ( images.every(({id}) => id != nextId) ) {
                        items.push(new PhotoItem(nextId, this.imageCache))
                    }
                }
            }

//            console.log("_prepareMerge", lastId, nextId, beforeCount, afterCount, images)

            return GallerySeq.fromList(items)
        }
    }

    _merge(what) {
        var [ before, newMiddle, after ] = this.gallery.mergeHelper(what)

        this._relayoutConcat(before, newMiddle, after)
    }

    _relayoutConcat(before, newMiddle, after) {
        var placeholderBefore = (before.viewr(true) instanceof Placeholder ||
                                 newMiddle.viewl(true) instanceof Placeholder),
            placeholderAfter =  (after.viewl(true) instanceof Placeholder ||
                                 newMiddle.viewr(true) instanceof Placeholder)

        var newGallery

        // Relayout anything that needs it
        if (  placeholderBefore && placeholderAfter ) {
            newMiddle = this._doLayout(newMiddle)
            newGallery = GallerySeq.concat(GallerySeq.concat(before, newMiddle), after)
        } else if ( placeholderBefore ) {
            newMiddle = this._doLayout(GallerySeq.concat(newMiddle, after))
            newGallery = GallerySeq.concat(before, newMiddle)
        } else if ( placeholderAfter ) {
            newMiddle = this._doLayout(GallerySeq.concat(before, newMiddle))
            newGallery = GallerySeq.concat(newMiddle, after)
        } else {
            newGallery = GallerySeq.concat(GallerySeq.concat(before, newMiddle), after)
            newGallery = this._doLayout(newGallery)
        }


//        console.log("Done laying out", newGallery.toList())
        this.gallery = newGallery
        return this.gallery
    }

    start(ims) {
        this.gallery = GallerySeq.fromList(ims)
        this.relayout()

        if ( !this.started ) {
            console.log("Sending start event")
            this.dispatchEvent(new GalleryStartsEvent())
            this.started = true
        }
    }

    layout(width, opts) {
        const defaultOpts = { targetHeight: 300,
                              margin: 2 }
        opts = Object.assign({}, defaultOpts, opts)

        if ( this.width == width &&
             this.targetHeight == opts.targetHeight &&
             this.margin == opts.margin )
            return

        this.width = width
        this.targetHeight = opts.targetHeight
        this.margin = opts.margin

        this.relayout()
    }

    _doLayout(ims) {
        if ( this.width !== undefined &&
             this.targetHeight !== undefined &&
             this.margin !== undefined )
            return justifiedLayout(ims, this.width, this.targetHeight, this.margin)
        else
            return ims
    }

    relayout() {
        this.gallery = this._doLayout(this.gallery)
        this.dispatchEvent(new PhotosLoadedEvent())
    }

    _doUpdateDescription(imId, description) {
        console.log("Updating description", imId, this.imageCache.get(imId))
        return fetch(`${INTRUSTD_URL}/image/${imId}/description`,
                     { method: 'PUT',
                       body: description })
            .then((r) => {
                if ( r.ok ){
                    this.imageCache.update({id: imId, description})
                    this.dispatchEvent(new PhotosLoadedEvent())
                    return null;
                } else
                    return Promise.reject(`Invalid status while updating description: ${r.status}`)
            })
    }

    removePhotoByPhotoId(id) {
        if ( this.gallery.isPhotoLoaded(id) ) {
            var [ before, what, after ] = this.gallery.searchForPhoto(id)
            this._relayoutConcat(before, GallerySeq.fromList([]), after)
            this.dispatchEvent(new PhotosLoadedEvent())
            return what
        } else
            return null
    }

    removePhotoByItemId(id) {
        if ( this.gallery.isItemLoaded(id) ) {
            var [ before, what, after ] = this.gallery.searchForItem(id)
            this._relayoutConcat(before, GallerySeq.fromList([]), after)
            this.dispatchEvent(new PhotosLoadedEvent())
            return what
        } else
            return null
    }
}

export class AlbumModel extends BaseGalleryModel {
    constructor(albumId, opts) {
        super(opts)

        this.albumId = albumId

        if ( opts.content ) {
            this._loadContent(opts.content)
        } else {
            this.start()
        }
    }

    reorder(whichItem, where) {
        var position = this._getBefore(whichItem, where)
        if ( position )
            return this._reorder(whichItem, position)
        else
            return Promise.resolve()
    }

    _getBefore(what, where) {
        if ( where.before == what || where.after == what )
            return null
        if ( where.before ) {
            var [ before, _, _] = this.gallery.searchForItem(where.before)
            if ( before.measure().lastItem == what )
                return null
            else
                return where.before
        } else {
            var [ _, _, remaining ] = this.gallery.searchForItem(where.after)
            var remainingMeasure = remaining.measure()
            if ( remainingMeasure.firstItem == what )
                return null
            else if ( remainingMeasure.firstItem )
                return remainingMeasure.firstItem
            else
                return 'end'
        }
    }

    _doReorder(what, beforeWhat) {
        var oldItem = this.removePhotoByItemId(what)
        console.log("Do reorder, got item", oldItem)
        if ( oldItem == null )
            return

        console.log("Is before loaded", this.gallery.isItemLoaded(beforeWhat))
        if ( beforeWhat != 'end' && !this.gallery.isItemLoaded(beforeWhat) )
            return

        if ( beforeWhat == 'end' ) {
            this.gallery = this.gallery.append(oldItem)
        } else {
            var [ before, beforeWhatItem, after ] = this.gallery.searchForItem(beforeWhat)
            console.log("Inserting at", before, beforeWhatItem, after)
            this.gallery = GallerySeq.concat(before.append(oldItem).append(beforeWhatItem),
                                             after)
        }

        console.log("Got gallery", this.gallery.toList())

        this.gallery = this._doLayout(this.gallery)

        this.dispatchEvent(new PhotosLoadedEvent())
    }

    _reorder(what, beforeWhat) {
        var url = `${INTRUSTD_URL}/albums/${this.albumId}`;
        if ( beforeWhat == 'end' )
            url = `${url}/end`;
        else
            url = `${url}/${beforeWhat}/before`;

        this._doReorder(what, beforeWhat)
        console.log("Did rearder", what, beforeWhat,
                    this.gallery.toList())

        return fetch(url, { method: 'PUT',
                            headers: { 'Content-type': 'application/json' },
                            body: JSON.stringify({id: what}) })
            .then((r) => {
                if ( r.ok ) {
                    return null
                } else {
                    return Promise.reject(`Invalid status: ${r.status}`)
                }
            }).catch((e) => {
                return Promise.reject('Could not move photo')
            })
    }

    setName(newTitle) {
        return fetch(`${INTRUSTD_URL}/albums/${this.albumId}`,
                     { method: 'PUT',
                       headers: { 'Content-type': 'application/json' },
                       body: JSON.stringify({name: newTitle}) })
            .then((r) => {
                if ( r.ok )
                    return r.json().then(({name}) => {
                        this.setState({name})
                    })
                else return Promise.reject(`Invalid status: ${r.status}`)
            }).catch(() => {
                return Promise.reject('Could not set title')
            })
    }

    setText(textId, newText) {
        if ( this.gallery.isItemLoaded(textId) ) {
            var [ before, text, after ] = this.gallery.searchForItem(textId)
            if ( text instanceof TextItem ) {
                text = text.withNewText(newText)
                this.gallery = GallerySeq.concat(before.append(text),
                                                 after)

                this.dispatchEvent(new PhotosLoadedEvent())

                return fetch(`${INTRUSTD_URL}/albums/${this.albumId}/${textId}`,
                             { method: 'PUT',
                               body: JSON.stringify(text.description),
                               headers: { 'Content-type': 'application/json' } })
                    .then((r) => {
                        if ( r.ok )
                            return
                        else
                            return Promise.reject(`Invalid status while updating text: ${r.status}`)
                    }).catch((e) => {
                        console.error('Could not update text', textId, e)
                        return Promise.reject('Could not update text')
                    })
            } else
                return Promise.resolve()
        }
    }

    addTextAround(y) {
        var [ beforeScroll, afterScroll ] = this.gallery.splitAtY(y, 'before')
        var item = new TextItem({ created: Moment(),
                                  id: uuid.v4(),
                                  unsaved: true,
                                  text: 'New Text'})
        var textSegment = GallerySeq.fromList([item])
        textSegment = this._doLayout(textSegment)
        this.gallery = GallerySeq.concat(beforeScroll, textSegment)
        this.gallery = GallerySeq.concat(this.gallery, afterScroll)

        this.dispatchEvent(new PhotosLoadedEvent())

        var after = afterScroll.measure()
        var url = `${INTRUSTD_URL}/albums/${this.albumId}`
        if ( after.firstItem )
            url = `${url}/${after.firstItem}/before`
        else
            url = `${url}/end`

        return fetch(url, { method: 'POST',
                            body: JSON.stringify([item.description]),
                            headers: { 'Content-type': 'application/json' } })
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then(({id}) => {
                        this._changeItemId(item.id, id)
                        return id
                    })
                } else {
                    return Promise.reject(`Invalid status code while adding text: ${r.status}`)
                }
            }).catch((e) => {
                return Promise.reject(`Could not add text: ${e}`)
            })
    }

    _changeItemId(oldId, newId) {
        if ( this.gallery.isItemLoaded(oldId) ) {
            var [ before, item, after ] = this.gallery.searchForItem(oldId)
            if ( item instanceof TextItem ) {
                item = item.withNewId(newId)
                this.gallery = GallerySeq.concat(before.append(item),
                                                 after)
            }

            this.dispatchEvent(new PhotosLoadedEvent())
        }
    }

    start() {
        fetch(`${INTRUSTD_URL}/albums/${this.albumId}`,
              { method: 'GET' })
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then(this._loadContent.bind(this))
                } else if ( r.status == 404 ) {
                    return Promise.reject(new AlbumNotFoundError(this.albumId))
                } else
                    return Promise.reject(`Invalid status while loading album: ${r.status}`)
            })
            .catch((e) => {
                this.dispatchEvent(new GalleryErrorEvent(e))
                return Promise.reject(e)
            })
    }

    get description() {
        return { name: this.name,
                 created: this.created }
    }

    _loadContent(content) {
        var oldName = this.name
        this.name = content.name
        this.created = content.created

        var newContent = []

        content.content.map((i) => {
            if ( i.hasOwnProperty("photo") ) {
                this.imageCache.update(i.photo)
                newContent.push(new AlbumItem(i, this.imageCache))
            } else if ( i.hasOwnProperty("text") ) {
                newContent.push(new TextItem(i))
            } else {
                console.error(`Ignoring album item with invalid type: ${i.id}`)
            }
        })

        super.start(newContent)
    }

    updateDescription(imId, description) {
        return this._doUpdateDescription(imId, description)
    }

    removeAlbumItem(itemId) {
        if ( this.gallery.isItemLoaded(itemId) ) {
            this.removePhotoByItemId(itemId)

            return fetch(`${INTRUSTD_URL}/albums/${this.albumId}/${itemId}`,
                         { method: 'DELETE' })
                .then((r) => {
                    if ( !r.ok ) {
                        console.error('Invalid status while deleting item', r.status)
                        return Promise.reject(`Invalid status while deleting item: ${r.status}`)
                    }
                }).catch((e) => {
                    console.error('Could not delete item', itemId, this.albumId, e)
                    return Promise.reject('Could not delete item')
                })
        } else
            return Promise.resolve()
    }
}

export class MainGalleryModel extends BaseGalleryModel {
    constructor(opts) {
        var { startingAt, queryStr } = opts

        delete opts.startingAt
        delete opts.queryStr

        super(opts)

        this.queryStr = queryStr
        this.start(startingAt)
    }

    start(id) {
        if ( id !== undefined ) {
            fetch(`${INTUSTD_URL}/image/${this.startingAtId}/meta`)
                .then((r) => {
                    if ( r.ok ) {
                        return r.json().then(({image, afterCount, beforeCount}) => {
                            this.imageCache.update(image)
                            super.start([new Placeholder(beforeCount, 100),
                                         new PhotoItem(image.id, this.imageCache),
                                         new Placeholder(afterCount, 100)])
                        })
                    } else
                        return Promise.reject(`Invalid status: ${r.status} (while loading main gallery)`)
                })
                .catch((e) => {
                    this.dispatchEvent(new GalleryErrorEvent('Could not load first image'))
                })
        } else {
            fetch(`${INTRUSTD_URL}/image?limit=${LOAD_INCREMENT}${this.fullQueryStr}`,
                  { cache: 'no-store' })
                .then((r) => {
                    if ( r.ok ) {
                        return r.json().then((ims) => {
                            var items = ims.images.map((d) => {
                                this.imageCache.update(d)
                                return new PhotoItem(d.id, this.imageCache)
                            })
                            super.start([...items,
                                         new Placeholder(ims.total - items.length,
                                                         100)])
                        })
                    } else {
                        this.dispatchEvent(new GalleryErrorEvent('Could not load images'))
                    }
                })
        }
    }

    addPhoto(photo) {
        if ( this.gallery.measure().images.contains(photo.id) )
            return
        else {
            var [ before, after ] = this.gallery.splitAtDate(photo.created, photo.id)

            this.imageCache.update(photo)
            this._relayoutConcat(before,
                                 GallerySeq.fromList([new PhotoItem(photo.id, this.imageCache)]),
                                 after)

            this.dispatchEvent(new PhotosLoadedEvent())
        }
    }

    _mkSearch(limit) {
        return [ `limit=${limit}` ]
    }

    get fullQueryStr() {
        var queryStr = ''
        if ( this.queryStr )
            queryStr = `&${this.queryStr}`
        return queryStr
    }

    _doLoadBetween(opts) {
        var search = this._mkSearch(opts.count || LOAD_INCREMENT)

        if ( opts.after ) {
            search.push(`after_id=${opts.after.id}`)
            search.push(`after_date=${opts.after.created}`)
        }

        if ( opts.before ) {
            search.push(`before_id=${opts.before.id}`)
            search.push(`before_date=${opts.before.created}`)
        }

        if ( opts.nextPhoto )
            search.push(`countUntil[]=${opts.nextPhoto}`)
        else
            search.push(`countUntil[]=end`)

        if ( opts.prevPhoto )
            search.push(`countFrom[]=${opts.prevPhoto}`)
        else
            search.push(`countFrom[]=beginning`)

        return fetch(`${INTRUSTD_URL}/image?${search.join('&')}${this.fullQueryStr}`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then(({images, total,
                                           countsUntil, countsFrom}) => {
                        var data = { images, total }
                        if ( opts.nextPhoto )
                            data.afterCount = countsUntil[opts.nextPhoto]
                        else
                            data.afterCount = countsUntil['end']

                        if ( opts.prevPhoto )
                            data.beforeCount = countsFrom[opts.prevPhoto]
                        else
                            data.beforeCount = countsFrom['beginning']

                        return data
                    })
                } else
                    return Promise.reject(`Load failed: ${r.status}`)
            })
    }

    get current() {
        return this.imageCache.get(this.after.first() || '')
    }

    get prevImageId() {
        return this.before.last()
    }

    get nextImageId() {
        return this.after.skip(1).first()
    }

    updateDescription(imId, description) {
        return this._doUpdateDescription(imId, description)
    }
}

export class Photos {
    constructor() {
        this._cache = new ImageCache()
        this._mainGallery = null
        this._albums = Map()
        this._searches = new LRU(MAX_SEARCHES_RETAINED)
        this._uploadKey = 0
    }

    get mainGallery() {
        if ( this._mainGallery === null ) {
            this._mainGallery = new MainGalleryModel({imageCache: this._cache,
                                                      cacheCount: 10})
        }
        return this._mainGallery
    }

    searchGallery(queryStr) {
        if ( queryStr == '' )
            return this.mainGallery
        else {
            var searchModel = this._searches.get(queryStr)
            if ( searchModel )
                return searchModel

            searchModel = new MainGalleryModel({ imageCache: this._cache,
                                                 cacheCount: 10,
                                                 queryStr })
            this._searches.set(queryStr, searchModel)

            return searchModel
        }
    }

    album(id) {
        if ( this._albums.get(id) !== undefined ) {
            return Promise.resolve(this._albums.get(id))
        } else {
            return fetch(`${INTRUSTD_URL}/albums/${id}`,
                         { method: 'GET' })
                .then((r) => {
                    if ( r.ok ) {
                        console.log("Fetched album", id)
                        return r.json().then((content) => {
                            this._albums = this._albums.set(id, new AlbumModel(id,
                                                                               {content,
                                                                                imageCache: this._cache,
                                                                                cacheCount: 10}))
                            return this.album(id)
                        })
                    } else if ( r.status == 404 ) {
                        return Promise.reject(new AlbumNotFoundError(id))
                    } else {
                        return Promise.reject(new InvalidResponseError(r.status, `while loading album ${id}`))
                    }
                })
        }
    }

    _newUploadKey() {
        var key = this._uploadKey
        this._uploadKey += 1

        return key
    }

    _addToMainGallery(e) {
        if ( e.photo ) {
            this.mainGallery.addPhoto(e.photo)
        }
    }

    _addUploadToAlbum(albumId, e) {
        if ( e.photo ) {
            this.album(albumId).then((album) => {
                album.start() // Refresh contents
            })
        }
    }

    uploadPhoto(photo, albumId) {
        var newFormData = new FormData()
        newFormData.append('photo', photo)

        var upload = new PhotoUpload(this._newUploadKey(), newFormData)

        if ( albumId ) {
            var completeFn = this._addUploadToAlbum.bind(this, albumId)
            upload.addEventListener('complete', completeFn)
        }

        upload.addEventListener('complete', this._addToMainGallery.bind(this))

        return upload
    }

    deletePhoto(photoId) {
        return fetch(`${INTRUSTD_URL}/image/${photoId}`,
                     { method: 'DELETE' })
            .then((r) => {
                if ( r.ok ) {
                    this.mainGallery.removePhotoByPhotoId(photoId)
                    var albums = this._albums.valueSeq().toArray()
                    albums.map((a) => a.removePhotoByPhotoId(photoId))
                } else {
                    return Promise.reject(`Invalid status while deleting ${photoId}: ${r.status}`)
                }
            })
    }
}
