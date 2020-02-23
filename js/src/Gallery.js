import React from 'react';
import Hls from 'hls.js';

import { mkTooltip } from './Util.js';
import { ImageTile } from './ImageTile.js';

import { mintToken } from 'intrustd';
import { Image, ImageHost, LoadingIndicator } from 'intrustd/src/react.js';
import { INTRUSTD_URL, makeAbsoluteUrl } from './PhotoUrl.js';
import { Album, Albums } from './Albums.js';

import Moment from 'react-moment';
import { Route, Link, withRouter } from 'react-router-dom';
import { MentionsInput, Mention } from 'react-mentions';
import reactGallery from 'react-photo-gallery';
import VisibilitySensor from 'react-visibility-sensor';
import ReactResizeDetector from 'react-resize-detector';

import Card from 'react-bootstrap/Card';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import InputGroup from 'react-bootstrap/InputGroup';
import FormControl from 'react-bootstrap/FormControl';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';

import './Gallery.scss';

import { Set } from 'immutable';

const E = React.createElement;

const NUM_NEXT_SLIDES_TO_PRELOAD = 5;

class HlsPlayer extends React.Component {
    constructor() {
        super()

        this.videoRef = React.createRef()
    }

    componentDidMount() {
        if ( Hls.isSupported ) {
            console.log("Will play video")
            this.hls = new Hls({enableWorker: false})
            this.hls.loadSource(this.props.src)
            this.hls.attachMedia(this.videoRef.current)
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log("Manifest parsed", this.videoRef.current)
                setTimeout(() => { this.videoRef.current.play() }, 1000);
            })
            this.hls.on(Hls.Events.ERROR, (event, data) => {
                console.log("Error event", event, data)
            })
        }
    }

    componentDidUnmount() {
        this.hls.stopLoad()
    }

    render() {
        if ( Hls.isSupported ) {
            return E('video', { key: 'video', ref: this.videoRef, controls: true })
        } else
            return 'Video not supported'
    }
}

class SlideshowImpl extends React.Component {
    constructor() {
        super()

        this.curSlide = null
    }

    componentDidMount() {
        this.keyHandler = (e) => {
            this.onKeyPress(e)
        }
        document.body.addEventListener('keydown', this.keyHandler)
    }

    componentWillUnmount() {
        document.body.removeEventListener('keydown', this.keyHandler)
    }

    onKeyPress(e) {
        var { history } = this.props

        if ( e.key == 'ArrowLeft' ||
             e.key == 'ArrowRight' ) {
            var { prevImage, nextImage } = this.slide

            if ( e.key == 'ArrowLeft' )
                history.replace(prevImage)
            else
                history.replace(nextImage)
        } else if ( e.key == 'Escape' ) {
            history.goBack();
        }
    }

    get slide() {
        if ( this.curSlide !== null && this.curSlide.curImage.id == this.props.imageId &&
             this.curSlide.images === this.props.images ) {
            return this.curSlide
        } else {
            var curImageIx = this.props.images.findIndex((img) => (img.id == this.props.imageId))
            if ( curImageIx >= 0 ) {
                var curImage = this.props.images.get(curImageIx)
                var prevImage, nextImage

                if ( curImageIx > 0 )
                    prevImage = this.props.images.get(curImageIx - 1).id

                if ( curImageIx < (this.props.images.size - 1) )
                    nextImage = this.props.images.get(curImageIx + 1).id

                console.log("Check slide", this.props.canLoadMore, Math.abs(curImageIx - this.props.images.size))
                if ( this.props.canLoadMore && Math.abs(curImageIx - this.props.images.size) < NUM_NEXT_SLIDES_TO_PRELOAD ) {
                    // Check if there's more
                    setTimeout(this.props.loadMore, 0)
                }

                if ( this.props.canLoadMore && nextImage === undefined ) {
                    nextImage = 'loading'
                }

                var nextSlide = { curImage, prevImage, nextImage, images: this.props.images }
                this.curSlide = nextSlide

                return nextSlide
            } else
                return { }
        }
    }

    render() {
        var { curImage, prevImage, nextImage } = this.slide, imgComp

        if ( curImage === null || curImage === undefined ) {
            imgComp =
                E('p', { className: '' },
                  'This image was not found', E('br'),
                  E(Link, { to: this.props.parentRoute }, 'Click here to go back'))
        } else if ( curImage.type == 'video' ) {
            imgComp = E(HlsPlayer, { src: `${INTRUSTD_URL}/image/${curImage.id}` })
        } else {
            imgComp =
                E(ReactResizeDetector, { handleWidth: true, handleHeight: true,
                                         children: ({width, height}) => {
                                             var size = Math.ceil(Math.max(width, height))
                                             size = Math.max(100, Math.round(Math.pow(2, Math.ceil(Math.log(size)/Math.log(2)))))
                                             console.log("Request size", size);
                                             return E(Image, { src: `${INTRUSTD_URL}/image/${curImage.id}?size=${size}` })
                                         }})
        }

        var nextImageBtn, selectedClass

        if ( nextImage ) {
            if ( nextImage != 'loading' ) {
                nextImageBtn = E(Link, { to: (nextImage ? this.props.makeImageRoute(nextImage) : "") },
                                 E('i', { className: 'fa fa-fw fa-3x fa-chevron-right' }))
            } else {
                nextImageBtn = E('a', { 'href': '#', 'disabled': true }, E('i', { className: 'fa fa-fw fa-3x fa-chevron-right' }))
            }
        }

        if ( this.props.selected.includes(curImage.id) )
            selectedClass = 'ph-image-selector--selected';

        return [
            E(Navbar, { collapseOnSelect: true, expand: 'lg',
                        bg: 'transparent', variant: 'transparent',
                        fixed: 'top',
                        className: 'slideshow-nav' },
              E(Nav.Link, { as: Link,
                            to: this.props.parentRoute},
                E('i', { className: 'fa fa-fw fa-arrow-left' })),
              E(Nav, { className: 'ml-auto' },
                E(OverlayTrigger, { placement: 'bottom',
                                    overlay: mkTooltip('Download', { className: 'slideshow-tooltip' }) },
                  E(Nav.Link, { onClick: (e) => { e.preventDefault();
                                                  this.props.onDownload([curImage.id]) } },
                    E('i', { className: 'fa fa-fw fa-download' }))),
                E(OverlayTrigger, { placement: 'bottom',
                                    overlay: mkTooltip('Share', { className: 'slideshow-tooltip' }) },
                  E(Nav.Link, { onClick: (e) => { e.preventDefault();
                                                  this.props.onShare([curImage.id]) } },
                    E('i', { className: 'fa fa-fw fa-share-alt' }))),
                E(OverlayTrigger, { placement: 'bottom',
                                    overlay: mkTooltip('Select', { className: 'slideshow-tooltip' }) },
                  E(Nav.Link, { className: `ph-image-selector ${selectedClass}`,
                                onClick: doSelect(this.props.gallery, curImage.id) },
                    E('div', { className: 'ph-image-selector-check' },
                      E('span', { className: 'ph-image-selector-box' })))))),

            E('div', { className: 'slideshow' },
              E(Link, { to: ( prevImage ? this.props.makeImageRoute(prevImage) : "" ),
                        className: 'slideshow-arrow slideshow-left-arrow',
                        style: { display: prevImage ? undefined : 'none' } },
                E('i', { className: 'fa fa-chevron-left' })),
              E(Link, { to: nextImage ? this.props.makeImageRoute(nextImage) : "",
                        className: 'slideshow-arrow slideshow-right-arrow',
                        style: { display: nextImage ? undefined : 'none' } },
                E('i', { className: 'fa fa-chevron-right' })),
              imgComp)
        ];
//                 E('nav', { className: 'uk-navbar-container uk-light uk-navbar-transparent',
//                            'uk-navbar': 'uk-navbar' },
//                   E('div', { className: 'uk-navbar-center' },
//                     E('div', { className: `uk-navbar-item ${prevImage ? 'ss-nav-inactive' : ''}`,
//                                'uk-tooltip': 'title: Previous Image' },
//                       E(Link, { to: (prevImage ? this.props.makeImageRoute(prevImage) : "") },
//                         E('i', { className: 'fa fa-fw fa-3x fa-chevron-left' }))),
//                     E('div', { className: `uk-navbar-item ${nextImage ? 'ss-nav-inactive' : ''}`,
//                                'uk-tooltip': 'title: Next Image' }, nextImageBtn),
//                     E('div', { className: 'uk-navbar-item',
//                                'uk-tooltip': 'title: Download' },
//                       E('a', { href: '#',
//                                onClick: (e) => { e.preventDefault();
//                                                  this.props.onDownload([curImage.id]);
//                                                } },
//                         E('i', { className: 'fa fa-fw fa-3x fa-download' }))),
//                     E('div', { className: 'uk-navbar-item',
//                                'uk-tooltip': 'title: End Slideshow' },
//                       E(Link, { to: this.props.parentRoute },
//                         E('i', { className: 'fa fa-fw fa-3x fa-times-circle' })),
//                      ))))
    }
}

const Slideshow = withRouter(SlideshowImpl)

function doSelect(gallery, imgId) {
    return () => {
        var { selected } = gallery.state

        if ( selected.contains(imgId) )
            selected = selected.delete(imgId)
        else
            selected = selected.add(imgId)

        gallery.updateSelection(selected)
    }
}

function ImageTileClosure({photo, index, margin}) {
    var img = photo
    var gallery = photo.gallery
    var { history, match } = gallery.props

    return E(ImageTile, { key: img.id, margin,
                          index, photo,
                          galleryNode: img.galleryRef,
                          selectedTags: gallery.props.selectedTags,
                          selectTag: gallery.props.selectTag,
                          selected: gallery.state.selected.contains(img.id),
                          showOverlay: true,
                          onSelect: doSelect(gallery, img.id),
                          onShare: gallery.onShare.bind(gallery),
                          onActivated: () => {
                              history.push(`${match.url}slideshow/${img.id}`)
                          },
                          onDescriptionSet: (newDesc, tags) => {
                              gallery.props.onImageDescriptionChanged(img.id, newDesc, tags)
                          } })
}

class SharingModal extends React.Component {
    constructor() {
        super()
        this.state = { }
    }

    componentDidMount() {
        var promise
        console.log("We are sharing", this.props.sharingWhat)
        if ( this.props.sharingWhat == 'all' ) {
            promise = this.shareAll()
        } else if ( this.props.sharingWhat.album ) {
            promise = this.shareAlbum(this.props.sharingWhat.album)
        } else
            promise = this.share(this.props.sharingWhat)

        promise.then((link) => {
            this.setState({sharingLink: link})
        })
    }

    shareAlbum(albumId) {
        return mintToken([ `intrustd+perm://photos.intrustd.com/albums/view/${albumId}`,
                           'intrustd+perm://admin.intrustd.com/guest' ],
                         { format: 'query' })
            .then((tok) => makeAbsoluteUrl(`#/album/${albumId}`, tok))
    }

    shareAll() {
        return mintToken([ 'intrustd+perm://photos.intrustd.com/gallery',
                           'intrustd+perm://photos.intrustd.com/view',
                           'intrustd+perm://admin.intrustd.com/guest' ],
                         { format: 'query' })
            .then((tok) => makeAbsoluteUrl('#/', tok))
    }

    share(which) {
        var perms = which.map((img) => `intrustd+perm://photos.intrustd.com/view/${img}`)

        perms.push('intrustd+perm://photos.intrustd.com/gallery')
        perms.push('intrustd+perm://admin.intrustd.com/guest')

        return mintToken(perms,  { format: 'query' })
                 .then((tok) => makeAbsoluteUrl('#/', tok))
    }

    render() {
        var body

        if ( this.state.sharingLink ) {
            body = [
                E(InputGroup, {className: 'mb-3'},
                  E(FormControl, { 'aria-describedby': 'copy-link',
                                   defaultValue: this.state.sharingLink,
                                   readOnly: true }),
                  E(InputGroup.Append, { id: 'copy-link' },
                    E(Button, {variant: 'primary'}, 'Copy')))
            ]
        } else
            body = [
                E('p', null, 'Making sharing link'),
                E(LoadingIndicator)
            ]


        return E(Modal, { centered: true, show: true,
                          onHide: this.props.onDone },
                 E(Modal.Header, { closeButton: true },
                   E(Modal.Title, null, 'Share Photos')),
                 E(Modal.Body, null, body))
    }
}

class GalleryImpl extends React.Component {
    constructor() {
        super()
        this.wasVisible = false
        this.galleryRef = React.createRef()
        this.state = {
            slideshow: false,
            curSlideIx: 0,
            selected: Set()
        }
    }

    render() {
        var shareModal

        if ( this.state.sharing ) {
            shareModal = E(SharingModal, { sharingWhat: this.state.sharing,
                                           onDone: () => { this.setState({sharing: undefined}) } })
        }

        return [
            E(Route, { path: '/slideshow/:imageId', key: 'slideshow',
                       render: this.renderSlideshow.bind(this) }),
            E(Route, { path: '/album', key: 'albums', exact: true,
                       render: this.renderAlbums.bind(this) }),
            E(Route, { path: '/album/:albumId', key: 'album', exact: true,
                       render: (thisProps) => { return this.renderAlbum(thisProps, false) } }),
            E(Route, { path: '/album/:albumId/edit', key: 'edit-album',
                       render: (thisProps) => { return this.renderAlbum(thisProps, true) } }),
            E(Route, { path: '/', exact: true, key: 'gallery',
                       render: this.renderGallery.bind(this) }),
            shareModal
        ]
    }

    share(what, albumId) {
        switch(what) {
        case 'selected':
            if ( this.state.selected.size > 0 )
                this.onShare(this.state.selected.toArray())
            break;
        case 'album':
            this.onShare({ 'album': albumId })
            break;
        case 'all':
        default:
            this.onShare('all');
        }
    }

    onShare(which) {
        this.setState({sharing: which})
    }

    setSelection(selected) {
        this.setState({selected})
    }

    selectAll() {
        if ( this.props.images !== undefined ) {
            var selected = Set(this.props.images.map((i) => i.id))
            this.updateSelection(selected)
        }
    }

    updateSelection(selected) {
        this.setSelection(selected)
        if ( this.props.onSelectionChanged )
            this.props.onSelectionChanged(selected)
    }

    onLoadIndicatorVisible(visible) {
        if ( visible && this.props.hasMore && !this.wasVisible ) {
            this.props.loadMore()
            this.wasVisible = true
        } else
            this.wasVisible = false
    }

    getSelectedList() {
        return this.state.selected.toArray()
    }

    renderSlideshow(thisProps) {
        var { images, match } = this.props

        if ( images )
            return E(Slideshow, { images, imageId: thisProps.match.params.imageId,
                                  makeImageRoute: (id) => `${match.url}slideshow/${id}`,
                                  canLoadMore: this.props.loadedCount < this.props.imageCount,
                                  loadMore: this.props.loadMore,
                                  onDownload: this.props.onDownload,
                                  onShare: this.onShare.bind(this),
                                  parentRoute: match.url,
                                  gallery: this,
                                  selected: this.state.selected
                                  /* gallery: this */ })
        else
            return E('span', {className: 'fa fa-spin fa-large fa-circle-o-notch'})
    }

    renderGallery () {
        var gallery, galleryClass = '', hasSelection = !this.state.selected.isEmpty();

        if ( this.props.images === undefined ) {
            gallery = E('div', { className: 'ph-gallery-loading' }, E(LoadingIndicator))
        } else if ( this.props.images.size == 0 ) {
            gallery = E('div', { className: 'ph-gallery-empty-msg' }, 'No images')
            galleryClass = 'ph-gallery-empty'
        } else {
            var photos =
                this.props.images.map((img) =>
                    Object.assign({ src:img.id, key:img.id, gallery: this },
                                  img)).toArray()

            var visibilitySensor

            if ( this.props.hasMore )
                visibilitySensor = E(VisibilitySensor, { onChange: this.onLoadIndicatorVisible.bind(this) },
                                     E('div', { className: 'ph-gallery-loading-indicator' },
                                       E(LoadingIndicator)))

            gallery =
                [ E(reactGallery,
                    { photos, margin: 2,
                      ImageComponent: ImageTileClosure }),
                  visibilitySensor ]
        }

        return E('div', { className: `ph-gallery ${galleryClass}`, ref: this.galleryRef },
                 gallery)
    }

    renderAlbum(thisProps, editing) {
        var { match } = thisProps

        return E(Album, { albumId: match.params.albumId,
                          editing,
                          selectedTags: this.props.selectedTags,
                          selected: this.state.selected,
                          key: `album-${match.params.albumId}` })
    }

    renderAlbums() {
        return E(Albums, null)
    }
}

export default GalleryImpl
