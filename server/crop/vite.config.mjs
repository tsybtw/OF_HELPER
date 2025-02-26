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
  FINAL_CHECK_DELAY: 1000 
}

let htmlCache = {
  content: null,
  lastModified: 0,
  pendingUpdates: false
}

const htmlWatcher = () => ({
  name: 'html-watcher',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url.startsWith('/@') || req.url.includes('/node_modules/')) {
        return next()
      }

      if (req.url === '/' || req.url.endsWith('.html')) {
        try {
          const stats = fs.statSync(CONFIG.TEMPLATE_PATH)

          if (!htmlCache.pendingUpdates && htmlCache.content && htmlCache.lastModified === stats.mtimeMs) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache')
            return res.end(htmlCache.content)
          }
      
          let html = fs.readFileSync(CONFIG.TEMPLATE_PATH, { encoding: 'utf8' })
          html = await server.transformIndexHtml(req.url, html)
          
          htmlCache = {
            content: html,
            lastModified: stats.mtimeMs,
            pendingUpdates: false
          }
      
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          return res.end(html)
        } catch (error) {
          console.error('Error processing HTML:', error)
          return next(error)
        }
      }
      
      return next()
    })

    const ensureLatestVersion = async () => {
      try {
        const currentContent = fs.readFileSync(CONFIG.TEMPLATE_PATH, { encoding: 'utf8' })
        if (htmlCache.content !== currentContent) {
          htmlCache.content = null
          htmlCache.pendingUpdates = true
          server.ws.send({ type: 'full-reload' })
          setTimeout(() => {
            htmlCache.pendingUpdates = false
          }, CONFIG.FINAL_CHECK_DELAY)
        }
      } catch (err) {
        console.error('Error checking latest version:', err)
      }
    }

    const debounceReload = (() => {
      let timeout
      let finalCheckTimeout
      return () => {
        if (timeout) clearTimeout(timeout)
        if (finalCheckTimeout) clearTimeout(finalCheckTimeout)
        
        htmlCache.pendingUpdates = true
        
        timeout = setTimeout(async () => {
          try {
            server.ws.send({ type: 'full-reload' })
            finalCheckTimeout = setTimeout(async () => {
              await ensureLatestVersion()
            }, CONFIG.FINAL_CHECK_DELAY)
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
      interval: CONFIG.WATCH_INTERVAL
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
