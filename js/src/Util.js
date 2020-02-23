import React from 'react';

import Tooltip from 'react-bootstrap/Tooltip'

const E = React.createElement;
export function mkTooltip(title, opts) {
    return E(Tooltip, opts, title);
}
