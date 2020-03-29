import React from 'react';

import Slideshow from './Slideshow.js';
import { GroupList } from './Groups.js';

import { mintToken } from 'intrustd';
import { LoadingIndicator } from 'intrustd/src/react.js';
import { INTRUSTD_URL, makeAbsoluteUrl } from './PhotoUrl.js';

import { Route, Link, withRouter, Switch } from 'react-router-dom';
import Moment from 'react-moment';
import moment from 'moment';
import chrono from 'chrono-node';
import Calendar from 'react-calendar';

import Nav from 'react-bootstrap/Nav';
import InputGroup from 'react-bootstrap/InputGroup';
import Form from 'react-bootstrap/Form';
import FormControl from 'react-bootstrap/FormControl';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Select, { components as SelectComponents } from 'react-select';

const E = React.createElement;

import 'react-calendar/dist/Calendar.css';

function mkDateOption(date, now) {
    date.startOf('day')
    return { value: date, date,
             label: `${date.from(now)} (${date.format('L')})` }
}

function mkOptions(query, curDate) {
    const now = moment()
    var dateOptions = [], queriedDate
    var basicOptions = [ mkDateOption(moment(now).add(1, 'day'), now),
                         mkDateOption(moment(now).add(1, 'week'), now),
                         mkDateOption(moment(now).add(1, 'month'), now),
                         mkDateOption(moment(now).add(1, 'year'), now) ]

    if ( query !== undefined ) {
        queriedDate = chrono.parseDate(query, now.toDate())
        if ( queriedDate !== null ) {
            dateOptions.push(mkDateOption(moment(queriedDate), now))
        }
    }

    if ( curDate !== undefined ) {
        if ( !isDateSelected(curDate, dateOptions) )
            dateOptions.push(curDate)
    }

    return [ ...dateOptions,
             { value: 'never', label: 'Never' },
             ...basicOptions,
             { calendar: true,
               bestGuess: queriedDate,
               curValue: curDate } ]
}

function isDateSelected(o, selected) {
    return selected.some((v) => {
        if ( o.value == 'never' )
            return v.value == 'never';
        else if ( o.calendar )
            return false
        else {
            console.log("Check is same", o.date, v.date, o.date.isSame(v.date))
            return v.date !== undefined && o.date.isSame(v.date);
        }
    })
}

const ExpiryOption = (props) => {
    const { data } = props

    if ( data.calendar ) {
        var value = new Date()

        if ( data.bestGuess )
            value = data.bestGuess.toDate()

        if ( data.curValue ) {
            if ( data.curValue.value != 'never' )
                value = data.curValue.value.toDate()
        }

        return E(Calendar, { value,
                             minDate: new Date(),
                             calendarType: 'US',
                             onChange: (v) => {
                                 props.setValue(mkDateOption(moment(v), moment()), 'set-value')
                             }})
    } else
        return E(SelectComponents.Option, props)
}

export class ExpirySelector extends React.Component {
    constructor() {
        super()
        this.state = { options: mkOptions() }
        this.state.selection = this.state.options[0]
    }

    handleInputChange(value) {
        this.setState({options: mkOptions(value, this.state.selection)})
    }

    setValue(v) {
        if ( this.props.onChange )
            this.props.onChange(v)

        this.setState({selection: v,
                       options: mkOptions(null, v)})
    }

    render() {
        return E(Form.Group, null,
                 E(Form.Label, null, 'Expires'),
                 E(Select, { components: { Option: ExpiryOption },
                             isMulti: false,
                             options: this.state.options,
                             isOptionSelected: isDateSelected,
                             onInputChange: this.handleInputChange.bind(this),
                             onChange: this.setValue.bind(this),
                             value: this.state.selection }))
    }
}

export class SharingModal extends React.Component {
    constructor() {
        super()
        this.expiryRef = React.createRef()
        this.guestUploadsRef = React.createRef()
        this.state = { tab: 'link', guestUploads: false, expiry: 'never' }
    }

    componentDidMount() {
    }

    mkSharingLink() {
        var promise
        if ( this.props.sharingWhat == 'all' ) {
            promise = this.shareAll()
        } else if ( this.props.sharingWhat.album ) {
            promise = this.shareAlbum(this.props.sharingWhat.album)
        } else
            promise = this.share(this.props.sharingWhat.photos)

        this.setState({loading: true, error: undefined})
        promise.then((link) => {
            this.setState({sharingLink: link, loading: false})
        }).catch((e) => {
            this.setState({error: e, loading: false})
        })
    }

    commonPerms() {
        var perms = [ 'intrustd+perm://admin.intrustd.com/guest' ]

        if ( this.state.guestUploads ) {
            if ( this.props.sharingWhat.album ) {
                perms.push(`intrustd+perm://photos.intrustd.com/albums/${this.props.sharingWhat.album}/upload/guest`)
            } else
                perms.push('intrustd+perm://photos.intrustd.com/upload/guest')
        }

        return perms
    }

    tokenOptions() {
        var opts = { format: 'query' }

        if ( this.expiry != 'never' ) {
            var now = moment()
            opts.ttl = this.expiry.diff(now, 'seconds')
        }

        return opts
    }

    shareAlbum(albumId) {
        return mintToken([ `intrustd+perm://photos.intrustd.com/albums/${albumId}/view`,
                           ...this.commonPerms()],
                         this.tokenOptions())
            .then((tok) => makeAbsoluteUrl(`#/album/${albumId}`, tok))
            .catch((e) => this.onTokenError.bind(this))
    }

    shareAll() {
        return mintToken([ 'intrustd+perm://photos.intrustd.com/gallery',
                           'intrustd+perm://photos.intrustd.com/view',
                           ...this.commonPerms() ],
                         this.tokenOptions())
            .then((tok) => makeAbsoluteUrl('#/', tok))
            .catch((e) => this.onTokenError.bind(this))
    }

    share(which) {
        var perms = [ ...this.commonPerms(),
                      ...which.map((img) => `intrustd+perm://photos.intrustd.com/view/${img}`) ]

        perms.push('intrustd+perm://photos.intrustd.com/gallery')

        return mintToken(perms,  this.tokenOptions())
            .then((tok) => makeAbsoluteUrl('#/', tok))
            .catch((e) => this.onTokenError.bind(this))
    }

    onTokenError(e) {
        this.setState({error: `Error creating token: ${e}`, loading: false})
    }

    get title() {
        if ( this.props.sharingWhat == 'all' )
            return 'Share All Photos';
        else if ( this.props.sharingWhat.album )
            return 'Share Album'
        else if ( this.props.sharingWhat.photos )
            return 'Share Photos'
    }

    goToTab(tab) {
        this.setState({tab, expiry: 'never', guestUploads: false})
    }

    renderLinkBox() {
        return E(InputGroup, {className: 'mb-3 mt-3'},
                 E(InputGroup.Prepend, { id: 'make-link' },
                   E(Button, { variant: 'primary',
                               onClick: this.mkSharingLink.bind(this) },
                     this.state.loading ? E(LoadingIndicator) : [
                         E('i', { className: 'fa fa-fw fa-link' }),
                         ' Make Link'])),
                 E(FormControl, { 'aria-describedby': 'copy-link',
                                  defaultValue: this.state.sharingLink ? this.state.sharingLink : '',
                                  readOnly: true }),
                 E(InputGroup.Append, { id: 'copy-link' },
                   E(Button, {variant: this.state.sharingLink ? 'primary' : 'secondary' }, 'Copy')))
    }

    setGuestUploads(e) {
        this.setState({guestUploads: e.target.checked, sharingLink: undefined})
    }

    setExpiry(e) {
        this.setState({expiry: e.value, sharingLink: undefined })
    }

    get whatIsBeingShared() {
        if ( this.props.sharingWhat == 'all' )
            return 'any of your photos, including ones you post in the future,';
        else if ( this.props.sharingWhat.album )
            return 'this album, including photos you add to it in the future,';
        else if ( this.props.sharingWhat.photos && this.props.sharingWhat.photos.length == 1 )
            return 'just this photo';
        else if ( this.props.sharingWhat.photos )
            return `just these ${this.props.sharingWhat.photos.length} photos`;
        else {
            console.error("Invalid sharing spec", this.props.sharingWhat)
            return 'some stuff'
        }
    }

    get expiry() {
        if ( this.state.expiry == 'never' ||
             this.state.expiry === undefined ||
             this.state.expiry === null )
            return 'never'
        else
            return this.state.expiry
    }

    get whatCanTheyDo() {
        var expiry, uploads

        if ( this.expiry ) {
            expiry = E('span', { className: 'expiry' }, ' forever')
        } else {
            expiry = [ ' until ',
                       E(Moment, { className: 'expiry', date: this.state.expiry, format: 'LLLL' },) ]
        }

        if ( this.state.guestUploads ) {
            var uploadWhere

            if ( this.props.sharingWhat.album ) {
                uploadWhere = ' to this album';
            }

            uploads = [ ' and ',
                        E('span', { className: 'what-is-being-shared' }, 'upload photos', uploadWhere ) ]
        }

        return [ 'view ',
                 E('span', { className: 'what-is-being-shared' }, this.whatIsBeingShared),
                 uploads,
                 expiry ]
    }

    renderError() {
        if ( this.state.error ) {
            return E(Alert, { variant: 'danger',
                              onClose: () => { this.setState({error: undefined}) },
                              dismissible: true },
                     `${this.state.error}`)
        } else
            return null
    }

    guestUploadBox() {
        return E(Form.Check, { type: 'switch', id: 'allow-guest-uploads',
                               checked: this.state.guestUploads,
                               onChange: this.setGuestUploads.bind(this),
                               ref: this.guestUploadsRef,
                               label: 'Allow Guest Uploads' })
    }

    expirySelector() {
        return E(ExpirySelector, { ref: this.expiryRef,
                                   onChange: this.setExpiry.bind(this) })
    }

    options() {
        return E(Form, null,
                 this.guestUploadBox(),
                 this.expirySelector())
    }

    renderLinkTab() {
        return [ this.renderError(),

                 this.renderLinkBox(),

                 E('p', null,
                   'Anyone with this link can ',
                   E('span', { className: 'what-can-they-do' }, this.whatCanTheyDo)),

                 E('hr'),
                 E('h6', { className: 'font-weight-bold text-uppercase' }, 'Options'),

                 this.options()
               ]
    }

    renderGroupTab() {
        return [ this.renderError(),

                 E('p', null,
                   'Allow anyone in this group to ',
                   E('span', { className: 'what-can-they-do' }, this.whatCanTheyDo)),

                 E('hr'),

                 E(GroupList, { allowAdd: true }),

                 E('hr'),
                 E('h6', { className: 'font-weight-bold text-uppercase' }, 'Options'),
                 this.options()

//                 E(GroupList, { allowAdd: true })
               ]
    }

    render() {
        var body, navbar

        navbar = E(Nav, { variant: 'underline', className: 'flex-row w-100',
                          activeKey: this.state.tab },
                   E(Nav.Item, {className: 'flex-grow-1' },
                     E(Nav.Link, { eventKey: 'link',
                                   onClick: this.goToTab.bind(this, 'link') },
                       E('i', { className: 'fa fa-fw fa-link' }),
                       ' Shareable Link')),
                   E(Nav.Item, {className: 'flex-grow-1'},
                     E(Nav.Link, { eventKey: 'group',
                                   onClick: this.goToTab.bind(this, 'group') },
                       E('i', { className: 'fa fa-fw fa-users' }),
                       '  Share With Group')))

        if ( this.state.tab == 'link' ) {
            body = this.renderLinkTab()
        } else if ( this.state.tab == 'group' ) {
            body = this.renderGroupTab()
        }

        return E(Modal, { centered: true, show: true,
                          onHide: this.props.onDone },
                 E(Modal.Header, { closeButton: true },
                   E(Modal.Title, null, this.title)),
                 E(Modal.Body, null,
                   navbar,
                   body))
    }
}
