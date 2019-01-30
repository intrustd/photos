import React from 'react';

import Navbar from './Navbar.js';
import { INTRUSTD_URL } from './PhotoUrl.js';

import { Image } from 'intrustd-js/src/react.js';
import { Link } from 'react-router-dom';

import './Albums.scss';

const E = React.createElement;
class AlbumIcon extends React.Component {
    render () {
        return E('div', {className: 'ph-album-card uk-card uk-card-default uk-width-auto uk-card-body'},
                 E(Link, {to: `/albums/${this.props.album.id}`},
                   E('h3', {className: 'uk-card-title'}, this.props.album.name)),
                 E('p', {}, 'An album'))
    }
}

export default class Albums extends React.Component {
    constructor () {
        super()

        this.state = {}
        this.state.albums = []
    }

    render() {
        return E('div', { className: 'uk-flex uk-flex-wrap' },
                 this.state.albums.map((album) => {
                     return E(AlbumIcon, { album: album })
                 }));
    }

    componentDidMount() {
        console.log("on create")
        fetch(INTRUSTD_URL + '/albums',
              { method: 'GET' })
            .then((res) => res.json())
            .then((result) => this.setState({albums: result}))
    }

//        view: () => {
//            console.log('albums', albums)
//            return [ m(Navbar),
//                     m(Image, {src: INTRUSTD_URL + '/image' }),
//                     m("div.albums.uk-flex.uk-flex-wrap",
//                       albums.map((album) => {
//                           return m(AlbumIcon, album)
//                       }))
//                   ]
//        }
//    }
}
