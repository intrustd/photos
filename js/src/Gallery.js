import React from 'react';

import Navbar from './Navbar.js';

import { mintToken } from 'stork-js';
import { KiteImage } from 'stork-js/src/react.js';
import { KITE_URL } from './PhotoUrl.js';

import { Route, Link, withRouter } from 'react-router-dom';

import './Gallery.scss';

import { Set } from 'immutable';

function makeAbsoluteUrl(hash, query) {
    var uri = new URL(location.href)
    uri.hash = hash
    uri.search = query
    return uri.toString()
}

function copyStringToClipboard (str) {
   // Create new element
   var el = document.createElement('textarea');
   // Set non-editable to avoid focus and move outside of view
   el.setAttribute('readonly', '');
//   el.style = {position: 'absolute', left: '-9999px'};
   document.body.appendChild(el);
   // Set value (string to be copied)
   el.value = str;
   // Select text inside element
   el.select();
   // Copy text to clipboard
   document.execCommand('copy');
   // Remove temporary element
    document.body.removeChild(el);
    console.log("Copy string to clipboard", str)
}

const E = React.createElement;
class ImageTile extends React.Component {
    constructor() {
        super()

        this.state = { editingDescription: false }
    }

    editDescription() {
        this.setState({ editingDescription: true })
    }

    onTextAreaKey(e) {
        if ( e.keyCode == 27 ) {
            e.stopPropagation();
            e.preventDefault();
            this.setState({ editingDescription: false })
        } else if ( e.keyCode == 13 ) {
            this.props.onDescriptionSet(e.target.value);
            e.stopPropagation();
            e.preventDefault();
            this.setState({ editingDescription: false })
        }
    }

    onClick() {
        if ( this.props.onActivated )
            this.props.onActivated()
    }

    onShare(e) {
        e.stopPropagation()

        alert(`Will share ${this.props.photo.id}`)
    }

    render () {
        var description, editingClass = '', loadingClass = '', selectedClass = '', savingIcon
        var editBtn =
            E('span', {className: 'fa fa-fw fa-pencil ph-edit-btn'})

        if ( this.state.editingDescription ) {
            editingClass = 'ph-gallery-image-card--editing';
            description = E('textarea', { className: 'ph-image-description',
                                          onKeyDown: (e) => { this.onTextAreaKey(e) },
                                          placeholder: 'Add description', autoFocus: true,
                                          defaultValue: this.props.photo.description })
        } else {
            if ( this.props.photo.loading )
                editingClass = 'ph-gallery-image-card--saving';

            console.log("this props photo description", this.props.photo.description)
            if ( this.props.photo.description.length == 0 )
                description = E('p', { className: 'ph-image-description ph-image-description--empty',
                                       onClick: (e) => { e.stopPropagation(); this.editDescription() }},
                                'Add description', editBtn)
            else
                description = E('p', { className: 'ph-image-description',
                                       onClick: (e) => { e.stopPropagation(); this.editDescription() }},
                                this.props.photo.description, editBtn)
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

        return E('div', {className: `uk-card uk-card-default ph-gallery-image-card ${editingClass} ${loadingClass} ${selectedClass}`,
                         onClick: () => { this.onClick() }},
                 E(KiteImage, {src: `${KITE_URL}/image/${this.props.photo.id}?size=300`,
                               onFirstLoad: () => {
                                   setTimeout(() => { this.setState({loaded: true}) },
                                              200 * this.props.index)
                               },
                               className: 'ph-gallery-image uk-card-media-top'}),
                 E('div', { className: 'ph-image-selector',
                            onClick: (e) => { e.stopPropagation(); this.props.onSelect() } },
                   E('div', {className: 'ph-image-selector-check'},
                     E('span', {className: 'ph-image-selector-box'}))),
                 E('div', {className: 'uk-overlay uk-overlay-primary uk-light uk-position-bottom'},
                   E('p', {className: 'ph-image-meta'},
                     E('a', { className: 'uk-float-right', href: '#',
                              onClick: this.onShare.bind(this),
                              'uk-tooltip': 'Share this photo' },
                       E('i', { className: 'fa fa-fw fa-link' })),
                     this.props.photo.created,
                     savingIcon),
                   description))
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
        }
    }

    get slide() {
        if ( this.curSlide !== null && this.curSlide.curImage.id == this.props.imageId ) {
            return this.curSlide
        } else {
            var curImageIx = this.props.images.findIndex((img) => (img.id == this.props.imageId))
            if ( curImageIx >= 0 ) {
                var curImage = this.props.images[curImageIx]
                var prevImage, nextImage

                if ( curImageIx > 0 )
                    prevImage = this.props.images[curImageIx - 1].id

                if ( curImageIx < (this.props.images.length - 1) )
                    nextImage = this.props.images[curImageIx + 1].id

                var nextSlide = { curImage, prevImage, nextImage }
                this.curSlide = nextSlide

                console.log('return', nextSlide)
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
        } else {
            imgComp =
                 E(KiteImage, { className: 'slide',
                                src: `${KITE_URL}/image/${curImage.id}` })
        }

        return E('div', { className: 'slideshow' },
                 imgComp,
                 E('nav', { className: 'uk-navbar-container uk-light uk-navbar-transparent',
                            'uk-navbar': 'uk-navbar' },
                   E('div', { className: 'uk-navbar-center' },
                     E('div', { className: `uk-navbar-item ${prevImage ? 'ss-nav-inactive' : ''}` },
                       E(Link, { to: (prevImage ? this.props.makeImageRoute(prevImage) : "") },
                         E('i', { className: 'fa fa-fw fa-3x fa-chevron-left' }))),
                     E('div', { className: `uk-navbar-item ${nextImage ? 'ss-nav-inactive' : ''}` },
                       E(Link, { to: (nextImage ? this.props.makeImageRoute(nextImage) : "") },
                         E('i', { className: 'fa fa-fw fa-3x fa-chevron-right' }))),
                     E('div', { className: 'uk-navbar-item' },
                       E(Link, { to: this.props.parentRoute },
                         E('i', { className: 'fa fa-fw fa-3x fa-times-circle' })),
                      ))))
    }
}

const Slideshow = withRouter(SlideshowImpl)

export default class Gallery extends React.Component {
    constructor() {
        super()
        this.shareLinkRef = React.createRef()
        this.state = {
            slideshow: false,
            curSlideIx: 0,
            selected: Set()
        }
    }

    render() {
        return [
            E(Route, { path: '/slideshow/:imageId', key: 'slideshow',
                       render: this.renderSlideshow.bind(this) }),
            E(Route, { path: '/', exact: true, key: 'gallery',
                       render: this.renderGallery.bind(this) })
        ]
    }

    notifyCopy() {
        if ( this.state.copied )
            cancelTimeout(this.state.copied);

        var copied = setTimeout(() => { this.setState({copied: null}) }, 5000);
        this.setState({copied})
    }

    shareSelected() {
        var perms = this.state.selected.toArray().map((img) => `kite+perm://photos.flywithkite.com/view/${img}`)

        perms.push('kite+perm://photos.flywithkite.com/gallery')
        perms.push('kite+perm://admin.flywithkite.com/guest')

        mintToken(perms,  { format: 'query' })
            .then((tok) => makeAbsoluteUrl('#/', tok))
            .then((url) => { this.setState({shareLink: url}); this.notifyCopy() })
    }

    renderSlideshow(thisProps) {
        var { images, match } = this.props
        if ( images )
            return E(Slideshow, { images, imageId: thisProps.match.params.imageId,
                                  makeImageRoute: (id) => `${match.url}slideshow/${id}`,
                                  parentRoute: match.url })
        else
            return E('span', {className: 'fa fa-spin fa-large fa-circle-o-notch'})
    }

    renderGallery () {
        var gallery, galleryClass = '', hasSelection = !this.state.selected.isEmpty();

        if ( this.props.images === undefined ) {
            gallery = E('div', { className: 'ph-gallery-loading' }, 'Loading')
        } else if ( this.props.images.length == 0 ) {
            gallery = E('div', { className: 'ph-gallery-empty-msg' }, 'No images')
            galleryClass = 'ph-gallery-empty'
        } else {
            var { history, match } = this.props
            gallery = this.props.images.map(
                (img, index) =>
                    E(ImageTile, { photo: img, key: img.id, index: index,
                                   selected: this.state.selected.contains(img.id),
                                   onSelect: () => {
                                       var { selected } = this.state

                                       if ( selected.contains(img.id) )
                                           selected = selected.delete(img.id)
                                       else
                                           selected = selected.add(img.id)

                                       this.setState({ selected })
                                   },
                                   onActivated: () => {
                                       history.push(`${match.url}slideshow/${img.id}`)
                                   },
                                   onDescriptionSet: (newDesc) => {
                                       this.props.onImageDescriptionChanged(img.id, newDesc)
                                   }})
            )
        }

        var shareBox

        if ( this.state.shareLink ) {
            shareBox = E('div', { className: 'ph-share-link-box' },
                         E('input', { type: 'text', value: this.state.shareLink, readonly: true, ref: this.shareLinkRef }),
                         E('i', { className: 'ph-share-link-copy fa fa-fw fa-copy',
                                  onClick: () => {
                                      this.shareLinkRef.current.select()
                                      document.execCommand('copy')
                                  } }),
                         E('i', { className: 'ph-share-link-close fa fa-fw fa-times',
                                  onClick: () => { this.setState({shareLink: null}) }}))
        }

        return E('div', {className: `uk-flex uk-flex-wrap uk-flex-center ph-gallery ${galleryClass}`, 'uk-grid': 'uk-grid'},
                 gallery,

                 E('div', {className: `ph-gallery-selected-indicator ${hasSelection ? '' : 'ph-gallery-selected-indicator--empty'}`},
                   E('div', {className: 'ph-gallery-selected-indicator-label'},
                     `${this.state.selected.count()} images selected`,
                     E('div', {className: 'ph-gallery-images-toolbar'},
                       shareBox,
                       E('i', {className: 'ph-gallery-images-toolbtn fa fa-fw fa-link',
                               onClick: this.shareSelected.bind(this) }))),
                   E('div', {className: 'ph-gallery-selected-indicator-list'}, 'images')))
    }
}
