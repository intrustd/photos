import React from 'react';

import Tooltip from 'react-bootstrap/Tooltip'

const E = React.createElement;
export function mkTooltip(title, opts) {
    return E(Tooltip, opts, title);
}

export function calcIdealImageSize(width, height) {
    var size = Math.ceil(Math.max(width, height))
    size = Math.max(100, Math.round(Math.pow(2, Math.ceil(Math.log(size)/Math.log(2)))))
    return size
}

export function takeAtMostFirst(array, count) {
    if ( array.length < count )
        return array
    else
        return array.slice(0, count - 1)
}

export class ErrorToast extends React.Component {
    render() {
        return this.props.children;
    }
}
