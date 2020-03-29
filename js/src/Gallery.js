import React from 'react';
import { toast } from 'react-toastify';
import Hls from 'hls.js';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';
import MediumEditor from 'react-medium-editor';
import Draggable from 'react-draggable';
import sanitizeHtml from 'sanitize-html';

import { PhotoItem, Placeholder, TextItem, Row } from './Model.js';
import { mkTooltip, ErrorToast } from './Util.js';
import { ImageTile } from './ImageTile.js';
import Slideshow from './Slideshow.js';
import { TEXT_VERTICAL_MARGIN, TEXT_HORIZONTAL_MARGIN, TEXT_PADDING } from './Layout.js';

import { mintToken } from 'intrustd';
import { Image, ImageHost, LoadingIndicator } from 'intrustd/src/react.js';
import { INTRUSTD_URL, makeAbsoluteUrl } from './PhotoUrl.js';

import Moment from 'react-moment';
import { Route, Link, withRouter, Switch } from 'react-router-dom';
import { MentionsInput, Mention } from 'react-mentions';
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
import 'medium-editor/dist/css/medium-editor.css';
import 'medium-editor/dist/css/themes/default.css';

import { Set } from 'immutable';

const E = React.createElement;
const PHOTO_MARGIN = 2;
const INSERTION_BAR_WIDTH = 40;
const LOOK_AHEAD = 100;

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
                          onActivated: () => {
                              history.push(`${match.url}slideshow/${img.id}`)
                          },
                          onDescriptionSet: (newDesc, tags) => {
                              gallery.props.onImageDescriptionChanged(img.id, newDesc, tags)
                          } })
}

class InsertionBar extends React.Component {
    render() {
        return E('div', { className: 'insertion-bar-container',
                          style: { 'width': `${INSERTION_BAR_WIDTH}px`,
                                   'height': `${this.props.height}px`,
                                   'top': `${this.props.top}px`,
                                   'left': `${this.props.left}px` } },
                 E('div', { className: 'insertion-bar' }))
    }
}

class AlbumText extends React.Component {
    constructor(props) {
        super()
        this.state = { editing: false,
                       text: this._sanitize(props.text) }
    }

    _sanitize(text) {
        return sanitizeHtml(text, { allowedTags: [ 'b', 'i', 'a',
                                                   'strong', 'em',
                                                   'ul', 'ol', 'li',
                                                 ] })
    }

    componentDidUpdate(oldProps) {
        if ( this.props.text != oldProps.text ) {
            this.setState({text: this._sanitize(this.props.text) })
        }
    }

    startEdit() {
        this.setState({editing: true, unsavedText: this.state.text})
    }

    onEdit(text) {
        this.setState({unsavedText: text})
    }

    stopEdit() {
        var sanitized = this._sanitize(this.state.unsavedText)
        if ( this.state.unsavedText != this.props.text ) {
            this.props.onChange(sanitized)
        }
        this.setState({editing: false, unsavedText: undefined, text: sanitized})
    }

    renderContent() {
        var content, deleter
        if ( this.state.editing ) {
            content = E(MediumEditor, { className: 'content', text: this.state.text,
                                        onChange: this.onEdit.bind(this) })
        } else
            content = E('div', { className: 'content',
                                 onClick: this.startEdit.bind(this),
                                 dangerouslySetInnerHTML: { __html: this.state.text } })

        if ( this.props.allowDelete )
            deleter = E('div', { className: 'album-text-deleter',
                                 onClick: this.props.onDelete },
                        E('i', { className: 'fa fa-fw fa-times' }))

        return E('div', { className: `album-text ${this.props.dragging ? 'album-text--dragging' : ''}`,
                            onBlur: this.stopEdit.bind(this),
                            style: { top: `${this.props.top}px`,
                                     left: `${this.props.left}px`,
                                     width: `${this.props.width}px`,
                                     height: `${this.props.height - 2 * (TEXT_VERTICAL_MARGIN - TEXT_PADDING)}px` } },
                 deleter,
                 content)
    }

    render() {
        if ( this.props.allowDrag ) {
            var props = { onStart: this.props.onStartDrag,
                          onStop: this.props.onStopDrag,
                          onDrag: this.props.onDragging,
                          cancel: 'div.content' }
            if ( !this.props.dragging )
                props.position = { x: 0, y: 0 }
            return  E(Draggable, props,
                      this.renderContent())
        } else
            return this.renderContent()
    }
}

class ImagePlaceholder extends React.Component {
    constructor() {
        super()
        this.ref = React.createRef()
        this.state = { loading: false }
    }

    componentDidMount() {
        if ( this.props.doLoad )
            this.startLoad()
    }

    componentWillUpdate(oldProps) {
        if ( this.props.doLoad &&
             this.props.doLoad != oldProps )
            this.startLoad()
    }

    startLoad() {
        if ( this.state.loading ) return

        this.setState({loading: true})

        var el = this.ref.current
        var gallery = el.parentNode

        var top = el.offsetTop,
            left = el.offsetLeft

        if ( top < gallery.scrollTop ) {
            // Load last
            this.props.model.loadBefore(this.props.nextImage,
                                        { height: gallery.scrollTop - top })
        } else {
            var height = Math.min((gallery.scrollTop + gallery.clientHeight) - top, this.props.height)
            // Load first
            this.props.model.loadAfter(this.props.lastImage,
                                       { height })
        }
    }

    render() {
        return E('div', { className: 'ph-placeholder',
                          style: { height: `${this.props.height}px`,
                                   top: `${this.props.top}px` },
                          ref: this.ref },
                 E(LoadingIndicator))
    }
}

class GalleryImpl extends React.Component {
    constructor() {
        super()
        this.wasVisible = false

//        this.galleryRef = (newGallery) => {
//            var currentGallery = this.galleryRef.current
//            this.galleryRef.current = newGallery
//            if ( currentGallery === null &&
//                 newGallery !== null ) {
//                this.scrollPositionChanges()
//            }
//        }
        //        this.galleryRef.current = null

        this.galleryRef = React.createRef();

        this.unsubscribe = () => { }
        this.gallery = this
        this.state = {
            slideshow: false,
            curSlideIx: 0,
            selected: Set(),
            hasMore: false,
            afterStart: 0,
            beforeHeight: 0,
            afterHeight: 0
        }
    }

    get isAlbum() {
        return false
    }

    get scrollPosY() {
        return this.galleryRef.current.scrollTop
    }

    get height() {
        return this.galleryRef.current.clientHeight
    }

    componentDidMount() {
        this.subscribeGallery()
    }

    subscribeGallery() {
        if ( this.props.model.started )
            this.scrollPositionChanges()

        var onLoadFn = this.scrollPositionChanges.bind(this)
        this.props.model.addEventListener('load', onLoadFn)
        this.props.model.addEventListener('starts', onLoadFn)
        var oldModel = this.props.model
        this.unsubscribe = () => {
            this.setState({images: undefined})
            oldModel.removeEventListener('load', onLoadFn)
            oldModel.removeEventListener('starts', onLoadFn)
        }
    }

    _getScrollBounds() {
        if ( this.galleryRef.current === null )
            return { minY: 0, maxY: 0 }

        var minY = this.galleryRef.current.scrollTop - LOOK_AHEAD
        var maxY = minY + this.galleryRef.current.clientHeight + (LOOK_AHEAD * 3)
        return { minY, maxY }
    }

    scrollPositionChanges(e) {
        if ( this.galleryRef.current === null )
            return

        var { minY, maxY } = this._getScrollBounds()
        var height = this.props.model.height

        this.props.model.layout(this.galleryRef.current.clientWidth,
                                { margin: PHOTO_MARGIN })
        var { images, beforeHeight, afterHeight, afterStart }
            = this.props.model.getBetween(Math.max(minY, 0),
                                          Math.min(maxY, height))
        console.log("Got images", images)
        this.setState({images, afterStart, beforeHeight, afterHeight})

        if ( this.state.dragging )
            this.updateDrag()
    }

    componentWillUnmount() {
        this.unsubscribe()
    }

    componentDidUpdate(oldProps) {
        if ( oldProps.model != this.props.model ) {
            this.unsubscribe()
            this.scrollToTop()
            this.subscribeGallery()
        }
    }

    scrollToTop() {
        var gallery = this.galleryRef.current
        if ( gallery ) {
            gallery.scrollTop = 0
        }
    }

    setSelection(selected) {
        this.setState({selected})
    }

    removeFromSelection(id) {
        this.updateSelection(this.state.selected.delete(id))
    }

    updateSelection(selected) {
        this.setSelection(selected)
        if ( this.props.onSelectionChanged )
            this.props.onSelectionChanged(selected)
    }

    getSelectedList() {
        return this.state.selected.toArray()
    }

    onStartDrag(imageId, x, y) {
        this.setState({dragging: imageId, dragStart: {x, y}})
    }

    onStopDrag() {
        if ( this.state.dragIndicator ) {
            this.props.model.reorder(this.state.dragging, this.state.dragIndicator)
                .catch((e) => {
                    toast.error(E(ErrorToast, 'Could not move item'))
                })
        }
        this.setState({dragging: undefined, dragPos: undefined, dragIndicator: undefined, dragStart: undefined})
    }

    onDrag(imageId, e, dragData) {
        var {x,y} = dragData
        this.setState({dragPos: {x: this.state.dragStart.x + x, y: this.state.dragStart.y + y}})
        this.updateDrag()
    }

    updateDrag() {
        var dragIndicator =  this.props.model.getItemAt(this.state.dragPos)
//        console.log("Got drag Pos", this.state.dragPos)
//        console.log("Drag indicator", dragIndicator)
        this.setState({dragIndicator})
    }

    render() {
        return E(Switch, null,
                 E(Route, { path: `${this.props.parentRoute}/slideshow/:imageId`, key: 'slideshow',
                            render: ({match, location, history}) =>
                            E(Slideshow, { model: this.props.model,
                                           selectedTags: this.props.selectedTags,
                                           onDownload: this.props.onDownload,
                                           onShare: this.props.onShare,
                                           currentId: match.params.imageId,
                                           selected: this.state.selected,
                                           onSelect: (imgId) => doSelect(this, imgId),
                                           parentRoute: `${this.props.parentRoute}/`,
                                           makeImageRoute: (id) => `${this.props.parentRoute}/slideshow/${id}`,
                                           key: 'slideshow' }) }),

                 E(Route, { path: `${this.props.parentRoute}`, key: 'gallery',
                            render: this.renderGallery.bind(this) }))
    }

    renderGallery({match, history}) {
        var gallery, galleryClass = '', hasSelection = !this.state.selected.isEmpty();

        if ( this.state.images === undefined ) {
            gallery = E('div', { className: 'ph-gallery ph-gallery-loading' }, E(LoadingIndicator))
        } else if ( this.state.images.size == 0 ) {
            gallery = E('div', { className: 'ph-gallery ph-gallery-empty-msg' }, 'No images')
            galleryClass = 'ph-gallery-empty'
        } else {
            var loadingAny = false, left = PHOTO_MARGIN

            gallery =
                this.state.images.map(([ms, msAfter, im]) => {
                    const renderInsertionBar = (itemId, thisLeft, top, renderItem) => {
                        if ( this.state.dragging == itemId )
                            return renderItem(thisLeft)

                        if ( this.state.dragIndicator &&
                             this.state.dragIndicator.before == itemId ) {
                            var barLeft = thisLeft
                            left += INSERTION_BAR_WIDTH
                            return [ E(InsertionBar, { key: 'insertion-bar',
                                                       height: ms.lastRowHeight, top,
                                                       left: thisLeft }),
                                     renderItem(thisLeft + INSERTION_BAR_WIDTH) ]
                        } else if ( this.state.dragIndicator &&
                                    this.state.dragIndicator.after == itemId ) {
                            var barLeft = left
                            left += INSERTION_BAR_WIDTH
                            return [ renderItem(thisLeft),
                                     E(InsertionBar, { key: 'insertion-bar',
                                                       height: ms.lastRowHeight, top,
                                                       left: barLeft }) ]
                        } else
                            return renderItem(thisLeft)
                    }
                    if ( im instanceof PhotoItem ) {
                        var image = im.description
                        var width = image.width * (ms.lastRowHeight / image.height)
                        var thisLeft = left
                        var top = ms.height - ms.lastRowHeight
                        left += width + PHOTO_MARGIN
                        var imageTile = (thisLeft) =>
                            E(ImageTile, { key: `image-${im.id}`,
                                           index: ms.count,

                                           draggable: this.props.allowDrag,
                                           onStartDrag: this.onStartDrag.bind(this, im.itemId, thisLeft, top),
                                           onStopDrag: this.onStopDrag.bind(this, im.itemId, thisLeft, top),
                                           onDragging: this.onDrag.bind(this, im.itemId),
                                           dragging: this.state.dragging == im.itemId,

                                           top,
                                           height: ms.lastRowHeight,
                                           width, left: thisLeft,

                                           photo: image,
                                           galleryNode: this.galleryRef,
                                           selectedTags: this.props.selectedTags,
                                           selectTag: this.props.selectTag,
                                           selected: this.state.selected.contains(im.id),
                                           showOverlay: true,
                                           onSelect: doSelect(this, im.id),
                                           onShare: () => {
                                               this.props.onShare({photos: [im.id]})
                                           },
                                           onActivated: () => {
                                               if ( this.props.enableSlideshow ) {
                                                   history.push(`${this.props.parentRoute}/slideshow/${im.id}`)
                                               }
                                           },
                                           onDescriptionSet: (newDesc, tags) => {
                                               this.props.model.updateDescription(im.id, newDesc, tags)
                                           }})

                        return renderInsertionBar(im.itemId, thisLeft, top, imageTile)
                    } else if ( im instanceof Placeholder ) {
                        left = PHOTO_MARGIN
                        var shouldLoad = !loadingAny
                        loadingAny = true
                        return E(ImagePlaceholder, { key: `placeholder-${ms.count}`,
                                                     doLoad: loadingAny,
                                                     model: this.props.model,
                                                     count: im.count,
                                                     top: ms.height,
                                                     height: im.height,
                                                     lastImage: ms.lastImage,
                                                     nextImage: msAfter.firstImage })
                    } else if ( im instanceof TextItem ) {
                        left = PHOTO_MARGIN
                        var top = ms.height + (TEXT_VERTICAL_MARGIN - TEXT_PADDING)
                        var thisLeft = TEXT_HORIZONTAL_MARGIN - TEXT_PADDING
                        var text = (thisLeft) =>
                            E(AlbumText, { key: `text-${im.origId}`,
                                           height: im.height, top,
                                           left: thisLeft,
                                           width: this.props.model.width - 2 * (TEXT_HORIZONTAL_MARGIN),
                                           editing: this.state.editingText == im.id,
                                           allowDrag: this.props.allowDrag,
                                           onStartDrag: this.onStartDrag.bind(this, im.id, thisLeft, top),
                                           onStopDrag: this.onStopDrag.bind(this, im.id, thisLeft, top),
                                           onDragging: this.onDrag.bind(this, im.id),
                                           dragging: this.state.dragging == im.id,
                                           allowDelete: this.props.allowTextEdit,
                                           onDelete: () => {
                                               if ( this.props.allowTextEdit )
                                                   this.props.model.removeAlbumItem(im.id)
                                           },
                                           onChange: (newText) => {
                                               if ( this.props.allowTextEdit )
                                                   this.props.model.setText(im.id, newText)
                                           },
                                           text: im.text })
                        return renderInsertionBar(im.id, thisLeft, top, text)
                    } else {
                        if ( im instanceof Row )
                            left = PHOTO_MARGIN
                        return null
                    }
                }).filter((e) => {
                    return (e !== undefined &&
                            e !== null)
                }).flat()
        }

        return E('div', { className: `ph-gallery ${galleryClass}`, ref: this.galleryRef,
                          onScroll: this.scrollPositionChanges.bind(this) },
                 E(ReactResizeDetector,
                   {handleWidth: true, handleHeight: true,
                    onResize: this.scrollPositionChanges.bind(this)}),
                 E('div', { className: 'ph-gallery-virtual-spacer',
                            style: { height: `${this.state.beforeHeight}px`,
                                     top: '0px' } }),
                 gallery,
                 E('div', { className: 'ph-gallery-virtual-spacer',
                            style: { height: `${this.state.afterHeight}px`,
                                     top: `${this.state.afterStart}px` } }))
    }
}

export default GalleryImpl
