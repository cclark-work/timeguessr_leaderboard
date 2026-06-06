const express = require('express');
const multer = require('multer');
const path = require('path');
const { extractTimeguessrScores } = require('./aiExtractor');
const { createStore } = require('./store');

function createApp({ store = createStore(), extractor = extractTimeguessrScores } = {}) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });

  // Tell browsers to always use HTTPS for this site, so after the first visit
  // they skip the insecure http -> https redirect hop entirely. (App Service
  // already 301-redirects http to https via the HTTPS-only setting.)
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/names', async (req, res) => {
    try {
      res.json({ names: await store.lookupNames(req.query.q) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/days', async (req, res) => {
    try {
      res.json({ days: await store.listDays() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/leaderboard', async (req, res) => {
    try {
      const day = req.query.day || new Date().toISOString().slice(0, 10);
      const [leaderboard, entries] = await Promise.all([
        store.getDayLeaderboard(day),
        store.getDayEntries(day),
      ]);
      res.json({ day, leaderboard, entries });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/upload', upload.single('screenshot'), async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Name is required.' });
      }
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'Screenshot file is required.' });
      }

      const analysis = await extractor(req.file.buffer);
      const entry = await store.addEntry(name, analysis);

      return res.status(201).json({ entry });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  return app;
}

module.exports = {
  createApp,
};
