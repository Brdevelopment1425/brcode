const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const app = express();
const PORT = 3000;

let pending = {};
const DB_PATH = './db.json';

app.use(helmet());
app.use(bodyParser.json());
app.use(express.static('public'));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Çok fazla istek attınız, lütfen 1 dakika bekleyin.'
});
app.use('/login', limiter);

const getIP = (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress;

function saveVerified(email, ip, location) {
  let db = [];
  if (fs.existsSync(DB_PATH)) db = JSON.parse(fs.readFileSync(DB_PATH));
  db.push({ email, ip, location, verifiedAt: new Date().toISOString() });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'brdevelopment2@gmail.com',
    pass: 'gsrzwedlaiuprwoe'
  }
});

app.post('/login', async (req, res) => {
  const { email } = req.body;
  const ip = getIP(req);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 5 * 60 * 1000;

  let location = 'Bilinmiyor';
  try {
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    location = `${response.data.country_name} (${response.data.city})`;
  } catch {
    location = 'Konum alınamadı';
  }

  pending[token] = { email, ip, expiresAt, location };

  const baseURL = 'https://brdevelopment2.repl.co';
  const url = `${baseURL}/verify?token=${token}`;

  const html = `
    <h2 style="color:#333">🔐 Hesap Doğrulama</h2>
    <p>Merhaba, <strong>${email}</strong></p>
    <p>Hesabını doğrulamak için aşağıdaki bağlantıya 5 dakika içinde tıkla:</p>
    <p><a href="${url}" style="background:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:8px">Hesabımı Doğrula</a></p>
    <p style="font-size:12px;color:gray">IP: ${ip} - Konum: ${location}</p>
  `;

  transporter.sendMail({
    from: 'Doğrulama Sistemi <brdevelopment2@gmail.com>',
    to: email,
    subject: '📧 Hesabını Doğrula',
    html
  }, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: '📩 Doğrulama bağlantısı gönderildi!' });
  });
});

app.get('/verify', (req, res) => {
  const { token } = req.query;
  const ip = getIP(req);
  const data = pending[token];

  if (!data) return res.send('❌ Bağlantı geçersiz veya süresi dolmuş.');
  if (Date.now() > data.expiresAt) return res.send('⌛ Bu bağlantının süresi dolmuş.');
  if (data.ip !== ip) return res.send('⚠️ IP adresi uyuşmuyor.');

  saveVerified(data.email, data.ip, data.location);
  delete pending[token];

  res.send(`
    <html><head><title>Doğrulama Başarılı</title></head><body style="font-family:sans-serif;text-align:center;padding:50px">
      <h2>✅ Başarıyla Doğrulandınız!</h2>
      <p>Hoş geldiniz, <strong>${data.email}</strong></p>
      <p>IP: ${data.ip}</p>
      <p>Konum: ${data.location}</p>
    </body></html>
  `);
});

app.listen(PORT, () => console.log(`🚀 Uygulama yayında: http://localhost:${PORT}`));
