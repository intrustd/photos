import React from 'react';
import { KITE_URL } from './PhotoUrl.js';
import { KiteUploadButton, KiteForm, KitePersonaButton } from 'stork-js/src/react.js';

const E = React.createElement;

export default class Navbar extends React.Component {
    constructor () {
        super()
        this.uploadRef = React.createRef()
        this.shareLinkRef = React.createRef()
    }

    doUpload(e) {
        if ( e ) e.preventDefault()
        this.props.uploadPhoto(this.uploadRef.current.formData)

        this.uploadRef.current.reset()
    }

    copyShareLink(e) {
        e.preventDefault();
        e.stopPropagation()
        if ( this.shareLinkRef.current ) {
            this.shareLinkRef.current.select()
            document.execCommand('copy')
        }
    }

    render() {
        var status = []

        if ( typeof this.props.imgCount == 'number' )
            status.push(`${this.props.imgCount} images`)

        if ( typeof this.props.selectedCount == 'number' &&
             this.props.selectedCount > 0 )
            status.push(`${this.props.selectedCount} selected`)

        return E('nav', {className: 'uk-navbar-container', 'uk-navbar': '' },
                 E('div', {className: 'uk-navbar-left'},
                   E('a', {className: 'uk-navbar-item uk-logo',
                           href: '#'}, 'Photo'),
                   E('div', { className: 'uk-navbar-item' },
                    )),

                 E('div', {className: 'uk-navbar-right'},

                   E('div', { className: 'uk-navbar-item ph-nav-status' },
                     status.join(", ")),

                   E('div', { className: 'uk-navbar-item ph-nav-icon' },
                     E('div', { className: 'uk-inline' },
                       E('a', { href: '#', className: 'ph-nav-link-default',
                                onClick: (e) => { this.props.onShare() },
                              'uk-tooltip': 'title: Share; pos: bottom' },
                         E('i', { className: 'fa fa-fw fa-share-alt' })),
                       E('div', { 'uk-dropdown': 'mode: click' },
                         E('ul', { className: 'uk-nav uk-navbar-dropdown-menu' },
                           E('li', null,
                             E('div', { className: 'uk-inline' },
                               E('a', { className: 'uk-form-icon uk-form-icon-flip', href: '#',
                                        onClick: this.copyShareLink.bind(this) },
                                 E('i', { className: 'fa fa-fw fa-copy' })),
                               E('input', { type: 'text', className: 'uk-input',
                                            ref: this.shareLinkRef,
                                            value: this.props.shareLink }))
                            ))))),

                   E(KiteForm, { method: 'POST', encType: 'multipart/form-data',
                                 className: 'uk-navbar-item ph-upload ph-nav-icon',
                                 action: KITE_URL + "/upload", ref: this.uploadRef,
                                 onSubmit: (e) => { this.doUpload(e) }},
                     E(KiteUploadButton, { elName: 'a', name: 'photo',
                                           'uk-tooltip': 'title: Upload photo; pos: bottom',
                                           onUpload: (e) => { this.doUpload() } },
                       E('span', {className: 'fa fa-upload'}))),
                   E('ul', {className: 'uk-navbar-nav'},
                     E(KitePersonaButton, {}))));
    }
}
