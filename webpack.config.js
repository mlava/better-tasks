const path = require("path");

module.exports = {
    entry: "./src/index.js",
    output: {
        filename: "extension.js",
        path: __dirname,
        library: {
            type: "module",
        },
    },
    mode: "development",
    experiments: {
        outputModule: true,
    },
    module: {
        rules: [
            {
                test: /\.[jt]sx?$/,
                include: path.resolve(__dirname, "src"),
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react'], // Use the presets for both modern JavaScript and React JSX
                    },
                },
            },
        ],
    },
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
    },
    performance: {
        hints: false,
    },
};
