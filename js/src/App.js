import UIKit from 'uikit';
import 'uikit/src/less/uikit.theme.less';

import { install, mintToken } from 'intrustd';

import Albums from './Albums';
import Gallery from './Gallery';
import Navbar from './Navbar';
import { INTRUSTD_URL, makeAbsoluteUrl } from './PhotoUrl.js';

import { Map, Set, OrderedSet, List } from 'immutable';
import react from 'react';
import ReactDom from 'react-dom';
import { HashRouter as Router,
         Route, Switch,
         Link } from 'react-router-dom';

import './photos.svg';

import streamsaver from 'streamsaver';

if ( HOSTED_MITM )
    streamsaver.mitm = HOSTED_MITM;

export class CouldNotDownloadImageError {
    constructor(code) {
        this.code = code
    }
}

export class UnknownContentTypeError {
    constructor(ty) {
        this.contentType = ty
        console.error("UnknownContentType: " + ty)
    }
}

class PhotoUpload {
    constructor(key, formData) {
        this.key = key
        this.formData = formData
        this.onProgress = (e) => {}
        this.onComplete = (e) => {}

        var photos = this.formData.getAll('photo')

        if ( photos.length > 0 )
            this.fileName = photos[0].name
        else
            this.fileName = "Photo"
    }

    start() {
        this.req = new XMLHttpRequest()

        this.req.addEventListener('load', () => {
            this.onProgress({ error: false, complete: 100, total: 100 })

            var photo = null
            try {
//                console.log("Got response", this.req.responseText)
                photo = JSON.parse(this.req.responseText)
            } catch (e) {
                photo = null
            }

            this.onComplete(photo)
        })

        this.req.addEventListener('error', (e) => {
            this.onProgress({ error: true, what: e })
            this.onComplete(null)
        })

        this.req.addEventListener('progress', (e) => {
            var progData = { error: false, complete: e.loaded }
            if ( e.lengthComputable )
                progData.total = e.total
            this.onProgress(progData)
        })

        this.req.open('POST', INTRUSTD_URL + "/image", true)
        this.req.send(this.formData)
    }
}

const UPLOAD_KEEPALIVE = 1000;
class UploadIndicator extends react.Component {
    constructor () {
        super()

        this.state = { error: false, total: 100, complete: 0 }
    }

    componentDidMount() {
        this.props.upload.onProgress = (e) => this.onProgress(e)
        this.props.upload.onComplete = (ph) => this.onComplete(ph)
        this.props.upload.start()
    }

    onProgress(e) {
//        console.log('onProgress', e)

        if ( e.error ) {
            this.setState({error: true, errorString: e.what })
        } else {
            var newState = {}
            if ( !e.hasOwnProperty('total') )
                newState.total = null
            else
                newState.total = e.total

            newState.complete = e.complete
            newState.error = false
            this.setState(newState)
        }
    }

    onComplete(photo) {
        this.props.onComplete(photo)
    }

    render() {
        const E = react.createElement;

        var progProps = { className: 'uk-progress' }
        if ( this.state.total !== null ) {
            progProps.value = '' + this.state.complete;
            progProps.max = '' + this.state.total;
        }

        return  E('li', {className: 'ph-upload'},
                  this.props.upload.fileName,
                  E('progress', progProps))
    }
}

class PhotoApp extends react.Component {
    constructor() {
        super()

        this.state = { uploads: [], slideshow: false,
                       searchTags: OrderedSet(),
                       search: null }
        this.uploadKey = 0
        this.galleryRef = react.createRef()
        this.navbarRef = react.createRef()
    }

    componentDidMount() {
        this.updateImages()
    }

    updateImages() {
        var search = this.state.searchTags.toArray()
            .map((tag) => `tag[]=${encodeURIComponent(tag)}`)
        var append = false

        console.log("Update images")

        if ( this.state.search !== null )
            search.push(`q=${encodeURIComponent(this.state.search)}`)

        if ( this.state.images !== undefined && this.state.images.size > 0 ) {
            search.push(`after_id=${this.state.images.get(this.state.images.size - 1).id}`)
            search.push(`after_date=${this.state.images.get(this.state.images.size - 1).created}`)
            append = true
        }

        search.push('limit=10')

        if ( search.length > 0 )
            search = `?${search.join('&')}`

        fetch(`${INTRUSTD_URL}/image${search}`,
              { method: 'GET', cache: 'no-store' })
            .then((res) => res.json())
            .then(({ images, total }) => {
                images = List(images)
                var hasMore = images.size == 10

                if ( append )
                    images = this.state.images.concat(images)

                this.setState({ images, hasMore, imageCount: total })
            })
    }

    uploadPhoto(fd) {
        var photos = fd.getAll('photo')
        var newUploads = [ ...this.state.uploads ];
        var ret = [];

        for ( var i in photos ) {
            var photo = photos[i]
            var newFormData = new FormData()
            newFormData.append('photo', photo)

            var upload = new PhotoUpload(this.uploadKey, newFormData)
            newUploads.push(upload)
            ret.push(upload.onComplete)

            this.uploadKey += 1
        }

        this.setState({ uploads: newUploads })

        return ret
    }

    uploadCompletes(ulKey, photo) {
        setTimeout(() => {
            var newUploads =
                this.state.uploads.filter((ul) => (ul.key != ulKey))

            this.setState({ uploads: newUploads })
        }, UPLOAD_KEEPALIVE)

        if ( photo !== null ) {
            if ( this.state.images.every((im) => (im.id != photo.id)) ) {
                var newImages = this.state.images.unshift(photo)
                this.setState({images: newImages, imageCount: this.state.imageCount + 1})
            }
        }
    }

    modifyImage(imageId, fn) {
        var images = this.state.images.map((img) => {
            if ( img.id == imageId )
                return fn(img);
            else
                return img
        })
        this.setState({images})
    }

    onImageDescriptionChanged(imageId, newDesc, tags) {
        var image = this.state.images.filter((img) => (img.id == imageId))
        if ( image.length == 0 ) return
        image = image[0]

        var oldDesc = image.description

        this.modifyImage(imageId, (image) => Object.assign({}, image, { loading: true, description: newDesc }))
        fetch(`${INTRUSTD_URL}/image/${imageId}/description`,
              { method: 'PUT',
                body: newDesc,
                headers: {
                    'Content-Type': 'text/plain'
                } })
            .then((r) => {
                if ( r.ok ) {
                    if ( this.navbarRef.current )
                        this.navbarRef.current.latestTags(tags)
                    this.modifyImage(imageId, (image) => Object.assign({}, image, {loading: false, description: newDesc }))
                } else {
                    this.modifyImage(imageId, (image) => Object.assign({}, image, {loading: false, description: oldDesc }))
                    // TODO pop up notification
                }
            })
    }

    onStartSlideshow() {
        this.setState({ slideshow: true })
    }

    onEndSlideshow() {
        this.setState({ slideshow: false })
    }

    shareAll() {
        return mintToken([ 'intrustd+perm://photos.intrustd.com/gallery',
                           'intrustd+perm://photos.intrustd.com/view',
                           'intrustd+perm://admin.intrustd.com/guest' ],
                         { format: 'query' })
            .then((tok) => makeAbsoluteUrl('#/', tok))
    }

    selectTag(tag, include) {
        var oldTags = this.state.searchTags, searchTags

        if ( !include )
            searchTags = this.state.searchTags.delete(tag)
        else
            searchTags = this.state.searchTags.add(tag)

        this.setState({searchTags})

        if ( !searchTags.equals(oldTags) ) {
            this.setState({ images: undefined, imageCount: undefined, hasMore: true }, this.updateImages.bind(this))
        }
    }

    doShare(what) {
        switch ( what ) {
        case 'all':
            this.shareAll().then((url) => this.setState({shareLink: url}))
            break
        case 'selected':
            if ( this.state.selectedCount > 0 &&
                 this.galleryRef.current ) {
                this.galleryRef.current.shareSelected()
                    .then((url) => this.setState({ shareLink: url }))
            }
            break;
        default:
            console.log('doShare: do not know what to share: ', what)
        }
    }

    doSelectAll() {
        if ( this.galleryRef.current !== undefined && this.state.images !== undefined ) {
            if ( this.state.selectedCount == this.state.images.size )
                this.galleryRef.current.updateSelection(Set())
            else {
                this.galleryRef.current.selectAll()
            }
        }
    }

    downloadSome(which) {
        var streamName, streamPromise
        if ( which.length == 0 ) return;
        else if ( which.length == 1 ) {
            var imageId = which[0];
            streamName = `${imageId}.jpg`;
            streamPromise = fetch(`${INTRUSTD_URL}/image/${imageId}?format=raw`,
                                  { method: 'GET' })
                .then((r) => {
                    if ( r.status == 200 ) {
                        var extension = r.headers.get('x-extension')
                        if ( extension === undefined )
                            throw new UnknownContentTypeError(contentType)

                        return { body: r.body, extension }
                    } else {
                        throw new CouldNotDownloadImageError(r.status)
                    }
                })
        } else {
            streamName = 'photos';
            console.log("Downloading", which)
            streamPromise = fetch(`${INTRUSTD_URL}/archive`,
                                  { method: 'POST',
                                    body: JSON.stringify(which),
                                    headers: { 'Content-type': 'application/json' }})
                .then((r) => {
                    if ( r.status == 200 ) {
                        return { body: r.body, extension: 'zip' }
                    } else {
                        throw new CouldNotDownloadImageError(r.status)
                    }
                })
        }

        return streamPromise.then(({body, extension}) => {
            var fileStream = streamsaver.createWriteStream(`${streamName}.${extension}`, {
                size: 22
            })
            return body.pipeTo(fileStream)
        })
    }

    render() {
        const E = react.createElement;

        return E(Router, {},
                 E('div', null,
                   E(Navbar, { uploadPhoto: (fd) => this.uploadPhoto(fd),
                               ref: this.navbarRef,
                               searchTags: this.state.searchTags,
                               selectTag: this.selectTag.bind(this),
                               imgCount: this.state.imageCount !== undefined ? this.state.imageCount : undefined,
                               selectedCount: this.state.selectedCount,
                               allSelected: this.state.images !== undefined && this.state.selectedCount == this.state.images.size,
                               selectedTags: this.state.searchTags,
                               onSelectAll: this.doSelectAll.bind(this),
                               onShare: this.doShare.bind(this),
                               downloadSelected: () => {
                                   var gallery = this.galleryRef.current
                                   if ( gallery ) {
                                       this.downloadSome(gallery.getSelection().map((p) => p.id))
                                   }
                               },
                               shareLink: this.state.shareLink }),

                   E(Route, { path: '/',
                              render: ({match, location, history}) =>
                              E(Gallery, {match, location, history, images: this.state.images,
                                          hasMore: this.state.hasMore,
                                          loadMore: this.updateImages.bind(this),
                                          imageCount: this.state.imageCount,
                                          loadedCount: this.state.images ? this.state.images.size : null,
                                          selectedTags: this.state.searchTags,
                                          selectTag: this.selectTag.bind(this),
                                          onStartSlideshow: this.onStartSlideshow.bind(this),
                                          onEndSlideshow: this.onEndSlideshow.bind(this),
                                          onImageDescriptionChanged: this.onImageDescriptionChanged.bind(this),
                                          onSelectionChanged: (sel) => this.setState({selectedCount: sel.size}),
                                          onDownload: this.downloadSome.bind(this),
                                          key: 'gallery', ref: this.galleryRef }) }),

                   E('ul', {className: `ph-uploads-indicator ${this.state.uploads.length > 0 ? 'ph-uploads-indicator--active' : ''}`},
                     'Uploading',
                     this.state.uploads.map((ul) => {
                         return E(UploadIndicator, {upload: ul, key: ul.key,
                                                    onComplete: (photo) => { this.uploadCompletes(ul.key, photo) }})
                     }))


                  ))
    }
}

var container = document.createElement('div');
document.body.appendChild(container);
ReactDom.render(react.createElement(PhotoApp), container);
