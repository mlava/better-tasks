const webpack = require('webpack');

module.exports = {
    entry: './src/index.js',
    output: {
        filename: 'extension.js',
        path: __dirname,
        library: {
            type: "module",
        }
    },
    experiments: {
        outputModule: true,
    },
    mode: 'development',
    performance: {
        hints: false,
    },
    resolve: {
        extensions: ['.js', '.jsx'], // This will allow you to import .jsx files without needing to add the extension
    },
};