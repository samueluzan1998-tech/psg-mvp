const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const { nanoid } = require("nanoid");
const path = require("path");
const fs = require("fs");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }); // 8MB

// Sert la page web
app.use(express.static(path.join(__dirname, "public")));

// Sert les images générées
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

function ensureUploadsDir() {
  const dir = path.join(__dirname, "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
}

// Watermark dissuasif
function watermarkSvg(width, height) {
  const text1 = "APERÇU • EXPERIENCE DEMO •";
  const text2 = "WATERMARK • NON TELECHARGEABLE";
  return Buffer.from(`
    <svg width="${width}" height="${height}">
      <style>
        .t { fill: rgba(255,255,255,0.35); font-size: 52px; font-family: Arial, sans-serif; font-weight: 700; }
      </style>
      <g transform="rotate(-20 ${width/2} ${height/2})">
        <text x="50%" y="48%" text-anchor="middle" class="t">${text1}</text>
        <text x="50%" y="60%" text-anchor="middle" class="t">${text2}</text>
      </g>
    </svg>
  `);
}

// “Faux joueur” (démo) : un rectangle + texte. Plus tard: vraie image PNG du joueur.
async function addFakePlayerOverlay(inputBuffer) {
  const img = sharp(inputBuffer);
  const meta = await img.metadata();
  const w = meta.width || 1200;
  const h = meta.height || 800;

  const overlay = Buffer.from(`
    <svg width="${w}" height="${h}">
      <rect x="${Math.floor(w*0.62)}" y="${Math.floor(h*0.18)}"
            width="${Math.floor(w*0.30)}" height="${Math.floor(h*0.70)}"
            rx="24" fill="rgba(0,0,0,0.30)"/>
      <text x="${Math.floor(w*0.77)}" y="${Math.floor(h*0.55)}"
            text-anchor="middle" fill="rgba(255,255,255,0.85)"
            font-size="${Math.floor(w*0.03)}" font-family="Arial" font-weight="700">
        JOUEUR (DEMO)
      </text>
    </svg>
  `);

  return img.composite([{ input: overlay }]).jpeg({ quality: 90 }).toBuffer();
}

app.post("/api/upload", upload.single("photo"), async (req, res) => {
  try {
    ensureUploadsDir();

    if (!req.file) return res.status(400).json({ error: "Aucune photo reçue" });

    const id = nanoid(10);

    // base image
    let base = await sharp(req.file.buffer).rotate().jpeg({ quality: 92 }).toBuffer();

    // overlay démo “joueur”
    base = await addFakePlayerOverlay(base);

    // HD privée (non envoyée)
    const hdPath = path.join(__dirname, "uploads", `${id}-hd.jpg`);
    await sharp(base)
      .resize({ width: 2200, withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toFile(hdPath);

    // Preview publique (basse résolution + watermark)
    const previewBase = await sharp(base)
      .resize({ width: 900, withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();

    const meta = await sharp(previewBase).metadata();
    const wm = watermarkSvg(meta.width || 900, meta.height || 600);

    const previewPath = path.join(__dirname, "uploads", `${id}-preview.jpg`);
    await sharp(previewBase)
      .composite([{ input: wm }])
      .jpeg({ quality: 72 })
      .toFile(previewPath);

    res.json({ id, previewUrl: `/uploads/${id}-preview.jpg` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ MVP lancé : http://localhost:${PORT}`));

