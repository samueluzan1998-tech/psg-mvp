const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const { nanoid } = require("nanoid");
const path = require("path");
const fs = require("fs");

const app = express();

// Dossier uploads
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Static
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(__dirname, "public")));

// Upload config (25MB iPhone OK)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Erreurs upload (fichier trop gros)
app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Photo trop lourde. Essaie une photo plus légère." });
  }
  return next(err);
});

// Watermark SVG
function watermarkSvg(width, height) {
  const text1 = "APERÇU • EXPERIENCE DEMO •";
  const text2 = "WATERMARK • NON TELECHARGEABLE";
  return Buffer.from(`
    <svg width="${width}" height="${height}">
      <style>
        .t { fill: rgba(255,255,255,0.35); font-size: 52px; font-family: Arial, sans-serif; font-weight: 700; }
      </style>
      <g transform="rotate(-20 ${width / 2} ${height / 2})">
        <text x="50%" y="48%" text-anchor="middle" class="t">${text1}</text>
        <text x="50%" y="60%" text-anchor="middle" class="t">${text2}</text>
      </g>
    </svg>
  `);
}

app.post("/api/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });

    const id = nanoid(10);

    // On normalise en JPG
    const baseJpg = path.join(uploadsDir, `${id}.jpg`);
    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toFile(baseJpg);

    // Preview compressée + watermark
    const previewPath = path.join(uploadsDir, `${id}-preview.jpg`);

    const img = sharp(baseJpg);
    const meta = await img.metadata();
    const w = meta.width || 1200;
    const h = meta.height || 800;

    const wm = watermarkSvg(w, h);

    await sharp(baseJpg)
      .resize({ width: 900, withoutEnlargement: true })
      .jpeg({ quality: 55 })
      .composite([{ input: wm, top: 0, left: 0 }])
      .toFile(previewPath);

    return res.json({ id, previewUrl: `/uploads/${id}-preview.jpg` });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ MVP lancé : http://localhost:${PORT}`));
