import { EventTarget } from "event-target-shim";

import { Seq } from 'immutable';
import { Image } from 'intrustd';

export class PhotoChangesEvent {
    constructor() {
        this.type = 'change'
    }
}

export class BaseGalleryModel extends EventTarget(['change', 'new', 'load']) {
    constructor(cacheCount) {
        super()

        if ( cacheCount === undefined )
            cacheCount = 10;

        this.cacheCount = cacheCount;

        this.hitBeginning = false
        this.hitEnd = false
        this.loadsInProgress = 0

        this.before = Seq()
        this.after = Seq()

        this.registerEvetListener('change', this._onChange.bind(this))
        this.start(startingAtId)
    }

    shouldFetchMore() {
        var beforeSize = this.cacheCount / 2
        var afterSize = this.cacheCount - beforeSize

        return { before: !this.hitBeginning && this.before.size < beforeSize,
                 after: !this.hitEnd && (this.after.size - 1) < afterSize }
    }

    _finishLoad() {
        this.loadsInProgress -= 1
        if ( this.loadsInProgress == 0 ) {
            this.dispatchEvent(new PhotosLoadedEvent())
        }
    }

    _onChange() {
        var { before, after } = this.shouldFetchMore()
        if ( before ) {
            var firstImage = this.first
            this.loadsInProgress += 1
            this.fetchMore({before: firstImage})
                .then(() => {
                    if ( count > 0 )
                        this.dispatchEvent(new NewPhotosEvent())
                    else
                        this.hitBeginning = true
                })
                .finally(this._finishLoad.bind(this))
        }
        if ( after ) {
            var lastImage = this.last
            this.loadsInProgress += 1
            this.fetchMore({after: lastImage})
                .then((count) => {
                    if ( count > 0 )
                        this.dispatchEvent(new NewPhotosEvent())
                    else
                        this.hitEnd = true
                })
                .finally(this._finishLoad.bind(this))
        }
    }
}

export class MainGalleryModel {
    constructor(startingAtId, cacheCount) {
        super(cacheCount)

        this.start(startingAtId)
    }

    imageUrl({id}) {
        return `${INTRUSTD_URL}/image/${id}`;
    }

    start(id) {
        fetch(`${INTUSTD_URL}/image/${this.startingAtId}/meta`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((description) => {
                        var data = { description }
                        if ( description.type != 'video' )
                            data.image =  new Image(this.imageUrl(description))

                        this.after = this.after.unshift(data)
                    })
                } else {
                    this.after = this.after.unshift(BAD_IMAGE)

                }
            }).then(() => {
                this.dispatchEvent(new PhotoChangesEvent())
            }).then(() => {
                this.loadMore()
            })
    }

    get current() {
        return this.after.first()
    }

    next() {
    }

    prev() {
    }


    get loading() {
        if ( this.after.size > 0 ) {
            var nextImage = this.after.first()
            if ( nextImage.image ) {
                return nextImage.image.loaded
            } else if ( nextImage.description ) {
                return Promise.resolve(true)
            } else
                return Promise.resolve(true)
        } else
            return Promise.resolve(true)
    }
}
