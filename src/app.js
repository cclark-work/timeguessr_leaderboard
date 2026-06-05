const express = require('express');
const multer = require('multer');
const path = require('path');
const { extractTimeguessrScores } = require('./aiExtractor');
const { InMemoryStore } = require('./store');

function createApp({ store = new InMemoryStore(), extractor = extractTimeguessrScores } = {}) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/names', (req, res) => {
    res.json({ names: store.lookupNames(req.query.q) });
  });

  app.get('/api/leaderboard', (req, res) => {
    const day = req.query.day;
    res.json({
      day: day || new Date().toISOString().slice(0, 10),
      leaderboard: store.getDayLeaderboard(day),
      entries: store.getDayEntries(day),
    });
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
      const entry = store.addEntry(name, analysis);

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
