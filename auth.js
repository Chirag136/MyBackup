const { google } = require('googleapis');
require('dotenv').config();

// Initialize the Google OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// We specifically request the drive.file scope which allows us to ONLY see files
// that the app created itself (maximum privacy for users)
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Demands a refresh token so the app works while laptop is off
    scope: SCOPES,
    prompt: 'consent' // Forces consent screen to ensure we always get a refresh token
  });
}

async function getTokens(code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens; // Keep raw tokens to store in memory or DB
}

// Function to upload a file directly to the user's Google Drive Buffer folder
async function createFolderIfMissing(drive) {
    const res = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and name='Antigravity Backup' and trashed=false",
        fields: 'files(id, name)',
    });
    if (res.data.files.length > 0) return res.data.files[0].id;

    // Create folder
    const folderMetadata = {
        name: 'Antigravity Backup',
        mimeType: 'application/vnd.google-apps.folder',
    };
    const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id',
    });
    return folder.data.id;
}

module.exports = { oauth2Client, getAuthUrl, getTokens, createFolderIfMissing, google };
