import UIKit from 'uikit';
import 'uikit/src/less/uikit.theme.less';

import './Photos.scss';

import 'font-awesome/scss/font-awesome.scss';

import { streamsExample } from 'stork-js/src/polyfill/Streams.js';

import Albums from './Albums';
import Gallery from './Gallery';
import Navbar from './Navbar';
import { KITE_URL } from './PhotoUrl.js';
import { installKite } from 'stork-js';

import { Map } from 'immutable';
import react from 'react';
import ReactDom from 'react-dom';
import { HashRouter as Router,
         Route, Switch,
         Link } from 'react-router-dom';

import './photos.svg';

installKite({permissions: [ "kite+perm://photos.flywithkite.com/comment",
                            "kite+perm://photos.flywithkite.com/comment/transfer",
			    "kite+perm://photos.flywithkite.com/upload",
			    "kite+perm://photos.flywithkite.com/view",
                            "kite+perm://photos.flywithkite.com/view/transfer",
			    "kite+perm://photos.flywithkite.com/gallery",
                            "kite+perm://photos.flywithkite.com/gallery/transfer",
                            "kite+perm://admin.flywithkite.com/login/transfer" ]})

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
        console.log("Starting", this.formData.getAll('photo'))
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

        this.req.open('POST', KITE_URL + "/image", true)
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
        console.log('onProgress', e)

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

        this.state = { uploads: [], slideshow: false }
        this.uploadKey = 0
    }

    componentDidMount() {
        fetch(KITE_URL + "/image",
              { method: 'GET' })
            .then((res) => res.json())
            .then((imgs) => this.setState({images:imgs}))

//            .then((imgs) => imgs.map((im, i) => [ im.id, { image: im, nextImage:  ]))
//            .then((imgs) => this.setState({
//                images: this.state.images.merge(Object.fromEntries(imgs))
//            }))
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
        console.log("photo is", photo)
        setTimeout(() => {
            var newUploads =
                this.state.uploads.filter((ul) => (ul.key != ulKey))

            this.setState({ uploads: newUploads })
        }, UPLOAD_KEEPALIVE)

        if ( photo !== null ) {
            if ( this.state.images.every((im) => (im.id != photo.id)) ) {
                var newImages = [ photo, ...this.state.images ]
                this.setState({images: newImages})
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

    onImageDescriptionChanged(imageId, newDesc) {
        var image = this.state.images.filter((img) => (img.id == imageId))
        if ( image.length == 0 ) return
        image = image[0]

        var oldDesc = image.description

        console.log("requesting", `${KITE_URL}/image/${imageId}/description`)

        this.modifyImage(imageId, (image) => Object.assign({}, image, { loading: true, description: newDesc }))
        fetch(`${KITE_URL}/image/${imageId}/description`,
              { method: 'PUT',
                body: newDesc,
                headers: {
                    'Content-Type': 'text/plain'
                } })
            .then((r) => {
                if ( r.ok ) {
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

    render() {
        const E = react.createElement;
        console.log("Render", this.state.uploads)
        return E(Router, {},
                 E('div', null,
                   E(Navbar, { uploadPhoto: (fd) => this.uploadPhoto(fd) }),

                   E(Route, { path: '/',
                              render: ({match, location, history}) =>
                              E(Gallery, {match, location, history, images: this.state.images,
                                          onStartSlideshow: this.onStartSlideshow.bind(this),
                                          onEndSlideshow: this.onEndSlideshow.bind(this),
                                          onImageDescriptionChanged: this.onImageDescriptionChanged.bind(this) }) }),

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
