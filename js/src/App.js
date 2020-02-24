import 'bootstrap/scss/bootstrap.scss';

import { install, mintToken, isPermalink } from 'intrustd';

import Gallery from './Gallery';
import Navbar from './Navbar';
import { AddToAlbumModal } from './Albums';
import { INTRUSTD_URL, makeAbsoluteUrl } from './PhotoUrl.js';

import { Map, Set, OrderedSet, List } from 'immutable';
import react from 'react';
import ReactDom from 'react-dom';
import { HashRouter as Router,
         Route, Switch,
         Link } from 'react-router-dom';

import Progress from 'react-bootstrap/ProgressBar';

import './photos.svg';

import streamsaver from 'streamsaver';

const MAX_UPLOAD_CONCURRENCY = 10;

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
const UPLOADED_KEEPALIVE = 10000;
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
            progProps.now = this.state.complete;
            progProps.max = this.state.total;
        } else {
            progProps.now = 1;
            progProps.max = 1;
            progProps.animated = true;
        }

        return  E('li', {className: 'ph-upload'},
                  this.props.upload.fileName,
                  E(Progress, progProps))
    }
}

class PhotoApp extends react.Component {
    constructor() {
        super()

        this.state = { uploads: [], slideshow: false,
                       searchTags: OrderedSet(),
                       search: null,
                       uploaded: Set() }
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

            if ( newUploads.length == 0 )
                setTimeout(() => {
                    this.setState({uploaded: Set()})
                }, UPLOADED_KEEPALIVE)

            this.setState({ uploads: newUploads })
        }, UPLOAD_KEEPALIVE)

        if ( photo !== null ) {
            if ( this.state.images.every((im) => (im.id != photo.id)) ) {
                var newImages = this.state.images.unshift(photo)
                this.setState({images: newImages, imageCount: this.state.imageCount + 1,
                               uploaded: this.state.uploaded.add(photo.id) })
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

        if ( image.size == 0 ) return
        image = image.first()

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

    doShare(what, albumId) {
        this.galleryRef.current.share(what, albumId)
    }

    doSelectAll() {
        if ( this.galleryRef.current !== undefined && this.state.images !== undefined ) {
            if ( this.state.selectedCount == this.state.images.size )
                this.doDeselectAll()
            else {
                this.galleryRef.current.selectAll()
            }
        }
    }

    doDeselectAll() {
        this.galleryRef.current.updateSelection(Set())
    }

    addToAlbums() {
        var selected = this.galleryRef.current.getSelectedList()

        this.setState({addingToAlbum: selected})
    }

    selectUploaded() {
        var selected = this.galleryRef.current.getSelectedList()

        this.galleryRef.current.setSelection(Set([...selected, ...this.state.uploaded.toArray() ]))
        this.setState({uploaded: Set()})
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

        var uploadsRemainingIndicator, ongoingUploads = [], addingToAlbum, selectUploadedIndicator

        if ( (this.state.uploads.length - MAX_UPLOAD_CONCURRENCY) > 0 )
            uploadsRemainingIndicator = [
                E('hr'),
                E('div', { className: 'uploads-remaining' },
                  `${(this.state.uploads.length - MAX_UPLOAD_CONCURRENCY)} left to upload...`)
            ]

        if ( this.state.uploads.length <= MAX_UPLOAD_CONCURRENCY )
            ongoingUploads = this.state.uploads
        else
            ongoingUploads = this.state.uploads.slice(0, MAX_UPLOAD_CONCURRENCY - 1)

        if ( this.state.addingToAlbum ) {
            addingToAlbum = E(AddToAlbumModal, { images: this.state.addingToAlbum,
                                                 onDone: () => { this.setState({addingToAlbum: null}) } })
        }

        if ( this.state.uploaded.size > 0 ) {
            selectUploadedIndicator = [
                `${this.state.uploaded.size} uploaded. `,
                E('a', { href: '#',
                         onClick: () => { this.selectUploaded() } }, 'Select Uploaded')
            ]
        }

        return E(Router, {},
                 E('div', null,
                   E(Navbar, { uploadPhoto: (fd) => this.uploadPhoto(fd),
                               perms: this.props.perms,
                               visible: !this.state.slideshow,
                               ref: this.navbarRef,
                               searchTags: this.state.searchTags,
                               selectTag: this.selectTag.bind(this),
                               imgCount: this.state.imageCount !== undefined ? this.state.imageCount : undefined,
                               selectedCount: this.state.selectedCount,
                               allSelected: this.state.images !== undefined && this.state.selectedCount == this.state.images.size,
                               selectedTags: this.state.searchTags,
                               onSelectAll: this.doSelectAll.bind(this),
                               onDeselectAll: this.doDeselectAll.bind(this),
                               onAddAlbum: this.addToAlbums.bind(this),
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
                                          perms: this.props.perms,
                                          hasMore: this.state.hasMore,
                                          loadMore: this.updateImages.bind(this),
                                          imageCount: this.state.imageCount,
                                          loadedCount: this.state.images ? this.state.images.size : null,
                                          selectedTags: this.state.searchTags,
                                          selectTag: this.selectTag.bind(this),
                                          onStartSliedeshow: this.onStartSlideshow.bind(this),
                                          onEndSlideshow: this.onEndSlideshow.bind(this),
                                          onImageDescriptionChanged: this.onImageDescriptionChanged.bind(this),
                                          onSelectionChanged: (sel) => this.setState({selectedCount: sel.size}),
                                          onDownload: this.downloadSome.bind(this),
                                          key: 'gallery', ref: this.galleryRef }) }),

                   addingToAlbum,

                   E('ul', {className: `ph-uploads-indicator ${(this.state.uploads.length > 0) || this.state.uploaded.size > 0 ? 'ph-uploads-indicator--active' : ''}`},
                     'Uploading',
                     E('hr', {}),
                     selectUploadedIndicator,
                     ongoingUploads.map((ul) => {
                         return E(UploadIndicator, {upload: ul, key: ul.key,
                                                    onComplete: (photo) => { this.uploadCompletes(ul.key, photo) }})
                     }),
                     uploadsRemainingIndicator
                    )


                  ))
    }
}

var globalPerms = { gallery: false,
                    comment: false,
                    albums: false,
                    createAlbums: false,
                    upload: false }

export function start() {
    var setupPromise = Promise.resolve()
    if ( isPermalink && location.hash == '' ) {
        // Query what's available
        setupPromise = fetch(`${INTRUSTD_URL}/albums`,
                             { method: 'GET' })
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((albums) => {
                        if ( albums.length == 1 )
                            location.hash = `/album/${albums[0].id}`;
                        else if ( albums.length > 1 )
                            location.hash = '/album';
                        else
                            return Promise.reject()
                    })
                }
            }).catch((e) => {
                return null;
            })
    }
    setupPromise.then(doMount)

    fetch(`${INTRUSTD_URL}/user/info`,
          { cache: 'no-store' })
        .then((r) => {
            if ( r.ok )
                return r.json().then((perms) => {
                    globalPerms = Object.assign({}, globalPerms, perms)
                    console.log("GEt user info", perms, globalPerms)
                })
        }).then(doMount)
}

var container = document.createElement('div');
document.body.appendChild(container);

function doMount() {
    ReactDom.render(react.createElement(PhotoApp, { perms: globalPerms }), container);
}
