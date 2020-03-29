import React from 'react';
import Hls from 'hls.js';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';

import { mkTooltip, calcIdealImageSize } from './Util.js';
import { ImageTile } from './ImageTile.js';
import { PhotoNotFoundError, PhotoItem } from './Model.js';

import { mintToken } from 'intrustd';
import { Image, ImageHost, LoadingIndicator } from 'intrustd/src/react.js';
import { INTRUSTD_URL, makeAbsoluteUrl } from './PhotoUrl.js';
import { Album, Albums } from './Albums.js';

import Moment from 'react-moment';
import { Route, Link, withRouter } from 'react-router-dom';
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

const E = React.createElement;
const SLIDE_TIMEOUT = 5000;
const NAV_HIDE_TIMEOUT = 3000;

class HlsPlayer extends React.Component {
    constructor() {
        super()

        this.videoRef = React.createRef()
    }

    componentDidMount() {
        if ( Hls.isSupported ) {
            this.hls = new Hls({enableWorker: false})
            this.hls.loadSource(this.props.src)
            this.hls.attachMedia(this.videoRef.current)
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
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
    constructor(props) {
        super()

        this.state = { slide: null, playing: false, showNav: true, notFound: false }
        this.setNavHideTimer()

        this.startLoad(props)
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

    componentDidUpdate(oldProps) {
        if ( oldProps.currentId != this.props.currentId ) {
            this.setState({slide: null})
            this.startLoad()
        }
    }

    startLoad(props) {
        if ( props === undefined )
            props = this.props

        props.model.loadAround(props.currentId)
            .then(({beforeId, afterId, curImage, context }) => {
                this.setState({notFound: false,
                               slide: { prevImage: beforeId,
                                        nextImage: afterId,
                                        curImage,
                                        context }})
            })
            .catch((e) => {
                if ( e instanceof PhotoNotFoundError ) {
                    this.setState({notFound: true})
                } else
                    throw e
            })
    }

    onKeyPress(e) {
        var { history } = this.props

        if ( e.key == 'ArrowLeft' ||
             e.key == 'ArrowRight' ) {
            var { prevImage, nextImage } = this.state.slide

            if ( e.key == 'ArrowLeft' )
                history.replace(prevImage)
            else
                history.replace(nextImage)
        } else if ( e.key == 'Escape' ) {
            history.goBack();
        }
    }

    nextSlide() {
        if ( this.state.slide.nextImage )
            this.props.history.replace(this.props.makeImageRoute(this.state.slide.nextImage))
        else
            this.pause()
    }

    resetSlideTimer() {
        if ( this.state.playing ) {
            clearInterval(this.playTimer)
            this.startPlayTimer()
        }
    }

    playPauseBtnClicked() {
        if ( this.state.playing ) {
            this.pause()
        } else {
            this.play()
        }
    }

    play() {
        this.setState({playing: true})
        this.startPlayTimer()
    }

    startPlayTimer() {
        this.playTimer = setInterval(this.nextSlide.bind(this), SLIDE_TIMEOUT)
    }

    pause() {
        if ( this.state.playing ) {
            this.setState({playing: false})
            clearInterval(this.playTimer)
            delete this.playTimer
        }
    }

    onMouseMove() {
        if ( !this.state.showNav ) {
            this.setState({showNav: true})
            this.setNavHideTimer()
        }
    }

    setNavHideTimer() {
        this.navHideTimer = setTimeout(this.hideNav.bind(this), NAV_HIDE_TIMEOUT)
    }

    hideNav() {
        delete this.navHideTimer
        this.setState({showNav: false})
    }

    render() {
        var imgComp

        if ( this.state.notFound ) {
            imgComp = () =>
                E('p', { className: '', key: 'not-found' },
                  'This image was not found', E('br'),
                  E(Link, { to: this.props.parentRoute }, 'Click here to go back'))
        } else if ( this.state.slide === undefined || this.state.slide === null ) {
            imgComp = () => E(LoadingIndicator)
        } else {
            var { curImage, prevImage, nextImage } = this.state.slide
            if ( curImage.type == 'video' ) {
                imgComp = () => E(HlsPlayer, { src: `${INTRUSTD_URL}/image/${curImage.id}`,
                                               key: curImage.id })
            } else {
                imgComp = (size) => {
                    return E(Image, { className: 'ph-slide-img',
                                      src: curImage.image.atSize(size),
                                      key: curImage.id })
                }
            }
        }

        var nextImageBtn, selectedClass, playBtnIcon, showNavClass

        if ( nextImage ) {
            if ( nextImage != 'loading' ) {
                nextImageBtn = E(Link, { to: (nextImage ? this.props.makeImageRoute(nextImage) : "") },
                                 E('i', { className: 'fa fa-fw fa-3x fa-chevron-right' }))
            } else {
                nextImageBtn = E('a', { 'href': '#', 'disabled': true }, E('i', { className: 'fa fa-fw fa-3x fa-chevron-right' }))
            }
        }

        if ( curImage !== undefined && curImage !== null && this.props.selected.includes(curImage.id) )
            selectedClass = 'ph-image-selector--selected';

        if ( this.state.playing )
            playBtnIcon = 'pause'
        else
            playBtnIcon = 'play'

        if ( !this.state.showNav )
            showNavClass = "slideshow-nav--hidden";

        var prevArrow, nextArrow

        if ( prevImage )
            prevArrow = E(Link, { key: 'left', replace: true,
                                  to: this.props.makeImageRoute(prevImage),
                                  onClick: () => {
                                      this.pause()
                                  },
                                  className: `slideshow-arrow slideshow-left-arrow ${prevImage ? '': 'disabled'}` },
                          E('i', { className: 'fa fa-chevron-left' }))

        if ( nextImage )
            nextArrow = E(Link, { key: 'right', replace: true,
                                  to: this.props.makeImageRoute(nextImage),
                                  onClick: () => {
                                      this.resetSlideTimer()
                                  },
                                  className: `slideshow-arrow slideshow-right-arrow ${nextImage ? '' : 'disabled'}`},
                          E('i', { className: 'fa fa-chevron-right' }))

        return [
            E(Navbar, { collapseOnSelect: true, expand: 'lg',
                        bg: 'transparent', variant: 'transparent',
                        fixed: 'top',
                        className: 'slideshow-nav ${showNavClass}' },
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
                                    overlay: mkTooltip(this.state.playing ? 'Pause slideshow' : 'Start slideshow', { className: 'slideshow-tooltip' }) },
                  E(Nav.Link, { onClick: this.playPauseBtnClicked.bind(this),
                                className: 'slideshow-arrow' },
                    E('i', { className: `fa fa-${playBtnIcon}`}))),
                E(OverlayTrigger, { placement: 'bottom',
                                    overlay: mkTooltip('Share', { className: 'slideshow-tooltip' }) },
                  E(Nav.Link, { onClick: (e) => { e.preventDefault();
                                                  this.props.onShare({ photos: [curImage.id] }) } },
                    E('i', { className: 'fa fa-fw fa-share-alt' }))),
                E(OverlayTrigger, { placement: 'bottom',
                                    overlay: mkTooltip('Select', { className: 'slideshow-tooltip' }) },
                  E(Nav.Link, { className: `ph-image-selector ${selectedClass}`,
                                onClick: () => this.props.onSelect(curImage.id) },
                    E('div', { className: 'ph-image-selector-check' },
                      E('span', { className: 'ph-image-selector-box' })))))),

            E(ReactResizeDetector, {
                handleWidth: true, handleHeight: true,
                children: ({width, height}) => {
                    var size = calcIdealImageSize(width, height)

                    if ( this.state.slide !== null && this.state.slide.context ) {
                        this.state.slide.context.map((im) => {
                            if ( im instanceof PhotoItem )
                                im.cacheAtSize(size)
                        })
                    }

                    return E('div', { className: 'slideshow', onMouseMove: this.onMouseMove.bind(this) },
                             prevArrow,
                             nextArrow,
                             E(ReactCSSTransitionGroup, { component: 'div',
                                                          transitionName: 'introduce-image',
                                                          transitionEnterTimeout: 200,
                                                          transitionLeaveTimeout: 10 },
                               imgComp(size)))
                }})
        ];
    }
}

const Slideshow = withRouter(SlideshowImpl)
export default Slideshow
