import React from 'react';
import { INTRUSTD_URL } from './PhotoUrl.js';
import { UploadButton, Form, PersonaButton } from 'intrustd/src/react.js';
import { debounce } from 'underscore';

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

                E('input', { type: 'text', className: 'ph-tags-searcher__input', key: 'input', ref: this.inputRef })
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
            return E('ul', { className: 'uk-nav uk-navbar-dropdown-menu uk-dropdown-nav ph-recent-tags' },
                     E('li', { className: 'uk-nav-header' }),
                     this.props.recentTags.map((t) => {
                         var className = 'ph-recent-tags__tag';
                         var selected = this.props.selectedTags.contains(t)
                         if ( selected )
                             className += ' ph-recent-tags__tag--selected';

                         return E('li', { key: t, className,
                                          onClick: () => { this.props.onSelect(t, !selected) } }, t)
                     }))
        } else {
            return []
        }
    }
}

export default class Navbar extends React.Component {
    constructor () {
        super()
        this.uploadRef = React.createRef()
        this.shareLinkRef = React.createRef()
        this.dropdownRef = React.createRef()

        this.links = []
        this.shareLink = null
        this.shareAllLink = null
        this.copyShareLink = null

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

    doCopyShareLink(e) {
        if ( this.shareLinkRef.current ) {
            this.shareLinkRef.current.select()
            document.execCommand('copy')
        }
    }

    componentDidMount() {
        this.disableLinks()

        this.shareLink.addEventListener('click', () => { this.props.onShare('selected'); })
        this.shareAllLink.addEventListener('click', () => { this.props.onShare('all'); })

        fetch(`${INTRUSTD_URL}/tag/recent?length=${RECENT_TAG_COUNT}`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((recentTags) => this.setState({recentTags}))
                } else {
                    this.setState({ recentTags: [] })
                }
            })
    }

    componentDidUpdate() {
        this.disableLinks()
    }

    disableLinks() {
        this.links.map((l) => {
            if ( l !== null && !l.stopped ) {
                l.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation() })
                l.stopped = true
            }
        })

        if ( this.copyShareLink !== null &&
             !this.copyShareLink.bound ) {
            this.copyShareLink.bound = true
            this.copyShareLink.addEventListener('click', this.doCopyShareLink.bind(this))
        }
    }

    render() {
        var status = []

        if ( typeof this.props.imgCount == 'number' )
            status.push(`${this.props.imgCount} images`)

        if ( typeof this.props.selectedCount == 'number' &&
             this.props.selectedCount > 0 )
            status.push(`${this.props.selectedCount} selected`)

        var shareLinkInput

        if ( this.props.shareLink ) {
            shareLinkInput = [
                E('li', null,
                  E('div', { className: 'uk-inline' },
                    E('a', { className: 'uk-form-icon uk-form-icon-flip', href: '#',
                             ref: (r) => { this.links.push(r); this.copyShareLink = r } },
                      E('i', { className: 'fa fa-fw fa-copy' })),
                    E('input', { type: 'text', className: 'uk-input',
                                 ref: this.shareLinkRef,
                                 value: this.props.shareLink }))
                 ),
                E('li', { className: 'uk-nav-divider' })
            ];
        }

        this.links = []

        var selectAllCheck
        if ( this.props.allSelected )
            selectAllCheck = 'fa-square'
        else
            selectAllCheck = 'fa-check-square'

        return E('nav', {className: 'uk-navbar-container', 'uk-navbar': '' },
                 E('div', {className: 'uk-navbar-left'},
                   E('a', {className: 'uk-navbar-item uk-logo',
                           href: '#'}, 'Photo'),
                   E('div', { className: 'uk-navbar-item' },
                     E(TagSearcher, { placeholder: 'Search...',
                                      selectTag: this.props.selectTag,
                                      tags: this.props.searchTags }))),

                 E('div', {className: 'uk-navbar-right'},

                   E('div', { className: 'uk-navbar-item ph-nav-status' },
                     status.join(", ")),

                   E('div', { className: 'uk-navbar-item ph-nav-icon' },
                     E('a', { href: '#',
                              className: 'ph-nav-link-default',
                              onClick: () => { this.props.onSelectAll() },
                              'uk-tooltip': ( this.props.allSelected ?
                                              'title: Deselect all; pos: bottom' :
                                              'title: Select all; pos: bottom' ) },
                       E('i', { className: `fa fa-fw ${selectAllCheck}` }))),

                   E('div', { className: 'uk-navbar-item ph-nav-icon' },
                     E('a', { href: '#',
                              className: 'ph-nav-link-default',
                              onClick: () => { },
                              'uk-tooltip': 'title: Tags; pos: bottom' },
                       E('i', { className: 'fa fa-fw fa-tag' })),
                     E('div', { 'uk-dropdown': 'mode: click' },
                       E(RecentTags, { recentTags: this.state.recentTags,
                                       onSelect: this.props.selectTag,
                                       selectedTags: this.props.selectedTags }))),

                   E('div', { className: 'uk-navbar-item ph-nav-icon' },
                     E('div', { className: 'uk-inline' },
                       E('a', { href: '#', className: 'ph-nav-link-default',
                                'uk-tooltip': 'title: Share; pos: bottom' },
                         E('i', { className: 'fa fa-fw fa-share-alt' })),
                       E('div', { 'uk-dropdown': 'mode: click',
                                  ref: this.dropdownRef },
                         E('ul', { className: 'uk-nav uk-navbar-dropdown-menu uk-dropdown-nav' },
                           shareLinkInput,
                           E('li', null,
                             E('a', { href: '#',
                                      ref: (r) => { this.links.push(r); this.shareLink = r } },
                               'Share selected...')),
                           E('li', { style: { display: (this.props.searchTags.count() == 0 ? 'none' : 'inherit') } },
                             E('a', { href: '#',
                                      ref: (r) => { this.links.push(r); this.shareTagsLink = r } },
                               'Share these tags...')),
                           E('li', null,
                             E('a', { href: '#',
                                      ref: (r) => { this.links.push(r); this.shareAllLink = r }, },
                               'Share all...'))
                          )))),

                   E(Form, { method: 'POST', encType: 'multipart/form-data',
                             className: 'uk-navbar-item ph-upload ph-nav-icon',
                             action: INTRUSTD_URL + "/upload", ref: this.uploadRef,
                             onSubmit: (e) => { this.doUpload(e) }},
                     E(UploadButton, { elName: 'a', name: 'photo',
                                       'uk-tooltip': 'title: Upload photo; pos: bottom',
                                       onUpload: (e) => { this.doUpload() } },
                       E('span', {className: 'fa fa-upload'}))),
                   E('ul', {className: 'uk-navbar-nav'},
                     E(PersonaButton, {}))));
    }
}
