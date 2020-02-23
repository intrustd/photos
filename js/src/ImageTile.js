import React from 'react';

import { mkTooltip } from './Util.js';

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
    constructor() {
        super()

        this.state = { editingDescription: false,
                       frame : 0 }
    }

    editDescription() {
        this.setState({ editingDescription: true,
                        editingValue: this.props.photo.description })
    }

    onTextAreaKey(e) {
        if ( e.keyCode == 27 ) {
            e.stopPropagation();
            e.preventDefault();
            this.setState({ editingDescription: false })
        } else if ( e.keyCode == 13 ) {
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

        this.props.onShare([this.props.photo.id])
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

    render () {
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
                    suggestionsPortalHost: this.props.galleryNode,
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
                                       className: 'ph-image-description',
                                       emptyClass: 'ph-image-description--empty',
                                       placeholder: 'Add description',
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

        var size = Math.ceil(Math.max(this.props.photo.width, this.props.photo.height))
        size = Math.max(100, Math.round(Math.pow(2, Math.ceil(Math.log(size)/Math.log(2)))))

        var image, onMouseEnter, onMouseLeave, overlay

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
                                           width: `${this.props.photo.width}px`,
                                           height: `${this.props.photo.height}px`,
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
                                  src: `${INTRUSTD_URL}/image/${this.props.photo.id}?size=${size}`,
                                  style: {  width: `${this.props.photo.width}px`,
                                            height: `${this.props.photo.height}px` },
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
//                                          height: this.props.photo.height,
//                                          width: this.props.photo.width })
//            backInserter =  E(Inserter, { key: 'back',
//                                          orientation: 'vertical',
//                                          height: this.props.photo.height,
//                                          width: this.props.photo.width })
//        }
//
        return  E(Card, {key: 'image-card',
                         className: `ph-gallery-image-card ${editingClass} ${loadingClass} ${selectedClass} ${this.props.className || ''}`,
                         style: Object.assign({}, baseStyle,
                                              { width: `${this.props.photo.width}px`,
                                                height: `${this.props.photo.height}px`,
                                                margin: `${this.props.margin}px` }),
                         onClick: this.onClick.bind(this),
                         onMouseEnter, onMouseLeave },
                    image,
                    E('div', { className: 'ph-image-selector',
                               onClick: (e) => { e.stopPropagation(); this.props.onSelect() } },
                      E('div', {className: 'ph-image-selector-check'},
                        E('span', {className: 'ph-image-selector-box'}))),
                    overlay)
    }
}
