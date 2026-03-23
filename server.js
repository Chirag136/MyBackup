const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
require('dotenv').config();
const { getAuthUrl, getTokens, oauth2Client, createFolderIfMissing, google } = require('./auth');

const app = express();
app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const TOKEN_PATH = 'tokens.json';

process.on('uncaughtException', (err) => {
    console.error("Uncaught exception prevented crash:", err.message || err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error("Unhandled Rejection prevented crash:", reason);
});

// Automatically reload tokens if the server restarts
if (fs.existsSync(TOKEN_PATH)) {
    oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
}

// 1. OAuth Initialization
app.get('/auth/google', (req, res) => {
    res.redirect(getAuthUrl());
});

app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    try {
        const tokens = await getTokens(code);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        oauth2Client.setCredentials(tokens);
        res.send(`
            <h1 style="color: #4ade80; text-align: center; margin-top: 50px; font-family: sans-serif;">
                Successfully Connected to Google Drive! 🚀
            </h1>
            <script>setTimeout(() => window.location.href = '/', 1500);</script>
        `);
    } catch(e) {
        res.send(`Error: ${e.message}`);
    }
});

app.get('/api/status', (req, res) => {
    res.json({ authenticated: fs.existsSync(TOKEN_PATH) });
});

// 6. AI Smart Staging Buffer
const Tesseract = require('tesseract.js');
const crypto = require('crypto');
const stagedUploads = new Map();
let ocrWorker = null;

(async function startAI() {
    console.log("Loading Tesseract OCR AI Worker...");
    ocrWorker = await Tesseract.createWorker('eng');
    console.log("AI Scanner Online!");
})();

app.post('/api/stage', upload.single('file'), async (req, res) => {
    if (!fs.existsSync(TOKEN_PATH)) return res.status(401).json({ error: 'Need to authenticate with Google.' });
    
    try {
        const fileId = crypto.randomUUID();
        const fileBuffer = fs.readFileSync(req.file.path);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        
        let isSpam = false;
        const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
        if (req.file.mimetype && validImageTypes.includes(req.file.mimetype)) {
            try {
                if (ocrWorker) {
                    const recognizePromise = ocrWorker.recognize(req.file.path);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR Timeout')), 5000));
                    const ret = await Promise.race([recognizePromise, timeoutPromise]);
                    const text = ret.data.text.toLowerCase();
                    if (text.includes('good morning') || text.includes('good night') || text.includes('blessings') || text.includes('happy')) {
                        isSpam = true;
                    }
                }
            } catch(e) { console.error("OCR Failed", e.message); }
        }
        
        stagedUploads.set(fileId, {
            path: req.file.path,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            hash: hash,
            isSpam: isSpam
        });
        
        res.json({ success: true, stagedId: fileId, isSpam, hash });
    } catch(e) {
        if(req.file) { try { fs.unlinkSync(req.file.path); } catch(err){} }
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/commit', async (req, res) => {
    const { approvedIds = [], rejectedIds = [] } = req.body;
    
    // Immediately clear junk files from laptop storage
    for (const rid of rejectedIds) {
        if (stagedUploads.has(rid)) {
            try { fs.unlinkSync(stagedUploads.get(rid).path); } catch(e){}
            stagedUploads.delete(rid);
        }
    }
    
    if (approvedIds.length === 0) return res.json({ success: true });
    
    res.json({ success: true, message: "Committing to cloud background..." });
    
    try {
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const folderId = await createFolderIfMissing(drive);

        for (const aid of approvedIds) {
            if (!stagedUploads.has(aid)) continue;
            const fileData = stagedUploads.get(aid);
            
            const fileMetadata = { name: fileData.originalname, parents: [folderId] };
            const media = { mimeType: fileData.mimetype, body: fs.createReadStream(fileData.path) };

            try {
                await drive.files.create({ resource: fileMetadata, media: media, fields: 'id' });
            } catch(e) { console.error("Drive upload failed:", e); }
            
            // Delete from temporary local server buffer after success
            try { fs.unlinkSync(fileData.path); } catch(e){}
            stagedUploads.delete(aid);
        }
    } catch (e) {
        console.error("Fatal commit error", e);
    }
});

// 3. Desktop Checks for Pending Files to Sync
app.post('/api/sync', async (req, res) => {
    if (!fs.existsSync(TOKEN_PATH)) return res.status(401).json({ error: 'Not authenticated with Google.' });
    
    try {
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const folderId = await createFolderIfMissing(drive);

        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`, // Only look in our buffer folder
            fields: 'files(id, name)',
        });

        const files = response.data.files;
        if (files.length === 0) return res.json({ success: true, downloaded: 0 });

        // We stream back the FIRST pending file
        const fileToDownload = files[0];
        const gRes = await drive.files.get(
            { fileId: fileToDownload.id, alt: 'media' },
            { responseType: 'stream' }
        );

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileToDownload.name}"`);
        res.setHeader('X-File-Id', fileToDownload.id);
        res.setHeader('X-File-Name', fileToDownload.name); // Custom header for easier extraction on desktop client

        gRes.data.pipe(res);
    } catch (e) {
        if(!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// 4. Desktop Deletes File from Buffer after Save
app.post('/api/delete', async (req, res) => {
    try {
        const { fileId } = req.body;
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        await drive.files.delete({ fileId });
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. Laptop Remote Storage Gallery
const CONFIG_PATH = 'config.json';
let activeLaptopDirectory = null;

if (fs.existsSync(CONFIG_PATH)) {
    try { activeLaptopDirectory = JSON.parse(fs.readFileSync(CONFIG_PATH)).directory; } catch(e){}
}

app.post('/api/set-directory', (req, res) => {
    activeLaptopDirectory = req.body.directory;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ directory: activeLaptopDirectory }));
    res.json({ success: true });
});

app.get('/api/files', (req, res) => {
    if (!activeLaptopDirectory || !fs.existsSync(activeLaptopDirectory)) {
        return res.status(400).json({ error: "Laptop folder not selected or turned off!" });
    }
    try {
        const files = fs.readdirSync(activeLaptopDirectory).filter(f => !fs.statSync(require('path').join(activeLaptopDirectory, f)).isDirectory());
        res.json({ files });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/files/:filename', (req, res) => {
    if (!activeLaptopDirectory) return res.status(400).send("Laptop offline.");
    const filepath = require('path').join(activeLaptopDirectory, req.params.filename);
    if(fs.existsSync(filepath)) {
        res.sendFile(filepath);
    } else {
        res.status(404).send("File not found on laptop disk");
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🚀 Google Drive Relay Server running on port ${PORT}`);
});
