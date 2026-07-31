# ☁️ Smart Cloud Backup System

An automated mobile-to-cloud backup application that intelligently syncs files to Google Drive — with built-in spam filtering, duplicate detection, and a review workflow to prevent clutter and accidental uploads.

## 🚀 Overview

Manually backing up phone photos/files to the cloud is tedious and often results in duplicate or junk uploads. This project automates the process end-to-end: it securely connects to a user's Google Drive, filters out low-value images (like screenshots/spam) using OCR, detects duplicates via file hashing, and gives users a staging area to approve uploads before they're committed — with live progress tracking throughout.

## ✨ Key Features

- 🔐 **Secure Authentication** — Google OAuth 2.0 integration for safe, token-based access to user Drive accounts (no password handling)
- 🧠 **OCR-Based Spam Filtering** — Uses Tesseract OCR to detect and filter out low-value/spam images before upload
- 🔁 **Duplicate Detection** — SHA-256 hashing identifies and prevents duplicate file uploads, saving storage and avoiding clutter
- 📋 **Staging & Approval Workflow** — Files are staged for user review before final upload, reducing accidental/unwanted syncs
- 📊 **Live Progress Tracking** — Real-time feedback during batch uploads
- 📦 **Batch Uploads** — Efficiently handles multiple files in a single sync operation

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js |
| Authentication | Google OAuth 2.0 |
| Cloud Storage | Google Drive API |
| Image Processing | Tesseract OCR |
| Deduplication | SHA-256 Hashing |
| Frontend | HTML, CSS, JavaScript |

## 🏗️ How It Works

1. User authenticates securely via Google OAuth 2.0
2. Files selected for backup are scanned — OCR filters out spam/low-value images
3. Remaining files are hashed (SHA-256) and checked against existing Drive contents for duplicates
4. Unique, relevant files are staged for user approval
5. Approved files are uploaded in batches to Google Drive, with live progress tracking

## ⚙️ Setup & Installation

```bash
# Clone the repository
git clone https://github.com/Chirag136/MyBackup.git
cd MyBackup

# Install dependencies
npm install

# Set up environment variables (Google OAuth credentials, etc.)
# Create a .env file — see .env.example if available

# Run the server
node server.js
```

## 📌 Future Improvements

- [ ] Support for additional cloud providers (Dropbox, OneDrive)
- [ ] Configurable filtering thresholds for OCR spam detection
- [ ] Mobile app / PWA wrapper for direct-from-device backups
- [ ] Dockerize for easier deployment

## 📄 License

This project is open for learning and demonstration purposes.
