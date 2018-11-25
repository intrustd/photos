import React from 'react';
import { KITE_URL } from './PhotoUrl.js';
import { KiteUploadButton, KiteForm, KitePersonaButton } from 'stork-js/src/react.js';

const E = React.createElement;

export default class Navbar extends React.Component {
    constructor () {
        super()
        console.log("Made navbar")

        this.uploadRef = React.createRef()
    }

    doUpload(e) {
        if ( e ) e.preventDefault()
        this.props.uploadPhoto(this.uploadRef.current.formData)

        this.uploadRef.current.reset()
    }

    render() {
        return E('nav', {className: 'uk-navbar-container', 'uk-navbar': 'uk-navbar'},
                 E('div', {className: 'uk-navbar-left'},
                   E('a', {className: 'uk-navbar-item uk-logo',
                           href: '#'}, 'Photo')),

                 E('div', {className: 'uk-navbar-right'},
                   E('div', {className: 'uk-navbar-item'},
                     E(KiteForm, { method: 'POST', encType: 'multipart/form-data',
                                   action: KITE_URL + "/upload", ref: this.uploadRef,
                                   onSubmit: (e) => { this.doUpload(e) }},
                       E(KiteUploadButton, { elName: 'button', type: 'button', name: 'photo',
                                             className: 'uk-button uk-button-primary',
                                             onUpload: (e) => { this.doUpload() } },
                         E('span', {className: 'fa fa-upload'}),
                         ' Upload'))),
                   E('ul', {className: 'uk-navbar-nav'},
                     E(KitePersonaButton, {}))));
    }
}
