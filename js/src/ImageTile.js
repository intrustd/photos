import React from 'react';
import Draggable from 'react-draggable';

import { mkTooltip, calcIdealImageSize } from './Util.js';

import { Image, ImageHost, LoadingIndicator } from 'intrustd/src/react.js';
import { INTRUSTD_URL } from './PhotoUrl.js';

import Moment from 'react-moment';
import { MentionsInput, Mention } from 'react-mentions';

import Card from 'react-bootstrap/Card';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';

const E = React.createElement;

class MentionsParagraph extends React.Component {
    constructor() {
        super()

        this.state = { lastParagraph: '', tagRe: null, components: [] }
    }

    updateParagraph(desc) {
        var tagRe = this.state.tagRe
        if ( this.state.tagRe === null ||
             this.state.tagRe.source != this.props.re ) {
            tagRe = new RegExp(this.props.re, 'g')
            this.setState({tagRe})
        }

        var lastIndex = 0
        tagRe.lastIndex = 0

        var match, components = []
        while ( (match = tagRe.exec(desc)) !== null ) {
            if ( match.index > lastIndex ) {
                components.push({text: desc.substring(lastIndex, match.index)})
            }

            components.push({tag: match[1]})
            lastIndex = match.index + match[0].length
        }

        if ( lastIndex < desc.length )
            components.push({text: desc.substring(lastIndex, desc.length)})

        this.setState({lastParagraph: desc,
                       components})
    }

    componentDidMount() {
        this.updateParagraph(this.props.description)
    }

    componentDidUpdate(prevProps, prevState) {
        if ( this.props.description != prevProps.description )
            this.updateParagraph(this.props.description)
    }

    render() {
        var editBtn =
            E('span', {className: 'fa fa-fw fa-pencil ph-edit-btn'})

        var emptyClass
        if ( !this.props.description || this.props.description.length == 0 )
            emptyClass = this.props.emptyClass

        return E('p', { className: `${this.props.className} ${emptyClass}`,
                        onClick: this.props.onClick },
                 this.state.components.length == 0 ? this.props.placeholder :
                 this.state.components.map((c) => {
                     if ( c.tag )
                         return E(this.props.MentionComponent, {id: c.tag})
                     else
                         return E('span', null, c.text)
                 }),
                editBtn)
    }
}

export class ImageTile extends React.Component {
    constructor(props) {
        super()

        this.state = { editingDescription: false,
                       frame : 0,
                       loaded: false }

        var size = this._getSize(props)
        if ( props.photo.image )
            this.state.loaded = props.photo.image.atSize(size).loaded
    }

    _getSize(props) {
        return calcIdealImageSize(props.width, props.height)
    }

    get allowDescriptionEdit() {
        return (this.props.allowDescriptionEdit === undefined ||
                this.props.allowDescriptionEdit)
    }

    editDescription() {
        if ( this.allowDescriptionEdit )
            this.setState({ editingDescription: true,
                            editingValue: this.props.photo.description })
    }

    onTextAreaKey(e) {
        if ( e.keyCode == 27 ) {
            e.stopPropagation();
            e.preventDefault();
            this.setState({ editingDescription: false })
        } else if ( e.keyCode == 13 ) {
            if ( this.props.onDescriptionSet )
                this.props.onDescriptionSet(this.state.editingValue, this.state.mentioned)

            e.stopPropagation();
            e.preventDefault();
            this.setState({ editingDescription: false,
                            editingValue: undefined,
                            mentioned: undefined })
        }
    }

    onClick() {
        if ( this.props.onActivated )
            this.props.onActivated()
    }

    onShare(e) {
        e.stopPropagation()

        this.props.onShare()
    }

    searchTags(search, cb) {
        var baseUrl = `${INTRUSTD_URL}/tag`
        if ( search.length > 0 )
            baseUrl += `?query=${encodeURIComponent(search)}`
        fetch(baseUrl)
            .then((r) => r.json())
            .then((tags) => {
                var results = [ { id: search, display: `#${search}` } ]
                results.push.apply(results, tags.map((tag) => { return { id: tag, display: `#${tag}` } }))

                return results
            })
            .then(cb)
    }

    startPreview() {
        this.stopPreview()

        this.previewTimer = setInterval(this.nextFrame.bind(this), 300)
    }

    stopPreview() {
        if ( this.previewTimer )
            clearInterval(this.previewTimer)
        this.previewTimer = null

        this.setState({frame: 0})
    }

    nextFrame() {
        var frame = this.state.frame + 1
        if ( frame >= 36 )
            frame = 0

        this.setState({ frame })
    }

    render() {
        if ( this.props.draggable ) {
            var props = { onStart: this.props.onStartDrag,
                          onStop: this.props.onStopDrag,
                          onDrag: this.props.onDragging }
            if ( !this.props.dragging )
                props.position = { x: 0, y: 0 }
            return E(Draggable, props,
                     this.renderTile())
        } else
            return this.renderTile()
    }

    renderTile () {
        var mkDescription, editingClass = '', loadingClass = '', selectedClass = '', savingIcon


        if ( this.state.editingDescription ) {
            editingClass = 'ph-gallery-image-card--editing';
            mkDescription = () =>
              E('div', { onClick: (e) => { e.stopPropagation() } },
                E(MentionsInput,
                  { className: 'ph-image-description',
                    value: this.state.editingValue,
                    markup: '#[__display__](__id__)',
                    style: { suggestions: { zIndex: 10000 } },
                    suggestionsPortalHost: this.props.galleryNode.current,
                    onKeyDown: this.onTextAreaKey.bind(this),
                    onChange: (e, newVal, tags) => {
                        var mentioned = tags.split(' ').map((tag) => { if ( tag.startsWith('#') ) return tag.slice(1); else return tag; })
                        this.setState({editingValue: newVal, mentioned})
                    } },
                  E(Mention, { trigger: '#', type: 'tag',
                               data: this.searchTags.bind(this) })))
        } else {
            if ( this.props.photo.loading )
                editingClass = 'ph-gallery-image-card--saving';

            mkDescription = () =>
                E(MentionsParagraph, { re: '#\\[[#a-zA-Z0-9_\\-\'"]+\\]\\(([A-Za-z0-9_\\-\'"]+)\\)',
                                       className: `ph-image-description ${this.allowDescriptionEdit ? '' : 'ph-image-description--disabled'}`,
                                       emptyClass: 'ph-image-description--empty',
                                       placeholder: this.allowDescriptionEdit ? 'Add description' : '',
                                       onClick: (e) => {
                                           e.stopPropagation();
                                           this.editDescription()
                                       },
                                       MentionComponent: ({id}) => {
                                           var selectedClass = ""

                                           if ( this.props.selectedTags.contains(id) )
                                               selectedClass = 'ph-image-description__tag--selected';

                                           return E('a', { href: '#',
                                                           className: `ph-image-description__tag ${selectedClass}`,
                                                           onClick: (e) => {
                                                               e.stopPropagation()

                                                               if ( this.props.selectedTags.contains(id) )
                                                                   this.props.selectTag(id, false)
                                                               else
                                                                   this.props.selectTag(id, true)
                                                           }},
                                                    `#${id}`)
                                       },
                                       description: this.props.photo.description })
        }

        if ( this.props.photo.loading ) {
            savingIcon = E('span', { className: 'fa fa-fw fa-spin fa-circle-o-notch' })
        }

        if ( this.state.loaded )
            loadingClass = 'ph-gallery-image-card--loaded';
        else
            loadingClass = 'ph-gallery-image-card--loading';

        if ( this.props.selected )
            selectedClass = 'ph-gallery-image-card--selected';

        var size = this._getSize(this.props)

        var image, onMouseEnter, onMouseLeave, overlay, selector

        if ( !this.props.disableSelection ) {
            selector = E('div', { className: 'ph-image-selector',
                                  onClick: (e) => { e.stopPropagation(); this.props.onSelect() } },
                         E('div', {className: 'ph-image-selector-check'},
                           E('span', {className: 'ph-image-selector-box'})))
        }

        if ( this.props.showOverlay )
            overlay = E(Card.ImgOverlay, { className: 'd-flex flex-column justify-content-end p-0' },
                        E(Card.Title, {className: 'ph-image-meta'},
                          E(OverlayTrigger, { placement: 'bottom',
                                              overlay: mkTooltip('Share this photo') },
                            E('a', { className: 'float-right', href: '#',
                                     onClick: this.onShare.bind(this) },
                              E('i', { className: 'fa fa-fw fa-share-alt' }))),
                          E(Moment, null, this.props.photo.created),
                          savingIcon),
                        E(Card.Text, null, mkDescription()))

        if ( this.props.photo.type == 'video' ) {
            var progress
            loadingClass = 'ph-gallery-image-card--loaded';

            if ( this.props.photo.progress ) {
                progress = [ E(LoadingIndicator),
                             E('progress', { className: 'ph-gallery-conv-progress',
                                             max: this.props.photo.progress.total,
                                             value: this.props.photo.progress.complete }) ]
            }

            onMouseEnter = this.startPreview.bind(this)
            onMouseLeave = this.stopPreview.bind(this)

            var renderImg = (src) => {
                var r = Math.floor(this.state.frame / 6)
                var c = this.state.frame % 6


                return E('div', { className: 'ph-gallery-image ph-gallery-image--video',
                                  style: { backgroundImage: `url(${src})`,
                                           width: `${this.props.width}px`,
                                           height: `${this.props.height}px`,
                                           backgroundSize: '600% 600%',
                                           backgroundPosition: `${c * 100}% ${r * 100}%` } },
                         progress,
                         E('i',  { className: 'ph-gallery-image__video-icon fa fa-fw fa-play fa-5x' }) )
            }

            image = E(Card.Img,  {as: ImageHost, style: this.props.imgStyle,
                                  src: `${INTRUSTD_URL}/image/${this.props.photo.id}/preview?size=${size}`,
                                  renderLoad: renderImg, renderImg,
                                  draggable: false,
                                  className: 'ph-gallery-image--video-preview' })
        } else {
            image = E(Card.Img, { as: Image, style: this.props.imgStyle,
                                  draggable: false,
                                  src: this.props.photo.image.atSize(size),
                                  style: {  width: `${this.props.width}px`,
                                            height: `${this.props.height}px` },
                                  onFirstLoad: () => {
                                      this.setState({loaded: true})
                                  },
                                  className: 'ph-gallery-image uk-card-media-top'})
        }

        var baseStyle = this.props.style || {}
//        var frontInserter, backInserter
//
//        if ( this.props.showDragInserters ) {
//            frontInserter = E(Inserter, { key: 'front',
//                                          orientation: 'vertical',
//                                          height: this.props.height,
//                                          width: this.props.width })
//            backInserter =  E(Inserter, { key: 'back',
//                                          orientation: 'vertical',
//                                          height: this.props.height,
//                                          width: this.props.width })
//        }
//
        return  E(Card, {key: 'image-card',
                         className: `ph-gallery-image-card ${editingClass} ${loadingClass} ${selectedClass} ${this.props.className || ''} ${this.props.dragging ? 'ph-gallery-image-card--dragging' : ''}`,
                         style: Object.assign({}, baseStyle,
                                              { width: `${this.props.width}px`,
                                                height: `${this.props.height}px`,
                                                top: `${this.props.top}px`,
                                                left: `${this.props.left}px`,
                                                margin: `${this.props.margin}px` }),
                         onClick: this.onClick.bind(this),
                         onMouseEnter, onMouseLeave },
                  image,
                  selector,
                  overlay)
    }
}
