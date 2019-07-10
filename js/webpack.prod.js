const merge = require('webpack-merge')
const common = require('./webpack.common.js')
const webpack = require('webpack')

module.exports = merge(common, {
    mode: 'production',
    plugins: [
        new webpack.DefinePlugin({ HOSTED_MITM: JSON.stringify('https://photos.intrustd.com/mitm.html') })
    ]
})
