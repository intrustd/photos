import EventTarget from 'event-target-shim';

import react from 'react';
import ReactDom from 'react-dom';

import Dropdown from 'react-bootstrap/Dropdown';
import Progress from 'react-bootstrap/ProgressBar';

import { INTRUSTD_URL } from './PhotoUrl.js';

const E = react.createElement;

class PhotoUploadProgressEvent {
    constructor(complete, total) {
        this.type = 'progress'
        this.complete = complete
        this.total = total
    }
}

class PhotoUploadErrorEvent {
    constructor(error) {
        this.type = 'error'
        this.what = error
    }
}

class PhotoUploadCompletesEvent {
    constructor(target, photo) {
        this.type = 'complete'
        this.target = target
        this.photo = photo
    }
}

export class PhotoUpload extends EventTarget('progress', 'error', 'complete') {
    constructor(key, formData) {
        super()

        this.key = key
        this.formData = formData

        this.error = false

        var photos = this.formData.getAll('photo')

        if ( photos.length > 0 )
            this.fileName = photos[0].name
        else
            this.fileName = "Photo"
    }

    start() {
        this.req = new XMLHttpRequest()

        this.req.addEventListener('load', () => {
            this.dispatchEvent(new PhotoUploadProgressEvent(100, 100))

            var photo = null
            try {
                photo = JSON.parse(this.req.responseText)
            } catch (e) {
                photo = null
            }

            this.photo = photo
            this.dispatchEvent(new PhotoUploadCompletesEvent(this, photo))
        })

        this.req.addEventListener('error', (e) => {
            this.error = true
            this.dispatchEvent(new PhotoUploadErrorEvent(e))
            this.dispatchEvent(new PhotoUploadCompletesEvent(this))
        })

        this.req.addEventListener('progress', (e) => {
            var progData = { error: false, complete: e.loaded }
            if ( e.lengthComputable )
                progData.total = e.total
            this.dispatchEvent(new PhotoUploadProgressEvent(progData.complete, progData.total))
        })

        this.req.open('POST', INTRUSTD_URL + "/image", true)
        this.req.send(this.formData)
    }
}

export class UploadIndicator extends react.Component {
    constructor () {
        super()

        this.state = { error: false, total: 100, complete: 0 }
        this.unsubscribe = () => {}
    }

    componentDidMount() {
        var progressFn = this.onProgress.bind(this)
        var completeFn = this.onComplete.bind(this)
        this.props.upload.addEventListener('progress', progressFn)
        this.props.upload.addEventListener('complete', completeFn)

        this.unsubscribe = () => {
            this.props.upload.removeEventListener('progress', progressFn)
            this.props.upload.removeEventListener('complete', completeFn)
        }
        this.props.upload.start()
    }

    componentWillUnmount() {
        this.unsubscribe()
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

        var progProps = { }
        if ( this.state.total !== null ) {
            progProps.now = this.state.complete;
            progProps.max = this.state.total;
        } else {
            progProps.now = 1;
            progProps.max = 1;
            progProps.animated = true;
        }

        return  E('span', { className: 'dropdown-item-text upload-indicator' },
                  E('span', { className: 'upload-filename' },
                    this.props.upload.fileName),
                  E(Progress, progProps))
    }
}
