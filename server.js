const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(helmet());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Çok fazla istek attınız, lütfen 1 dakika bekleyin.'
});
app.use('/', limiter); // limiter artık tüm / yollarına

// Statik dosyalar için public klasörü
app.use(express.static('public'));

const getIP = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
};

let pending = {};
const DB_PATH = './db.json';

function saveVerified(email, ip, location) {
  let db = [];
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH));
    } catch {
      db = [];
    }
  }
  db.push({ email, ip, location, verifiedAt: new Date().toISOString() });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'brdevelopment2@gmail.com', // kendi mailin
    pass: 'gsrzwedlaiuprwoe'          // kendi app şifren
  }
});

// GET / ile index.html sun
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// POST / ile login işlemi
app.post('/', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@gmail.com')) {
      return res.status(400).json({ success: false, message: 'Geçerli bir Gmail adresi girin.' });
    }

    const ip = getIP(req);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000;

    let location = 'Bilinmiyor';
    try {
      const response = await axios.get(`https://ipapi.co/${ip}/json/`);
      location = `${response.data.country_name || 'Bilinmiyor'} (${response.data.city || 'Bilinmiyor'})`;
    } catch {}

    pending[token] = { email, ip, expiresAt, location };

    const baseURL = 'http://localhost:3000'; // canlıda kendi domainin
    const url = `${baseURL}/verify?token=${token}`;

    const html = `
      <h2>🔐 Hesap Doğrulama</h2>
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
    }, (error) => {
      if (error) return res.status(500).json({ success: false, message: 'E-posta gönderilemedi.' });
      res.json({ success: true, message: '📩 Doğrulama bağlantısı gönderildi!' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
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

app.listen(PORT, () => {
  console.log(\`🚀 Sunucu çalışıyor: http://localhost:\${PORT}\`);
});
