const HtmlWebpackPlugin = require('html-webpack-plugin')
const RewriteImportPlugin = require('less-plugin-rewrite-import')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const ClosureCompilerPlugin = require('webpack-closure-compiler')

const path = require('path')
const ROOT_DIR = path.resolve(__dirname)
const SRC_DIR = path.resolve(__dirname, 'app')
const BUILD_DIR = path.resolve(__dirname, 'build')
const NODE_MODULES_DIR = path.resolve(__dirname, 'node_modules')

module.exports = {
    entry: {
        index: './src/Photo.js',
        sw: './src/sw.js'
    },
    output: {
        filename: './[name].js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['env']
                    }
                }
            },
            {
                test: /\.less$/,
                use: [ MiniCssExtractPlugin.loader, 'css-loader',
                       { loader: 'less-loader',
                         options: {
                             paths: [ROOT_DIR, NODE_MODULES_DIR],
                             plugins: [
                                 new RewriteImportPlugin({paths: { "../../theme.config": "src/theme.less" }})
                             ]
                         }
                       }
                     ]
            },
            {
                test: /\.(s?)css$/,
                use: [ MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader' ]
            },
            {test: /\.eot(\?v=\d+.\d+.\d+)?$/,
             use: [{loader: 'file-loader', options: {name: '[name].[ext]', outputPath: 'fonts'}}]},
            {test: /\.(woff(2)?|ttf)(\?v=\d+.\d+.\d+)?$/,
             use: [{loader: 'file-loader', options: {name: '[name].[ext]', outputPath: 'fonts'}}]},
            {test: /webfont\.svg(\?v=\d+.\d+.\d+)?$/,
             use: [{loader: 'file-loader', options: {name: '[name].[ext]', outputPath: 'fonts'}}]},
            {test: /\.(png|svg)(\?v=\d+.\d+.\d+)?$/,
             use: [{loader: 'file-loader', options: {name: '[name].[ext]', outputPath: 'images'}}]},
            {test: /\.(html)$/,
             use: [{loader: 'file-loader', options: {name: '[name].[ext]', outputPath: './'}}]}
        ]
    },

    plugins: [
        new HtmlWebpackPlugin({
            filename: 'index.html',
            template: `!!handlebars-loader!src/index.hbs`,
            hash: true,
            scripts: [ "index.js" ],
            links: [ "photo-app.css" ],
            title: "Intrustd Photos"
        }),
        new MiniCssExtractPlugin({
            filename: "bundle.css"
        })
    ]
};
