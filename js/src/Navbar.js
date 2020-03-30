import React from 'react';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';

import { INTRUSTD_URL } from './PhotoUrl.js';
import { takeAtMostFirst } from './Util.js';
import { UploadIndicator } from './Uploads.js';
import { Search, SearchTerm, SearchTermTypes } from './Search.js';
import { UploadButton, Form as IntrustdForm, PersonaButton } from 'intrustd/src/react.js';
import { debounce } from 'underscore';
import { Link, Switch, Route, withRouter } from 'react-router-dom';

import Dropdown from 'react-bootstrap/Dropdown';
import DropdownButton from 'react-bootstrap/DropdownButton';
import Form from 'react-bootstrap/Form';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import ButtonGroup from 'react-bootstrap/ButtonGroup';

import Select, { components as SelectComponents } from 'react-select';

import './icon.svg';

const MAX_UPLOAD_CONCURRENCY = 10;
const E = React.createElement;

const RECENT_TAG_COUNT = 15;

class NavLink extends React.Component {
    render() {
        var props = Object.assign({}, this.props)
        delete props.icon
        delete props.text

        if ( props.to ) {
            props.as = Link
        }

        return E(Nav.Link, props,
                 E('i', { className: `fa fa-fw fa-${this.props.icon}` }),
                 E('span', { className: 'd-lg-none d-xl-inline' },` ${this.props.text}`))
    }
}

const SearcherDisplayTags = {
    TAG: 'TAG',
    TYPE: 'TYPE',
    ALBUM: 'ALBUM',
    KEYWORD: 'KEYWORD',
    LOADING: 'LOADING'
}

function SearcherGroupHeading(props) {

    return E('span', { className: 'search-group--heading' },
             E(SelectComponents.GroupHeading, props))
}

function SearcherGroup(props) {
    var showMoreLabel

    if ( props.display == SearcherDisplayTags.ALBUM ||
         props.display == SearcherDisplayTags.TAG )
        showMoreLabel = E('span', { className: 'search-group__show-more' },
                          'More ',
                          E('i', { className: 'fa fa-fw fa-chevron-right' }))

    return E('div', { className: 'search-group' },
             E(SelectComponents.Group, props),
             showMoreLabel)
}

function SearcherLabel(props) {
    var newProps = Object.assign({}, props)
    delete newProps.children

    return E(SelectComponents.MultiValueLabel, newProps,
             E(SearchTermDisplay, { term: props.data.value,
                                    label: props.data.label }))
}

class SearchTermDisplay extends React.Component {
    render() {
        const faIcons = { 'photos': 'images',
                          'videos': 'video' }
        switch ( this.props.term.termType ) {
        case SearchTermTypes.TYPE:
            return E('span', { className: 'search-term search-term--type' },
                     E('i', { className: `fa fa-${faIcons[this.props.term.type]}` }),
                     ` ${this.props.term.type}`)

        case SearchTermTypes.TAG:
            return E('span', { className: 'search-term search-term--tag' },
                     E('i', { className: 'fa fa-tag' }),
                     ` ${this.props.term.tag}`)

        case SearchTermTypes.ALBUM:
            return E('span', { className: 'search-term search-term--album' },
                     E('i', { className: 'fa fa-book'}),
                     ` ${this.props.label}`)

        default:
            return E('span', null, 'Unknown tag')
        }
    }
}

function mkTagOption(tag) {
    return { label: tag,
             display: SearcherDisplayTags.TAG,
             value: SearchTerm.tag(tag) }
}

class Searcher extends React.Component {
    constructor() {
        super()

        this.state = { search: [],
                       tags: null, albums: null,
                       showMoreTags: false, loadingTags: false,
                       showMoreAlbums: false, loadingAlbums: false  }
        this.state.options = this.mkOptions()
    }

    addTag(tag) {
        var tagTerm = SearchTerm.tag(tag)
        var tagExists = this.state.search.some((term) => term.value.isEqual(tagTerm))
        var search = this.state.search

        if ( !tagExists ) {
            var search = [ ...this.state.search,
                           mkTagOption(tag) ]
            this.setState({search})
        }

        return search.map(({value}) => value)
    }

    removeTag(tag) {
        var tagTerm = SearchTerm.tag(tag)
        var search = this.state.search.filter((term) => !term.value.isEqual(tagTerm))

        this.setState({search})

        return search.map(({value}) => value)
    }

    loadOptions() {
        if ( this.state.tags === null )
            this.reloadTags(this.state.showMoreTags)

        if ( this.state.albums === null )
            this.reloadAlbums(this.state.showMoreAlbums)
    }

    reloadOptions() {
        this.reloadTags(this.state.showMoreTags)
        this.reloadAlbums(this.state.showMoreAlbums)
    }

    reloadTags() {
        this.setState({loadingTags: true})

        fetch(`${INTRUSTD_URL}/tag/recent`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((tags) => {
                        this.setState({tags})
                        this._remakeOptions()
                    })
                } else
                    console.error("Could not fetch tags: ", r)
            })
            .finally(() => {
                this.setState({loadingTags: false})
            })
    }

    reloadAlbums() {
        fetch(`${INTRUSTD_URL}/albums`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((albums) => {
                        console.log("Got albums", albums)
                        this.setState({albums})
                        this._remakeOptions()
                    })
                } else
                    console.error("Could not fetch albums: ", r)
            })
            .finally(() => {
                this.setState({loadingAlbums: false})
            })
    }

    mkTypeOptions() {
        return [ { label: 'Photos',
                   display: SearcherDisplayTags.TYPE,
                   icon: 'images',
                   value: SearchTerm.type("photos") },
                 { label: 'Videos',
                   display: SearcherDisplayTags.TYPE,
                   icon: 'video',
                   value: SearchTerm.type("videos") } ]
    }

    _remakeOptions() {
        this.setState({options: this.mkOptions()})
    }

    _restrictList(ls, showMore) {
        if ( ls === null )
            return []

        if ( showMore )
            return ls
        else
            return ls.slice(0, 9) // Ten items
    }

    mkTagOptions() {
        var tags = this.state.tags

        tags = this._restrictList(tags, this.state.showMoreTags)

        tags = tags.map(mkTagOption)

        if ( this.state.loadingTags )
            tags.push({ display: SearcherDisplayTags.LOADING })

        return tags
    }

    mkAlbumOptions() {
        var albums = this.state.albums

        albums = this._restrictList(albums, this.state.showMoreAlbums)

        albums = albums.map((album) => {
            return { label: album.name,
                     album,
                     display: SearcherDisplayTags.ALBUM,
                     value: SearchTerm.album(album.id) }
        })

        if ( this.state.loadingAlbums )
            albums.push({ display: SearcherDisplayTags.LOADING })

        return albums
    }

    mkDateTimeOptions() {
        return []
    }

    mkOptions(search) {
        var result = []

        if ( search ) {
            result.push({ label: `Search for keyword: ${search}`,
                          display: SearcherDisplayTags.KEYWORD,
                          value: SearchTerm.keyword(search) })
        }

        result.push({ label: 'Type',
                      display: SearcherDisplayTags.TYPE,
                      options: this.mkTypeOptions() })

        result.push({ label: "Tags",
                      display: SearcherDisplayTags.TAG,
                      loading: this.state.loadingTags,
                      options: this.mkTagOptions()
                    })

        result.push({ label: "Albums",
                      display: SearcherDisplayTags.ALBUM,
                      loading: this.state.loadingAlbums,
                      options: this.mkAlbumOptions() })

        return result
    }

    handleInputChange(search) {
        var options = this.mkOptions(search)
        this.setState({options})
    }

    handleChange(search) {
        if ( search === null )
            search = []

        this.setState({search})
        this.props.onChange(search.map((s) => s.value))
    }

    render() {
        return E(Form, { inline: true, className: 'mx-auto' },
                 E(Select, { components: { Placeholder: 'Search...',
                                           Group: SearcherGroup,
                                           GroupHeading: SearcherGroupHeading,
                                           MultiValueLabel: SearcherLabel },

                             className: 'search-bar',

                             onMenuOpen: this.loadOptions.bind(this),

                             onInputChange: this.handleInputChange.bind(this),
                             onChange: this.handleChange.bind(this),

                             options: this.state.options,
                             isMulti: true,
                             value: this.state.search,
                             openMenuOnFocus: true }))
    }
}

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

class IntrustdNavbar extends React.Component {
    constructor () {
        super()
        this.uploadRef = React.createRef()
        this.dropdownRef = React.createRef()
        this.searchRef = React.createRef()

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
        fetch(`${INTRUSTD_URL}/tag/recent?length=${RECENT_TAG_COUNT}`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((recentTags) => this.setState({recentTags}))
                } else {
                    this.setState({ recentTags: [] })
                }
            })
    }

    removeTag(tag) {
        return this.searchRef.current.removeTag(tag)
    }

    addTag(tag) {
        return this.searchRef.current.addTag(tag)
    }

    render() {
        var bar
        if ( typeof this.props.selectedCount == 'number' &&
             this.props.selectedCount > 0 ) {
            bar = this.renderSelectBar()
        } else
            bar = this.renderDefault()

        return E(ReactCSSTransitionGroup, { component: Navbar,

                                            collapseOnSelect: true, expand: 'lg',
                                            bg: 'light', variant: 'light',
                                            style: { display: this.props.visible ? undefined : 'none' },

                                            transitionName: 'navbar-slide',
                                            transitionEnterTimeout: 200,
                                            transitionLeaveTimeout: 200 },
                 bar)
    }

    renderSelectBar() {
        var shareLink, addToAlbumLink, downloadLink, removeFromAlbumLink, deleteLink

        shareLink = E(NavLink, { onClick: () => this.props.onShare('selected'),
                                 className: 'ml-auto',
                                 key: 'share',
                                 icon: 'share-alt',
                                 text: 'Share selected' })
        addToAlbumLink = E(NavLink, { onClick: this.props.onAddAlbum,
                                      key: 'create-album',
                                      icon: 'folder-plus',
                                      text: 'Add to Album' })
        downloadLink = E(NavLink, { onClick: this.props.onDownloadSelected,
                                    key: 'download',
                                    icon: 'download',
                                    text: 'Download' })
        deleteLink = E(NavLink, { onClick: this.props.onDelete,
                                  key: 'delete',
                                  icon: 'trash',
                                  text: 'Delete' })

        if ( this.props.match.params.albumId ) {
            removeFromAlbumLink = E(NavLink, { onClick: this.props.removeFromAlbum,
                                               key: 'remove',
                                               icon: 'times',
                                               text: 'Remove From Album' })
        }

        return  E('div', { className: 'container-fluid', key: 'select-nav' },
                  E('span', { key: 'selected', className: 'selection-brand'},
                    E('a', { href: '#',
                             onClick: (e) => { e.preventDefault(); this.props.onDeselectAll() } },
                      E('i', { className: 'fa fa-fw fa-times' })), ' ',
                    E('span', { className: 'selected-count' }, `${this.props.selectedCount}`),
                    ' selected'),


                  shareLink,
                  addToAlbumLink,
                  downloadLink,
                  removeFromAlbumLink,
                  deleteLink)
    }

    renderOngoingUpload(upload) {
        return E(UploadIndicator, { upload,
                                    onComplete: () => {
                                        this.props.onUploadCompletes(upload)
                                    } })
    }

    renderOngoingUploads() {
        if ( this.props.ongoingUploads.size > 0 ||
             this.props.completedUploads.size > 0 ) {
            var activeLabel, inactiveLabel, inactiveItem
            var completeLabel, completedItem
            var active = [], inactiveCount = 0, icon

            if ( this.props.ongoingUploads.size > 0 ) {
                active = takeAtMostFirst(this.props.ongoingUploads.toArray(), MAX_UPLOAD_CONCURRENCY)
                inactiveCount = this.props.ongoingUploads.size - active.length

                if ( active.length > 0 ) {
                    activeLabel = E('span', { key: 'active', className: 'upload-indicator upload-indicator-active' },
                                    E('span', { key: 'count', className: 'upload-indicator-count' }, `${active.length}`),
                                    E('span', { key: 'label', className: 'upload-indicator-label' }, ' Active'))
                }

                if ( inactiveCount > 0 ) {
                    inactiveLabel = E('span', { key: 'inactive', className: 'upload-indicator upload-indicator-inactive' },
                                      E('span', { key: 'count', className: 'upload-indicator-count'}, `${inactiveCount}`),
                                      E('span', { key: 'label', className: 'upload-indicator-label'}, ' Waiting'))
                    inactiveItem = E(Dropdown.Item, { disabled: true },
                                     `  plus ${inactiveCount} more...`)
                }
            }

            if ( this.props.completedUploads.size > 0 ) {
                completeLabel = E('span', { key: 'complete', className: 'upload-indicator upload-indicator-complete' },
                                  E('span', { key: 'count', className: 'upload-indicator-count' }, `${this.props.completedUploads.size}`),
                                  E('span', { key: 'label', className: 'upload-indicator-label' }, ' Complete'))

                completedItem = E('span', { className: 'dropdown-item-text upload-completed-item' },
                                  E('span', { className: 'upload-completed-count' }, `${this.props.completedUploads.size}`),
                                  ' completed',
                                  E('a', { className: 'upload-select-completed',
                                           href: '#',
                                           onClick: (e) => { e.preventDefault(); this.props.selectCompleted(); } },
                                    'Select Completed'))
            }

            return E(DropdownButton, { defaultShow: true, key: 'ongoing-uploads', variant: 'outline-secondary',
                                       title: [ activeLabel, inactiveLabel, completeLabel ],
                                       as: ButtonGroup },
                     completedItem,
                     (completedItem && active.length > 0) ? E(Dropdown.Divider) : null,
                     active.map(this.renderOngoingUpload.bind(this)),
                     inactiveItem)
        } else
            return null
    }

    renderDefault() {
        var status = []
        var branding, shareLink, tabs, uploadItem, editAlbumsLink

        if ( typeof this.props.imgCount == 'number' )
            status.push(`${this.props.imgCount} images`)

        branding = E('a', { href: '#', key: 'brand', className: 'image-brand' },
                     E('img', { src: 'images/icon.svg' }),
                     E('span', { className: 'd-md-inline d-sm-none' }, 'Intrustd Photos'))
        shareLink = E(Switch, null,
                      E(Route, { path: '/album/:albumId',
                                 render: (thisProps) => {
                                     return E(NavLink, { onClick: () => this.props.onShare({ album: thisProps.match.params.albumId}),
                                                         key: 'share',
                                                         icon: 'share-alt',
                                                         text: 'Share this album' })
                                 } }),
                      E(Route, { path: '*',
                                 render: () => {
                                     return E(NavLink, { onClick: () => this.props.onShare('all'),
                                                         key: 'share',
                                                         icon: 'share-alt',
                                                         text: 'Share my photos' })
                                 }}))

        if ( this.props.perms.upload ) {
            var ongoingUploads = this.renderOngoingUploads()

            uploadItem = E(Nav.Item, null,
                           E(Form, { as: IntrustdForm, method: 'POST', encType: 'multipart/form-data',
                                     className: 'uk-navbar-item ph-upload ph-nav-icon',
                                     action: INTRUSTD_URL + "/upload", ref: this.uploadRef,
                                     onSubmit: (e) => { this.doUpload(e) }},
                             E('div', { className: 'btn-group ph-upload-btn-group',
                                        role: 'group',
                                        'aria-label': 'Uploads' },
                               E(UploadButton, { name: 'photo', elName: 'a',
                                                 className: 'ph-upload-btn btn btn-outline-secondary',
                                                 onUpload: (e) => { this.doUpload() } },
                                 E('span', {className: 'fa fa-upload'}),
                                 E('span', { className: 'd-xl-inline d-lg-none d-sm-inline' }, ' Upload')),
                               ongoingUploads
                              )))

        }

        if ( this.props.perms.createAlbums )
            editAlbumsLink = E(Route, { path: '/album/:albumId',
                                        render: ({match}) => {
                                            return E(NavLink, { as: Link, to: `/album/${match.params.albumId}/edit`,
                                                                key: 'edit-album',
                                                                icon: 'pencil',
                                                                text: 'Edit this Album' })
                                        } })


        if ( this.props.perms.gallery && this.props.perms.albums ) {
            tabs = E(Switch, null,
                     E(Route, { path: '/album',
                                render: () => renderTabs('album') }),
                     E(Route, { path: '*',
                                render: () => renderTabs('gallery') }))
        }

        const renderTabs = (activeKey) => {
            return E(Nav, { variant: 'underline',
                            activeKey },
                     E(Nav.Item, null,
                       E(Nav.Link, { eventKey: 'gallery', as: Link,
                                     to: '/' },
                         E('i', { className: 'fa fa-fw fa-th' }),
                         ' Gallery')),
                     E(Nav.Item, null,
                       E(Nav.Link, { eventKey: 'album', as: Link,
                                     to: '/album', },
                         E('i', { className: 'fa fa-fw fa-book' }),
                         ' Albums')))
        }

        return E('div', { className: 'container-fluid', key: 'main-nav' },
                 E(Navbar.Brand, null, branding),

                 tabs,

                 E(Nav.Item, { className: 'ml-auto justify-self-center flex-grow-1 ph-tags-searcher-container' },
                   E(Searcher, { onChange: this.props.onSearchChange,
                                 ref: this.searchRef })),

                 uploadItem,

                 shareLink,
                 E(Nav.Item, null,
                   E(PersonaButton, {})))
    }
}

const IntrustdNavbarWithRouter = withRouter(IntrustdNavbar)
export default IntrustdNavbarWithRouter
