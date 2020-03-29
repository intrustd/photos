import 'bootstrap/scss/bootstrap.scss';

import { install, mintToken, isPermalink } from 'intrustd';
import { Image } from 'intrustd/src/react.js';

import Gallery from './Gallery';
import Slideshow from './Slideshow';
import Navbar from './Navbar';
import { AddToAlbumModal } from './Albums';
import { INTRUSTD_URL, makeAbsoluteUrl } from './PhotoUrl.js';
import { Photos } from './Model.js';
import { Album, Albums } from './Albums.js';
import { SharingModal } from './Sharing.js';
import { mkSearch, SearchTermTypes } from './Search.js';

import { Map, Set, OrderedSet, OrderedMap, List } from 'immutable';
import react from 'react';
import ReactDom from 'react-dom';
import { HashRouter as Router,
         Route, Switch,
         Link } from 'react-router-dom';

import { ToastContainer, toast } from 'react-toastify';
import Progress from 'react-bootstrap/ProgressBar';

import 'react-toastify/dist/ReactToastify.css';

import './photos.svg';

import streamsaver from 'streamsaver';

if ( HOSTED_MITM )
    streamsaver.mitm = HOSTED_MITM;

const UPLOAD_KEEPALIVE = 1000;
const UPLOADED_KEEPALIVE = 10000;

const E = react.createElement;

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

class PhotoDeleter extends react.Component {
    render() {
        if ( this.props.photosRemaining > 0 ) {
            return E('div', { className: 'toast-content' },
                     `Deleting ${this.props.total} photos`,
                     E(Progress, { now: this.props.total - this.props.photosRemaining,
                                   max: this.props.total,
                                   className: 'progress-sm' }))
        } else {
            return E('div', { className: 'toast-content' },
                     `Deleted ${this.props.total} photos`)
        }
    }
}

class ImageDescriptionErrorToast extends react.Component {
    render() {
        return [ E(Image, {src: `${INTRUSTD_URL}/image/${this.props.imageId}?size=64` }),

                 E('p', { className: 'toast-content' },
                   'Could not set description') ]
    }
}

class PhotoApp extends react.Component {
    constructor() {
        super()

        this.state = { uploads: OrderedMap(),
                       completedUploads: List(),
                       erroredUploads: List(),

                       slideshow: false,
                       searchTags: OrderedSet(),
                       search: [] }

        this.galleryRef = react.createRef()
        this.navbarRef = react.createRef()
        this.routerRef = react.createRef()

        this.photos = new Photos()
        this.state.gallery = this.photos.mainGallery
    }

    uploadPhoto(fd) {
        var albumId

        if ( this.galleryRef.current &&
             this.galleryRef.current.isAlbum )
            albumId = this.galleryRef.current.albumId

        var photos = fd.getAll('photo')
        var ret = [];
        var newUploads = this.state.uploads

        for ( var i in photos ) {
            var photo = photos[i]

            console.log("Uploading", photo)

            var upload = this.photos.uploadPhoto(photo, albumId)
            console.log("Uploader is ", upload)
            newUploads = newUploads.set(upload.key, upload)
        }

        if ( this.completedUploadTimer )
            clearTimeout(this.completedUploadTimer)

        this.setState({ uploads: newUploads })
    }

    uploadCompletes(upload) {
        setTimeout(() => {
            this.setState( { uploads: this.state.uploads.delete(upload.key) } )
            if ( upload.error )
                this.setState( { erroredUploads: this.state.erroredUploads.push(upload) } )
            else
                this.setState( { completedUploads: this.state.completedUploads.push(upload.photo.id) } )

            if ( this.state.uploads.size == 0 ) {
                if ( this.completedUploadTimer )
                    clearTimeout(this.completedUploadTimer)
                this.completedUploadTimer = setTimeout(() => {
                    this.setState({completedUploads: List(),
                                   erroredUploads: List() })
                    delete this.completedUploadTimer
                }, UPLOADED_KEEPALIVE)
            }
        }, UPLOAD_KEEPALIVE)
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
                    toast.error(E(ImageDescriptionErrorToast, { imageId }))
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
        var navbar = this.navbarRef.current
        if ( navbar === null )
            return

        var newSearch

        if ( !include ) {
            newSearch = navbar.removeTag(tag)
        } else
            newSearch = navbar.addTag(tag)

        this.onSearchChange(newSearch)
    }

    doShare(what) {
        if ( what == 'selected' ) {
            var selected = this.galleryRef.current.gallery.getSelectedList()
            what = { photos: selected }
        }
        if ( what.hasOwnProperty("photos") &&
             what.photos.length == 0 ) return
        this.setState({sharingWhat: what, addingToAlbum: undefined})
    }

    doDeselectAll() {
        this.galleryRef.current.gallery.updateSelection(Set())
    }

    deleteSelected() {
        this.deleteSome(this.getSelected())
    }

    deleteSome(photos) {
        if ( photos.length == 0 )
            return

        var total = photos.length
        var deleterId = toast(E(PhotoDeleter, { photosRemaining: photos.length,
                                                total }),
                              { autoClose: false, closeOnClick: false, closeButton: false,
                                draggable: false })
        var continueDelete = () => {
            if ( photos.length == 0 ) {
                toast.update(deleterId,
                             { render: E(PhotoDeleter, { photosRemaining: 0, total }),
                               autoClose: 8000 })
            } else {
                var nextPhotoId = photos[0]
                this.photos.deletePhoto(nextPhotoId)
                    .catch(() => null)
                    .then(() => {
                        photos.shift()
                        this.removeFromSelection(nextPhotoId)
                        toast.update(deleterId,
                                     { render: E(PhotoDeleter, { photosRemaining: photos.length, total }),
                                       autoClose: false, closeOnClick: false, closeButton: false,
                                       draggable: false })
                        continueDelete()
                    })
            }
        }

        continueDelete()
    }

    addToAlbums() {
        console.log("Got galleryRef", this.galleryRef.current)
        var selected = this.getSelected()

        this.setState({addingToAlbum: selected, sharingWhat: undefined })
    }

    selectUploaded() {
        var selected = this.getSelected()

        this.galleryRef.current.gallery.setSelection(Set([...selected, ...this.state.completedUploads.toArray()]))
    }

    downloadSelected() {
        this.downloadSome(this.getSelected())
    }

    onSearchChange(search) {
        if ( search.length == 0 )
            this.setState({gallery: this.photos.mainGallery, search})
        else
            this.setState({gallery: this.photos.searchGallery(mkSearch(search)), search})
    }

    getSelected() {
        var gallery = this.galleryRef.current.gallery
        if ( gallery ) {
            return gallery.getSelectedList()
        } else
            return []
    }

    removeFromSelection(id) {
        var gallery = this.galleryRef.current.gallery
        if ( gallery )
            gallery.removeFromSelection(id)
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

    get searchTags() {
        return Set(this.state.search
                   .filter((v) => (v.termType == SearchTermTypes.TAG))
                   .map((v) => v.tag))
    }

    render() {
        var uploadsRemainingIndicator, addingToAlbum, sharing

        if ( this.state.addingToAlbum ) {
            addingToAlbum = E(AddToAlbumModal, { images: this.state.addingToAlbum,
                                                 onDone: () => { this.setState({addingToAlbum: null}) } })
        }

        if ( this.state.sharingWhat ) {
            sharing = E(SharingModal, { sharingWhat: this.state.sharingWhat,
                                        onDone: () => { this.setState({sharingWhat: undefined}) } })
        }

        return E(Router, { ref: this.routerRef },
                 E('div', { className: 'ph-photos-app' },
                   E(ToastContainer, { autoClose: 8000}),
                   E(Navbar, { uploadPhoto: (fd) => this.uploadPhoto(fd),
                               ongoingUploads: this.state.uploads,
                               completedUploads: this.state.completedUploads,
                               onUploadCompletes: this.uploadCompletes.bind(this),
                               selectCompleted: this.selectUploaded.bind(this),

                               perms: this.props.perms,
                               visible: !this.state.slideshow,
                               wrappedComponentRef: this.navbarRef,
                               selectTag: this.selectTag.bind(this),
                               imgCount: this.state.imageCount !== undefined ? this.state.imageCount : undefined,
                               selectedCount: this.state.selectedCount,
                               allSelected: this.state.images !== undefined && this.state.selectedCount == this.state.images.size,
                               onDeselectAll: this.doDeselectAll.bind(this),
                               onDelete: this.deleteSelected.bind(this),
                               onAddAlbum: this.addToAlbums.bind(this),
                               onShare: this.doShare.bind(this),
                               onDownloadSelected: this.downloadSelected.bind(this),
                               onSearchChange: this.onSearchChange.bind(this),
                               shareLink: this.state.shareLink }),

                   E(Switch, null,
                     E(Route, { path: '/album', key: 'albums', exact: true,
                                render: ({match, location, history}) =>
                                E(Albums, null) }),


                     E(Route, { path: '/album/:albumId/edit', key: 'edit-album', exact: true,
                                render: ({match, location, history}) =>
                                E(Album, { albumId: match.params.albumId,
                                           perms: this.props.perms,
                                           photos: this.photos,
                                           editing: true,
                                           wrappedComponentRef: this.galleryRef,
                                           onSelectionChanged: (sel) => this.setState({selectedCount: sel.size}),
                                           onDownload: this.downloadSome.bind(this),
                                           selectTag: this.selectTag.bind(this),
                                           selectedTags: this.searchTags,
                                           key: `album-${match.params.albumId}` }) }),

                     E(Route, { path: '/album/:albumId', key: 'album',
                                render: ({match, location, history}) =>
                                E(Album, { albumId: match.params.albumId,
                                           wrappedComponentRef: this.galleryRef,
                                           photos: this.photos,
                                           onSelectionChanged: (sel) => this.setState({selectedCount: sel.size}),
                                           onDownload: this.downloadSome.bind(this),
                                           selectTag: this.selectTag.bind(this),
                                           selectedTags: this.searchTags,
                                           key: `album-${match.params.albumId}` })
                              }),

                     E(Route, { path: '/', key: 'gallery',
                                render: ({match, location, history}) =>
                                E(Gallery, {match, location, history, perms: this.props.perms,
                                            parentRoute: '',
                                            enableSlideshow: true,
                                            model: this.state.gallery,
                                            onShare: this.doShare.bind(this),
                                            selectedTags: this.searchTags,
                                            selectTag: this.selectTag.bind(this),
                                            onSelectionChanged: (sel) => this.setState({selectedCount: sel.size}),
                                            onDownload: this.downloadSome.bind(this),
                                            key: 'index', ref: this.galleryRef }) })),

                   addingToAlbum,
                   sharing
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
            console.log("Got User Info", r)
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
