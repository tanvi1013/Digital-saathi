require('dotenv').config();

const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const { EdgeTTS } = require('node-edge-tts');

const app = express();
const port = Number(process.env.PORT) || 3000;
const speechRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Please wait before requesting more speech.' }
});
const publicDirectory = path.join(__dirname, 'public');
const hasSupabaseConfig = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);

app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(publicDirectory));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', database: hasSupabaseConfig ? 'configured' : 'local-only' });
});

app.get('/api/config', (_request, response) => {
  response.json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null
  });
});

app.post('/api/tts', speechRateLimit, async (request, response) => {
  const { text, language, slow } = request.body || {};
  const voices = {
    en: { lang: 'en-IN', voice: 'en-IN-NeerjaNeural' },
    hi: { lang: 'hi-IN', voice: 'hi-IN-SwaraNeural' },
    mr: { lang: 'mr-IN', voice: 'mr-IN-AarohiNeural' }
  };

  if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 1800 || !voices[language]) {
    return response.status(400).json({ error: 'Text and a supported language are required.' });
  }

  const audioPath = path.join(os.tmpdir(), `digital-saathi-${randomUUID()}.mp3`);
  try {
    const voice = voices[language];
    const tts = new EdgeTTS({
      lang: voice.lang,
      voice: voice.voice,
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      rate: slow ? '-20%' : 'default',
      timeout: 20000
    });
    await tts.ttsPromise(text.trim(), audioPath);
    const audio = await fs.readFile(audioPath);
    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Cache-Control', 'no-store');
    response.send(audio);
  } catch (error) {
    console.error('Speech generation failed:', error.message);
    response.status(502).json({ error: 'Speech audio is temporarily unavailable.' });
  } finally {
    await fs.rm(audioPath, { force: true }).catch(() => {});
  }
});

app.use((request, response, next) => {
  if (request.path.startsWith('/api/')) return next();
  response.sendFile(path.join(publicDirectory, 'index.html'));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, () => {
  console.log(`Digital Saathi is running at http://localhost:${port}`);
  if (!hasSupabaseConfig) console.log('Supabase is not configured; browser progress will stay on this device.');
});

app.post('/api/dev/export-catalog', async (request, response) => {
  if (process.env.NODE_ENV === 'production') return response.sendStatus(404);
  const catalog = request.body;
  if (!catalog || !Array.isArray(catalog.modules) || !catalog.translations) {
    return response.status(400).json({ error: 'A complete Digital Saathi catalog is required.' });
  }
  const json = JSON.stringify(catalog).replace(/'/g, "''");
  const sql = `insert into public.app_catalog (id, payload)\nvalues ('default', '${json}'::jsonb)\non conflict (id) do update set payload = excluded.payload, updated_at = now();\n`;
  await fs.writeFile(path.join(__dirname, 'supabase', 'seed.sql'), sql, 'utf8');
  response.json({ exported: true, bytes: Buffer.byteLength(sql) });
});