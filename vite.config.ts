import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';

export default defineConfig({
    // ...vite config settings
    server: {
        // vite server configs, if interrupt mode is set to false, this port will not be used
        port: 3006,
    },
    plugins: [
        ...VitePluginNode({
            // Nodejs native with 'fetch' polyfill
            // Choice of 'express', 'nest', 'koa', 'fastify'
            adapter: 'express',

            // tell the plugin where is your project entry
            appPath: './src/server.ts',

            // Optional, default: 'viteNodeApp'
            // the name of named export of you app from the appPath file
            exportName: 'default',

            // Optional, default: false
            // if you want to initialize your app when vite start, set to true
            initAppOnBoot: true,

            // Optional, default: 'ts'
            // use this if you want to use different swc settings
            tsCompiler: 'esbuild',
        }),
    ],
    optimizeDeps: {
        // Vite does not work well with optionals dependencies,
        // you can mark them as ignored for now
        // eg: microsoft/typescript, typescript, etc.
        exclude: [
            '@prisma/client',
            'bcryptjs'
        ],
    },
});
