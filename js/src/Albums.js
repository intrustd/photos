import React from 'react';
import { findDOMNode } from 'react-dom';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';

import { INTRUSTD_URL } from './PhotoUrl.js';
import { ImageTile } from './ImageTile.js';
import Gallery from './Gallery.js';
import { ErrorToast } from './Util.js'

import uuidv4 from 'uuid/v4';

import { Set } from 'immutable';
import Moment from 'react-moment';
import { Link, withRouter } from 'react-router-dom';
import stringHash from 'string-hash';
import { mintToken } from 'intrustd';
import { Image, ImageHost, LoadingIndicator } from 'intrustd/src/react.js';
import arrayMove from 'array-move';

import Modal from 'react-bootstrap/Modal';
import ListGroup from 'react-bootstrap/ListGroup';
import Alert from 'react-bootstrap/Alert';
import FormControl from 'react-bootstrap/FormControl';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import CardDeck from 'react-bootstrap/CardDeck';
import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import { toast } from 'react-toastify';

import './Albums.scss';

const E = React.createElement;

const MAX_IMAGE_PREVIEW = 3
const IMAGE_PREVIEW_SIZE = 64

class AlbumToolbar extends React.Component {
    constructor() {
        super()
        this.state = {}
    }

    render() {
        return E(Navbar, { collapseOnSelect: true, expand: 'lg',
                           bg: 'light', variant: 'light', 'static': 'top',
                           className: 'album-navbar' },
                 E(Navbar.Brand, null,
                   E(Link, { to: `/album/${this.props.albumId}` },
                     E('i', { className: 'fa fa-fw fa-arrow-left'}),
                     ' Finish Editing')),
                 E(Nav.Link, { className: 'ml-auto',
                               onClick: this.props.onAddText.bind(this) },
                   E('i', { className: 'fa fa-fw fa-quote-left'}),
                   ' Add Text'),
                 E(Nav.Link, { onClick: this.props.onAddImage.bind(this) },
                   E('i', { className: 'fa fa-fw fa-image'}),
                   ' Add Image'))
    }
}

class AlbumToast extends React.Component {
    render() {
        return [ E('p', { className: 'toast-content' },
                   'Added ',
                   E('span', { className: 'added-photo-count' }, `${this.props.photoCount}`),
                   ' to ',
                   E('span', { className: 'album-name' }, this.props.name)),

                 E('div', { className: 'toast-action' },
                   E(Link, {to: `/album/${this.props.albumId}`},
                     'View Album')) ]
    }
}

class AddToAlbumModalImpl extends React.Component {
    constructor() {
        super()
        this.albumNameRef = React.createRef()
        this.state = { albums: [] }
    }

    componentDidMount() {
        fetch(`${INTRUSTD_URL}/albums`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((albums) => { this.setState({albums}) })
                } else
                    this.setState({error: "Could not fetch albums" })
            })
    }

    mkContent() {
        return this.props.images.map((imageId) => { return { photo: imageId } })
    }

    popupNotification(name, albumId) {
        toast(E(AlbumToast, { name, albumId, photoCount: this.props.images.length }))
    }

    onNewAlbum() {
        if ( this.albumNameRef.current ) {
            var albumInfo = { name: this.albumNameRef.current.value,
                              content: this.mkContent() }

            fetch(`${INTRUSTD_URL}/albums/`,
                  { method: 'POST',
                    headers: { 'Content-type': 'application/json' },
                    body: JSON.stringify(albumInfo) })
                .then((r) => {
                    if ( r.ok ) {
                        return r.json().then(({id}) => {
                            var { history }  = this.props

                            this.popupNotification(name, id)
                            this.props.onDone()
                        })
                    } else {
                        return r.text().then((message) => { this.setState({error: `Could not create album: ${message}`}) })
                    }
                }).catch((e) => {
                    this.setState({error: "Error creating album"})
                })
        }
    }

    chooseAlbum(albumId, albumTitle) {
        this.props.photos.album(albumId)
            .then((model) => {
                return model.addToAlbum(this.mkContent())
            }).then(() => {
                var { history } = this.props
                this.popupNotification(albumTitle, albumId)
                this.props.onDone()
            }).catch((e) => {
                console.error('Could not add photos to album', e)
                this.setState({error: `Error adding items: ${e}`})
            })
    }

    render() {
        var previewImages = this.props.images.slice(0, MAX_IMAGE_PREVIEW);

        var extraCount = this.props.images.length - MAX_IMAGE_PREVIEW
        var error, body

        if ( this.state.error )
            error = E(Alert, { variant: 'danger' }, this.state.error)

        if ( this.state.newAlbum ) {
            body = E(Form, { className: 'w-100', onSubmit: this.onNewAlbum.bind(this) },
                     E(FormControl, { className: 'w-100', type: 'text', ref: this.albumNameRef,
                                      placeholder: 'New Album', autoFocus: true }),
                     E(Button, { type: 'submit', variant: 'primary' }, 'Create'))
        } else {
            body = E(ListGroup, { className: 'album-list w-100', key: 'album-list' },
                     E(ListGroup.Item, { onClick: () => { this.setState({newAlbum: true}) } },
                       E('i', { className: 'fa fa-fw fa-plus', }), ' New Album'),
                     this.state.albums.map((album) => {
                         return E(ListGroup.Item, { onClick: () => { this.chooseAlbum(album.id, album.name) } }, album.name)
                     }))
        }

        return E(Modal, { centered: true, show: true,
                          onHide: this.props.onDone },
                 E(Modal.Header, { closeButton: true },
                   E(Modal.Title, null, 'Add to Album')),
                 E(Modal.Body, null,
                   error,
                   E('ul', { className: 'image-list' },
                     previewImages.map((img) => {
                         return E('li', { className: 'image-preview', key: img },
                                  E(Image, { src: `${INTRUSTD_URL}/image/${img}?size=${IMAGE_PREVIEW_SIZE}`}))
                     }),
                     extraCount > 0 ? E('li', { className: 'image-preview-more' },
                                        `+ ${extraCount}`) : null),
                   E(ReactCSSTransitionGroup, { component: 'div',
                                                className: 'd-flex flex-row overflow-hidden',
                                                transitionName: 'slide-left',
                                                transitionEnterTimeout: 200,
                                                transitionLeaveTimeout: 200 }, body)
                  ))
    }
}

export const AddToAlbumModal = withRouter(AddToAlbumModalImpl)


class AlbumImpl extends React.Component {
    constructor() {
        super()
        this.unsubscribe = () => { }
        this.galleryRef = React.createRef()
        this.state = { loading: true, selected: Set() }
    }

    get isAlbum() {
        return true
    }

    get albumId() {
        return this.props.albumId
    }

    get gallery() {
        return this.galleryRef.current
    }

    updateSelection(add, remove) {
        if ( remove === undefined )
            remove = Set()

        if ( !(add instanceof Set) )
            add = Set(add)

        if ( !(remove instanceof Set) )
            remove = Set(remove)

        this.setState({selected: selected.union(add).subtract(remove)})
    }

    parseContent(content) {
        var curItem = null, items = [], nextItemId = 'start'

        var nextItem = () => {
            if ( curItem ) {
                items.push(curItem)
            }

            if ( !curItem.id )
                curItem.id = nextItemId

            nextItemId = `after-${curItem.id}`
            curItem = null
        }

        content.map((item, itemIndex) => {
            if ( item.photo ) {
                if ( !curItem )
                    curItem = { gallery: [] }
                else if ( !curItem.gallery ) {
                    nextItem()
                    curItem = { gallery: [] }
                }

                curItem.gallery.push(Object.assign({ src: item.photo.id, key: item.photo.id,
                                                     itemId: item.id,
                                                     album: this, itemIndex }, item.photo))
            } else if ( item.text ) {
                nextItem()
                curItem = Object.assign({itemIndex}, item)
            }
        });

        nextItem()

        return items
    }

    componentDidMount() {
        this.onAlbumIdChanged()
    }

    componentWillUpdate(oldProps) {
        if ( oldProps.albumId != this.props.albumId ) {
            this.unsubscribe()
            this.onAlbumIdChanged()
        }
    }

    onAlbumIdChanged() {
        this.setState({ gallery: undefined, error: undefined, loading: true,
                        images: null })
        this.props.photos.album(this.props.albumId)
            .then((gallery) => {
                console.log("Loaded album", gallery)
                if ( gallery === null ) {
                    this.setState({loading: false,
                                   error: "Album does not exist"})
                } else {
                    this.setState({loading: false,
                                   description: gallery.description,
                                   gallery})
                }
            })
            .catch((e) => {
                console.error("Could not load gallery", e)
                this.setState({loading: false, error: `Could not load gallery: ${e}`})
            })
    }

    reorder(oldIndex, newIndex) {
        if ( oldIndex == newIndex ) return;

        var originalContent = [ ...this.state.originalContent ],
            newContent = arrayMove(this.state.originalContent, oldIndex, newIndex)

        var moveWhat = this.state.originalContent[oldIndex],
            movePromise,
            reqData
        reqData = { method: 'PUT',
                    body: JSON.stringify({id: moveWhat.id}),
                    headers: { 'Content-type': 'application/json' } }

        if ( newIndex == (this.state.originalContent.length - 1) ) {
            // Move to end
            movePromise = fetch(`${INTRUSTD_URL}/albums/${this.props.albumId}/end`, reqData)

        } else {
            var moveBefore = this.state.originalContent[newIndex]
            movePromise = fetch(`${INTRUSTD_URL}/albums/${this.props.albumId}/${moveBefore.id}/before`,
                                reqData)
        }

        movePromise.then((r) => {
            if ( r.ok ) {
                return r.json().then(() => {
                })
            } else {
                return Promise.fail(`Invalid status: ${r.status}`)
            }
        }).catch((e) => {
            this.setContent(originalContent)
            this.popupAlert("An error occured")
        })

        this.setContent(newContent)
    }

    setContent(newContent) {
        this.setState({originalContent: newContent, content: this.parseContent(newContent)})
    }

    popupAlert(alertMsg) {
        alert(alertMsg)
    }

    chooseNewId() {
        return uuidv4();
    }

    addText() {
        var gallery = this.galleryRef.current
        if ( gallery == null || !this.state.gallery )
            return

        var { minY, maxY } = gallery._getScrollBounds()
        var textId = this.state.gallery.addTextAround((minY + maxY)/2)
        this.setState({editingText: textId})
    }

    updateItemProps(textIdx, props) {
        var item = this.state.originalContent[textIdx]
        if ( item.id )
            delete props.id

        var newContent = [ ...this.state.originalContent ]
        newContent.splice(textIdx, 1, Object.assign({}, props, item))

        this.setContent(newContent)
    }

    addImage() {
    }

    onShare() {
        alert("TODO onShare album")
    }

    onNameChange(e) {
        var newName = e.target.value
        if ( newName != this.state.description.name ) {
            this.state.gallery.setName(newName)
                .catch((error) => {
                    toast.error(E(ErrorToast, null, 'Could not set album name'))
                })
                .finally(() => {
                    this.setState({description:this.state.gallery.description})
                })
        }
    }

    render() {
        if ( this.state.loading ) {
            return E(LoadingIndicator)
        } else if ( this.state.error ) {
            return E(Alert, { variant: 'danger' },
                     this.state.error)
        } else {
            var albumEditingClass = '', albumDraggingClass='', albumToolbar
            var header

            if ( this.props.editing ) {
                albumEditingClass = 'album--editing'
                albumToolbar = E(AlbumToolbar, { albumId: this.props.albumId,
                                                 onAddText: this.addText.bind(this),
                                                 onAddImage: this.addImage.bind(this) });
                header = E('input', { className: 'form-control h1', type: 'text', defaultValue: this.state.description.name,
                                      onKeyDown: (e) => { if ( e.key == 'Enter' ) { this.onNameChange(e); } },
                                      onBlur: this.onNameChange.bind(this) })
            } else
                header = E('h1', { className: 'album-title' }, this.state.description.name)

            if ( this.state.dragging )
                albumDraggingClass = 'album--dragging'

            return [ albumToolbar,
                     E('div', { className: `album ${albumEditingClass} ${albumDraggingClass}`,
                                key: 'album-content' },
                       E('header', null,
                         E(Nav, { className: `album-actions ${this.props.editing ? 'album-actions--editing': ''}` },
                           E(Nav.Link, { as: Link,
                                         to: `/album/${this.props.albumId}/edit` },
                             E('i', { className: 'fa fa-fw fa-edit' }),
                             ' Edit Album')),
                         header,
                         E('address', { className: 'album-info' },
                           E(Moment, {format: 'YYYY-MM-DD'}, this.state.description.created))),
                       E(Gallery, { ref: this.galleryRef,
                                    match: this.props.match,
                                    history: this.props.history,
                                    location: this.props.location,
                                    perms: this.props.perms,
                                    model: this.state.gallery,
                                    parentRoute: `/album/${this.props.albumId}${this.props.editing ? '/edit': ''}`,
                                    allowDrag: this.props.editing,
                                    enableSlideshow: !this.props.editing,
                                    allowTextEdit: this.props.editing,
                                    onShare: this.onShare.bind(this),
                                    selectedTags: this.props.selectedTags,
                                    selectTag: this.props.selectTag,
                                    onSelectionChanged: this.props.onSelectionChanged,
                                    onDownload: this.props.onDownolad })) ]

//                       E(AlbumContent, { dragging: this.state.dragging,
//                                         content: this.state.content,
//                                         editing: this.props.editing,
//                                         axis: "xy",
//                                         editingIndex: this.state.editingIndex,
//                                         onTextChange: this.onTextChange.bind(this),
//                                         onStartEdit: (idx) => { this.setState({editingIndex: idx}) },
//                                         onSortStart: () => { this.setState({dragging: true}) },
//                                         onSortEnd: ({oldIndex, newIndex}) => { this.setState({dragging: false}); this.reorder(oldIndex, newIndex); } })) ]
        }
    }
}

export const Album = withRouter(AlbumImpl)

class AlbumsImpl extends React.Component {
    constructor() {
        super()

        this.state = { loading: true };
    }

    componentDidMount() {
        fetch(`${INTRUSTD_URL}/albums`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((albums) => {
                        this.setState({loading: false, albums})
                    })
                } else
                    this.setState({loading: false, error: "Could not fetch albums"})
            })
            .catch(() => {
                this.setState({loading: false, error: "Could not fetch albums"})
            })
    }

    render() {
        if ( this.state.loading ) {
            return E(LoadingIndicator)
        } else if ( this.state.error ) {
            return E(Alert, { variant: 'danger' }, this.state.error)
        } else {
            var addAlbumCard =
                E(Card, { key: 'add-album' },
                  E(Card.Body, null,
                    'Add album'))

            return E(CardDeck, null,
                     addAlbumCard,
                     this.state.albums.map((album) => {
                         return E(Card, { key: `card-album-${album.id}`,
                                          className: 'album-card',
                                          onClick: () => {
                                              this.props.history.push(`/album/${album.id}`)
                                          }},
                                  E(Card.Img, { variant: 'top' }),
                                  E(Card.Body, null,
                                    E(Card.Title, null, album.name),
                                    E(Card.Text, null, `${album.summary.imageCount} photos`)))
                     }))
        }
    }
}

export const Albums = withRouter(AlbumsImpl)
