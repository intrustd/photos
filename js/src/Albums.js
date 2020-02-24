import React from 'react';
import { findDOMNode } from 'react-dom';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';

import { INTRUSTD_URL } from './PhotoUrl.js';
import { ImageTile } from './ImageTile.js';

import uuidv4 from 'uuid/v4';

import Moment from 'react-moment';
import MediumEditor from 'react-medium-editor';
import { Link, withRouter } from 'react-router-dom';
import stringHash from 'string-hash';
import { mintToken } from 'intrustd';
import { Image, ImageHost, LoadingIndicator } from 'intrustd/src/react.js';
import { sortableContainer, sortableElement } from 'react-sortable-hoc';
import reactGallery from 'react-photo-gallery';
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

import 'medium-editor/dist/css/medium-editor.css';
import 'medium-editor/dist/css/themes/default.css';

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
                           bg: 'light', variant: 'light', fixed: 'top',
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

    onNewAlbum() {
        if ( this.albumNameRef.current ) {
            var albumInfo = { name: this.albumNameRef.current.value,
                              content: this.props.images.map((imageId) => { return { photo: imageId } }) }

            fetch(`${INTRUSTD_URL}/albums/`,
                  { method: 'POST',
                    headers: { 'Content-type': 'application/json' },
                    body: JSON.stringify(albumInfo) })
                .then((r) => {
                    if ( r.ok ) {
                        return r.json().then(({id}) => {
                            var { history }  = this.props

                            history.push(`/album/${id}`)
                            this.props.onDone()
                        })
                    } else {
                        return r.text().then((message) => { this.setState({error: `Could not create album: ${message}`}) })
                            .catch(() => { this.setState({error: "Could not create album" }) })
                    }
                })
        }
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
                         return E(ListGroup.Item, { onClick: () => { this.selectItem(album.id) } }, album.name)
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

const SortableImageTile = sortableElement(ImageTile)
const ImageTileClosure = ({photo, index, margin}) => {
    var album = photo.album, onImageDragStart, onImageDragEnd, style, className

    if ( album.state.dragging ) {
        className = 'ph-album-image-dragging'
    }

    return E(SortableImageTile,
             { key: photo.id, margin,
               disabled: !album.props.editing,
               photo, index: photo.itemIndex,
               galleryNode: photo.galleryRef,
               selectedTags: album.props.selectedTags,
               selectTag: album.props.selectTag,
               selected: album.props.selected.contains(photo.id),
               showOverlay: !album.props.editing,
               className, onImageDragStart, onImageDragEnd,
               imgStyle: style,
               onSelect: () => { alert("TODO") },
               onShare: () => { alert("TODO") },
               onActivated: () => {
                   console.error("TODO")
               },
               onDescriptionSet: (newDesc, tags) => {
                   console.error("TODO onDescriptionSet")
               } })
}

class AlbumGalleryImpl extends React.Component {
    constructor() {
        super()
        this.state = { }
    }

    render() {
        return E(reactGallery, { photos: this.props.gallery,
                                 margin: 2,
                                 ImageComponent: ImageTileClosure })

    }
}

const AlbumGallery = withRouter(AlbumGalleryImpl)

class AlbumTextImpl extends React.Component {
    constructor() {
        super()
        this.state = { }
        this.mainRef = React.createRef()
    }

    componentDidMount() {
        if ( this.props.editing )
            this.startEdit()
    }

    componentDidUpdate(prevProps) {
        if ( !prevProps.editing && this.props.editing ) {
            this.startEdit()
        }
    }

    startEdit() {
        var mainEditor = this.mainRef.current
        var node = findDOMNode(mainEditor)
        node.scrollIntoView()
        node.focus()

        mainEditor.medium.subscribe("blur", this.onBlur.bind(this))
    }

    onBlur() {
        if ( this.state.unsavedChanges )
            this.props.onChange(this.state.unsavedChanges)
        this.setState({unsavedChanges: undefined})
    }

    onChange(newContent) {
        this.setState({unsavedChanges: newContent})
    }

    render() {
        if ( this.props.editing ) {
            return E(MediumEditor, { tag: 'p', ref: this.mainRef,
                                     text: this.props.text,
                                     className: 'album-text album-text--editing',
                                     onChange: this.onChange.bind(this),
                                     options: {
                                         cleanPastedHTML: true,
                                         toolbar: { buttons: [ 'bold', 'italic', 'underline' ] }
                                     } })
        } else {
            return E('p', { ref: this.mainRef, className: 'album-text',
                            onClick: this.props.onStartEdit.bind(this) },
                     this.props.text)
        }
    }
}

const AlbumText = withRouter(AlbumTextImpl)

const SortableAlbumText = sortableElement((props) => {
    return E(AlbumText, props)
})

const AlbumContent = sortableContainer(({dragging, content, editingIndex, onTextChange, onStartEdit, editing}) => {
    return E('div', { className: 'album-content' },
             content.map((c) => {
                 if ( c.gallery ) {
                     return E(AlbumGallery, { key: c.id, dragging,
                                              gallery: c.gallery })
                 } else if ( c.text ) {
                     return E(SortableAlbumText, { key: c.id, dragging,
                                                   text: c.text,
                                                   index: c.itemIndex,
                                                   editing: editingIndex == c.itemIndex,
                                                   disabled: !editing,
                                                   onChange: (newContent) => {
                                                       onTextChange(c.itemIndex, newContent)
                                                   },
                                                   onStartEdit: () => {
                                                       if ( editing )
                                                           onStartEdit(c.itemIndex)
                                                   }})
                 } else
                     return E('span', { key: c.id })
             }))
})

class AlbumImpl extends React.Component {
    constructor() {
        super()
        this.state = { loading: true }
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
        fetch(`${INTRUSTD_URL}/albums/${this.props.albumId}`)
            .then((r) => {
                if ( r.ok ) {
                    return r.json().then((description) => {
                        this.setContent(description.content)
                        this.setState({loading: false, description})
                    }).catch(() => {
                        this.setState({loading: false, error: "Could not decode response"})
                    })
                } else if ( r.status == 404 ) {
                    this.setState({loading: false, error: "Album does not exist"})
                } else {
                    this.setState({loading: false, error: `Could not get album: ${r.status}`})
                }
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
        var newText = { text: "New Text" }
        this.addUnsavedItem(newText)
    }

    onTextChange(textIdx, newContent) {
        var text = this.state.originalContent[textIdx], changePromise
        if ( text.text === undefined )
            return

        this.updateItemProps(textIdx, {text: newContent})
        this.setState({editingIndex: undefined })

        if ( text.id ) {
            changePromise = fetch(`${INTRUSTD_URL}/albums/${this.props.albumId}/${text.id}`,
                                  { method: 'PUT',
                                    headers: { 'Content-type': 'application/json' },
                                    body: JSON.stringify({text: newContent}) })
        } else {
            changePromise = fetch(`${INTRUSTD_URL}/albums/${this.props.albumId}/end`,
                                  { method: 'POST',
                                    headers: { 'Content-type': 'application/json' },
                                    body: JSON.stringify({text: newContent}) })
        }

        changePromise.then((r) => {
            if ( r.ok ) {
                if ( text.id ) {
                    return r.json().then(({id}) => {
                        this.updateItemProps(textIdx, {id})
                    })
                }
            } else
                r.text().then((msg) => { this.popupAlert(`Could not change text: Bad Status: ${r.status} ${msg}`) })
        }).catch((e) => {
            this.popupAlert("Could not change text")
        })
    }

    updateItemProps(textIdx, props) {
        var item = this.state.originalContent[textIdx]
        if ( item.id )
            delete props.id

        var newContent = [ ...this.state.originalContent ]
        newContent.splice(textIdx, 1, Object.assign({}, props, item))

        this.setContent(newContent)
    }

    addUnsavedItem(item, index) {
        var newContent = [ ...this.state.originalContent ], itemIndex

        item = Object.assign({}, item)

        if ( index === undefined ) {
            itemIndex = newContent.length
            newContent.push(item)
        } else {
            itemIndex = index
            newContent.splice(index, 0, item)
        }

        item.itemIndex = itemIndex

        this.setState({originalContent: newContent,
                       content: this.parseContent(newContent),
                       editingIndex: itemIndex })
    }

    addImage() {
    }

    render() {
        if ( this.state.loading ) {
            return E(LoadingIndicator)
        } else if ( this.state.error ) {
            return E(Alert, { variant: 'danger' },
                     this.state.error)
        } else {
            var albumEditingClass = '', albumDraggingClass='', albumToolbar

            if ( this.props.editing ) {
                albumEditingClass = 'album--editing'
                albumToolbar = E(AlbumToolbar, { albumId: this.props.albumId,
                                                 onAddText: this.addText.bind(this),
                                                 onAddImage: this.addImage.bind(this) });
            }

            if ( this.state.dragging )
                albumDraggingClass = 'album--dragging'

            return [ albumToolbar,
                     E('div', { className: `album ${albumEditingClass} ${albumDraggingClass}`,
                                key: 'album-content' },
                       E('h1', { className: 'album-title' }, this.state.description.name),
                       E('address', { className: 'album-info' },
                         E(Moment, {format: 'YYYY-MM-DD'}, this.state.description.created)),
                       E(AlbumContent, { dragging: this.state.dragging,
                                         content: this.state.content,
                                         editing: this.props.editing,
                                         axis: "xy",
                                         editingIndex: this.state.editingIndex,
                                         onTextChange: this.onTextChange.bind(this),
                                         onStartEdit: (idx) => { this.setState({editingIndex: idx}) },
                                         onSortStart: () => { this.setState({dragging: true}) },
                                         onSortEnd: ({oldIndex, newIndex}) => { this.setState({dragging: false}); this.reorder(oldIndex, newIndex); } })) ]
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
