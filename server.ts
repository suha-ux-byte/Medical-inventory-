import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { initializeDatabase } from './server/db.ts';
import { seedDemoDataIfEmpty } from './server/seed.ts';
import { apiRouter } from './server/routes.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  initializeDatabase();
  seedDemoDataIfEmpty();

  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'MediStock', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRouter);

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MediStock server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MediStock server:', err);
  process.exit(1);
});
