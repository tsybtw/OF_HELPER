const { createServer } = require('vite');
const path = require('path');

async function startServer() {
    try {
        const server = await createServer({
            configFile: path.resolve(__dirname, 'vite.config.mjs'),
            logLevel: 'error',
            server: {
                printUrls: false
            }
        });
        await server.listen();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

startServer();