import React from 'react';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';

import { INTRUSTD_URL } from './PhotoUrl.js';
import { UploadButton, Form as IntrustdForm, PersonaButton } from 'intrustd/src/react.js';
import { debounce } from 'underscore';
import { Link, Switch, Route } from 'react-router-dom';

import Dropdown from 'react-bootstrap/Dropdown';
import Form from 'react-bootstrap/Form';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';

import './icon.svg';

const E = React.createElement;

const RECENT_TAG_COUNT = 15;

class TagSearcher extends React.Component {
    constructor() {
        super()

        this.inputRef = React.createRef()
        this.state = { }
    }

    render() {
        var emptyClass = "", body
        if ( this.isEmpty ) {
            emptyClass = 'ph-tags-searcher--empty'
            body = this.props.placeholder
        } else {
            body = [
                this.props.tags.toArray().map((tag) => {
                    return E('div', { className: 'ph-tags-searcher__tag',
                                      key: `tag-${tag}` },
                             tag,
                             E('span', { className: 'ph-tags-searcher__tag__delete',
                                         onClick: () => this.props.selectTag(tag, false) }))
                }),

                E('input', { type: 'text', className: 'ph-tags-searcher__input', key: 'input', ref: this.inputRef, placeholder: this.props.placeholder })
            ]
        }

        return E('div', { className: `uk-input ph-tags-searcher ${emptyClass}`,
                          tabIndex: "1",
                          onFocus: () => { this.inputRef.current.focus() } },
                 body)
    }
}

class RecentTags extends React.Component {
    render() {
        if ( this.props.recentTags ) {
            return E(Dropdown.Menu, null,
                     E(Dropdown.Item, { className: 'uk-nav-header' }),
                     this.props.recentTags.map((t) => {
                         var className = 'ph-recent-tags__tag';
                         var selected = this.props.selectedTags.contains(t)
                         if ( selected )
                             className += ' ph-recent-tags__tag--selected';

                         return E(Dropdown.Item,
                                  { key: t, className,
                                    onClick: () => { this.props.onSelect(t, !selected) } }, t)
                     }))
        } else {
            return []
        }
    }
}

export default class IntrustdNavbar extends React.Component {
    constructor () {
        super()
        this.uploadRef = React.createRef()
        this.dropdownRef = React.createRef()

        this.state = { recentTags: null }
    }

    latestTags(tags) {
        var newTags = [...tags]

        this.state.recentTags.map((tag) => {
            if ( newTags.find(tag) === undefined )
                newTags.push(tag)
        })

        this.setState({recentTags: newTags.slice(0, RECENT_TAG_COUNT)});
    }

    doUpload(e) {
        if ( e ) e.preventDefault()
        this.props.uploadPhoto(this.uploadRef.current.formData)

        this.uploadRef.current.reset()
    }

    componentDidMount() {
//        this.disableLinks()
//
//        this.shareLink.addEventListener('click', () => { this.props.onShare('selected'); })
//        this.shareAllLink.addEventListener('click', () => { this.props.onShare('all'); })

        fetch(`${INTRUSTD_URL}/tag/recent?length=${RECENT_TAG_COUNT}`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((recentTags) => this.setState({recentTags}))
                } else {
                    this.setState({ recentTags: [] })
                }
            })
    }

    render() {
        var status = []
        var branding, shareLink

        if ( typeof this.props.imgCount == 'number' )
            status.push(`${this.props.imgCount} images`)

        if ( typeof this.props.selectedCount == 'number' &&
             this.props.selectedCount > 0 ) {
            branding = E('span', { key: 'selected', className: 'selection-brand'},
                         E('a', { href: '#',
                                  onClick: (e) => { e.preventDefault(); this.props.onDeselectAll() } },
                           E('i', { className: 'fa fa-fw fa-times' })),
                         ` ${this.props.selectedCount} selected`)
            shareLink = E(Nav.Link, { onClick: () => this.props.onShare('selected'),
                                      key: 'share' },
                          E('i', { className: 'fa fa-fw fa-share-alt' }),
                          E('span', { className: 'd-lg-none d-xl-inline' }, ' Share selected'))
        } else {
            branding = E('a', { href: '#', key: 'brand', className: 'image-brand' },
                         E('img', { src: 'images/icon.svg' }),
                         E('span', { className: 'd-md-inline d-sm-none' }, 'Intrustd Photos'))
            shareLink = E(Switch, null,
                          E(Route, { path: '/album/:albumId',
                                     render: (thisProps) => {
                                         return E(Nav.Link, { onClick: () => this.props.onShare('album', thisProps.match.params.albumId),
                                                              key: 'share' },
                                                  E('i', { className: 'fa fa-fw fa-share-alt' }),
                                                  E('span', { className: 'd-lg-none d-xl-inline' }, ' Share this album'))
                                     } }),
                          E(Route, { path: '*',
                                     render: () => {
                                         return E(Nav.Link, { onClick: () => this.props.onShare('all'),
                                                              key: 'share' },
                                                  E('i', { className: 'fa fa-fw fa-share-alt' }),
                                                  E('span', { className: 'd-lg-none d-xl-inline' },' Share my photos'))
                                     }}))
        }

        this.links = []

        var selectAllCheck, selectText
        if ( this.props.allSelected ) {
            selectAllCheck = 'fa-square';
            selectText = " Select None"
        } else {
            selectAllCheck = 'fa-check-square'
            selectText = " Select All";
        }

        var galleryLink = () => { return null },
            albumsLink = () => { return null }, editAlbumsLink,
            uploadItem

        if ( this.props.perms.gallery )
            galleryLink = () => {
                return E(Nav.Link, { as: Link, to: "/",
                                     key: 'albums' },
                         E('i', { className: 'fa fa-fw fa-th' }),
                         ' Gallery')
            }

        if ( this.props.perms.albums ) {
            console.log("Setting albumsLink")
            albumsLink = () => {
                return E(Nav.Link, { as: Link, to: "/album",
                                     key: 'albums' },
                         E('i', { className: 'fa fa-fw fa-book' }),
                         E('span', { className: 'd-lg-none d-xl-inline d-sm-inline' },
                           'Albums'))
            }
        }

        if ( this.props.perms.upload ) {
            return E(Nav.Item, null,
                     E(Form, { as: IntrustdForm, method: 'POST', encType: 'multipart/form-data',
                               className: 'uk-navbar-item ph-upload ph-nav-icon',
                               action: INTRUSTD_URL + "/upload", ref: this.uploadRef,
                               onSubmit: (e) => { this.doUpload(e) }},
                       E(UploadButton, { name: 'photo', elName: 'a',
                                         className: 'ph-upload-btn btn btn-outline-secondary',
                                         onUpload: (e) => { this.doUpload() } },
                         E('span', {className: 'fa fa-upload'}),
                         E('span', { className: 'd-xl-inline d-lg-none d-sm-inline' }, ' Upload'))))

        }

        if ( this.props.perms.createAlbums )
            editAlbumsLink = E(Route, { path: '/album/:albumId',
                                        render: ({match}) => {
                                            return E(Nav.Link, { as: Link, to: `/album/${match.params.albumId}/edit`,
                                                                 key: 'edit-album' },
                                                     E('i', { className: 'fa fa-fw fa-pencil' }),
                                                     E('span', { className: 'd-lg-none d-xl-inline d-sm-inline' },
                                                       ' Edit this Album'))
                                        } })

        return [ E(Navbar, { collapseOnSelect: true, expand: 'lg', key: 'main-nav',
                             bg: 'light', variant: 'light', sticky: 'top',
                             style: { display: this.props.visible ? undefined : 'none' } },
                   E('div', { className: 'container-fluid' },
                     E(ReactCSSTransitionGroup,
                       { component: Navbar.Brand,
                         transitionName: 'slide-up',
                         transitionEnterTimeout: 200,
                         transitionLeaveTimeout: 200 },
                       branding),

                     E(Nav.Item, { className: 'ml-auto justify-self-center flex-grow-1 ph-tags-searcher-container' },
                       E(Form, { inline: true, className: 'mx-auto' },
                         E(Form.Control, { as: TagSearcher, placeholder: 'Search your photos', className: 'mr-sm-2',
                                           selectTag: this.props.selectTag,
                                           tags: this.props.searchTags }))),

                     uploadItem,

                     E(Navbar.Toggle, { 'aria-controls': 'intrustd-nav' }),
                     E(Navbar.Collapse, { id: 'intrustd-nav' },
                       E(Nav, { className: 'w-100' },


                         E(Nav.Link, { className: 'ml-auto', key: 'image-count' }, status.join(", ")),

                         E(Nav.Link, { href: '#', key: 'select-all',
                                       className: 'ph-nav-link-default',
                                       onClick: () => { this.props.onSelectAll() } },
                           E('i', { className: `fa fa-fw ${selectAllCheck}` }),
                           E('span', { className: 'd-lg-none d-xl-inline d-sm-inline' }, selectText)),

                         E(Switch, null,
                           E(Route, { path: '/album', render: galleryLink }),
                           E(Route, { path: '*', render: albumsLink })),

                         E(Dropdown, { as: Nav.Item,
                                       className: 'ph-nav-link-default' },
                           E(Dropdown.Toggle, { as: Nav.Link },
                             E('i', { className: 'fa fa-fw fa-tag' }),
                             E('span', { className: 'd-lg-none d-xl-inline d-sm-inline' }, 'Tags')),
                           E(RecentTags, { recentTags: this.state.recentTags,
                                           onSelect: this.props.selectTag,
                                           selectedTags: this.props.selectedTags })),

                         editAlbumsLink,

                         shareLink,

                         E(Nav.Item, null,
                           E(PersonaButton, {}))))))
               ];
    }
}
