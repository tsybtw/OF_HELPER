import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONFIG = {
  PORT: 8444,
  TEMPLATE_PATH: path.resolve(__dirname, 'templates', 'output.html'),
  PROXY_TARGET: 'http://localhost:8765',
  RELOAD_DEBOUNCE: 100,
  WATCH_INTERVAL: 100,
  VERSION_PATH: '/__output-version',
  VERSION_CHECK_INTERVAL: 1500,
  VERSION_SETTLE_MS: 700
}

let htmlCache = {
  content: null,
  lastModified: 0,
  version: null,
  pendingUpdates: false
}

const getOutputVersion = (stats) => `${stats.mtimeMs}-${stats.size}`

const VERSION_SCRIPT_PATTERN = /<script\b[^>]*>\s*\(function \(\) \{\s*var loadedVersion = [\s\S]*?<\/script>/g

const withVersionCheck = (source, version) => {
  const html = source.replace(VERSION_SCRIPT_PATTERN, '')
  const script = `<script>
(function () {
  var loadedVersion = ${JSON.stringify(version)};
  var currentScript = document.currentScript;
  if (currentScript && currentScript.parentNode) currentScript.parentNode.removeChild(currentScript);
  var checking = false;
  function check() {
    if (checking) return;
    checking = true;
    fetch(${JSON.stringify(CONFIG.VERSION_PATH)}, { cache: 'no-store' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data && data.version && data.version !== loadedVersion && data.age >= ${CONFIG.VERSION_SETTLE_MS}) {
          location.reload();
        }
      })
      .catch(function () {})
      .finally(function () { checking = false; });
  }
  setInterval(check, ${CONFIG.VERSION_CHECK_INTERVAL});
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
})();
</script>`
  const bodyEnd = html.lastIndexOf('</body>')
  return bodyEnd === -1 ? html + script : html.slice(0, bodyEnd) + script + html.slice(bodyEnd)
}

const htmlWatcher = () => ({
  name: 'html-watcher',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url.startsWith('/@') || req.url.includes('/node_modules/')) {
        return next()
      }

      if (req.url.split('?')[0] === CONFIG.VERSION_PATH) {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        try {
          const stats = fs.statSync(CONFIG.TEMPLATE_PATH)
          return res.end(JSON.stringify({
            version: getOutputVersion(stats),
            age: Date.now() - stats.mtimeMs
          }))
        } catch (error) {
          res.statusCode = 503
          return res.end('{}')
        }
      }

      if (req.url === '/' || req.url.endsWith('.html')) {
        try {
          const stats = fs.statSync(CONFIG.TEMPLATE_PATH)

          if (!htmlCache.pendingUpdates && htmlCache.content && htmlCache.lastModified === stats.mtimeMs) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache')
            return res.end(withVersionCheck(htmlCache.content, htmlCache.version))
          }

          let html = fs.readFileSync(CONFIG.TEMPLATE_PATH, { encoding: 'utf8' })
          html = await server.transformIndexHtml(req.url, html)

          htmlCache = {
            content: html,
            lastModified: stats.mtimeMs,
            version: getOutputVersion(stats),
            pendingUpdates: false
          }

          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          return res.end(withVersionCheck(html, htmlCache.version))
        } catch (error) {
          console.error('Error processing HTML:', error)
          return next(error)
        }
      }
      
      return next()
    })

    const debounceReload = (() => {
      let timeout
      return () => {
        if (timeout) clearTimeout(timeout)

        htmlCache.pendingUpdates = true

        timeout = setTimeout(() => {
          try {
            server.ws.send({ type: 'full-reload' })
          } catch (err) {
            console.error('Reload failed:', err)
          }
        }, CONFIG.RELOAD_DEBOUNCE)
      }
    })()

    const watcher = fs.watch(path.resolve(__dirname, 'templates'), { recursive: true })
    watcher.on('change', (eventType, filename) => {
      if (filename === 'output.html') {
        htmlCache.content = null
        debounceReload()
      }
    })

    server.httpServer.on('close', () => {
      watcher.close()
    })
  }
})

export default defineConfig({
  root: process.cwd(),
  base: '/',
  
  server: {
    port: CONFIG.PORT,
    strictPort: true,
    host: 'localhost',
    open: true,
    
    proxy: {
      '^(?!/@fs|/@vite|/node_modules/vite).*': {
        target: CONFIG.PROXY_TARGET,
        changeOrigin: true,
        ws: true,
        bypass: (req) => {
          if (req.headers.upgrade?.toLowerCase() === 'websocket') {
            return req.url
          }
        }
      }
    },
    
    watch: {
      usePolling: true,
      interval: CONFIG.WATCH_INTERVAL,
      ignored: [
        '**/images/**',
        '**/queue_states/**',
        '**/files/**',
        '**/templates/**',
        '**/id/**',
        '**/ffmpeg/**',
        '**/__pycache__/**',
        '**/*.session',
        '**/*.session-journal'
      ]
    },
    
    fs: {
      strict: false,
      allow: [process.cwd(), path.resolve('node_modules')]
    }
  },
  
  plugins: [htmlWatcher()],
  
  optimizeDeps: {
    force: true,
    entries: [],
    exclude: []
  },
  
  hmr: {
    protocol: 'ws',
    host: true,
    port: CONFIG.PORT,
    clientPort: CONFIG.PORT,
    timeout: 5000,
    overlay: false
  },
  
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})
