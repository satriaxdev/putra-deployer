import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs";
import AdmZip from "adm-zip";
import CryptoJS from "crypto-js";

const app = express();
const PORT = 3000;

app.use(express.static("public"));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const TOKEN_FILE = "./tokens.json";
const SECRET_KEY = "putra_project_secret_key"; // ganti dengan secret lebih aman

function encryptToken(token) {
  return CryptoJS.AES.encrypt(token, SECRET_KEY).toString();
}

function decryptToken(ciphertext) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// Simpan token
app.post("/save-token", (req, res) => {
  const { platform, token } = req.body;
  if (!platform || !token) return res.status(400).json({ error: "Platform dan token diperlukan" });

  let tokens = {};
  if (fs.existsSync(TOKEN_FILE)) tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));

  tokens[platform.toLowerCase()] = encryptToken(token);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens));

  res.json({ success: true, message: `Token untuk ${platform} berhasil disimpan.` });
});

// Ambil token
function getToken(platform) {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
  if (!tokens[platform.toLowerCase()]) return null;
  return decryptToken(tokens[platform.toLowerCase()]);
}

// Lihat token tersimpan
app.get("/tokens", (req, res) => {
  if (!fs.existsSync(TOKEN_FILE)) return res.json({});
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
  res.json(tokens);
});

// Deploy folder ZIP
app.post("/deploy", upload.single("folder"), async (req, res) => {
  const { platform } = req.body;
  const folderFile = req.file;

  if (!folderFile || !platform) return res.status(400).json({ error: "Folder dan platform diperlukan" });

  const token = getToken(platform);
  if (!token) return res.status(400).json({ error: `Token untuk ${platform} belum disimpan.` });

  try {
    const zip = new AdmZip(folderFile.buffer);
    const zipEntries = zip.getEntries();

    const formData = new FormData();
    zipEntries.forEach(entry => {
      if (!entry.isDirectory) {
        formData.append("files", entry.getData(), entry.entryName);
      }
    });

    let apiResponse;
    if (platform.toLowerCase() === "vercel") {
      apiResponse = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
    } else if (platform.toLowerCase() === "netlify") {
      apiResponse = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
    } else return res.status(400).json({ error: "Platform tidak dikenal" });

    const data = await apiResponse.json();
    if (apiResponse.ok) {
      const url = platform.toLowerCase() === "vercel" ? data.url : data.ssl_url || data.url;
      return res.json({ success: true, url: `https://${url}` });
    } else return res.status(500).json({ success: false, data });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
