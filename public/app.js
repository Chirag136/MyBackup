const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');
const fileInput = document.getElementById('fileInput');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const uploadStatus = document.getElementById('upload-status');

// 1. Check if Server has Google Tokens stored
fetch('/api/status')
    .then(res => res.json())
    .then(data => {
        if(data.authenticated) {
            loginView.style.display = 'none';
            mainView.style.display = 'block';
        } else {
            loginView.style.display = 'block';
            mainView.style.display = 'none';
        }
    });

fileInput.addEventListener('change', async () => {
    if (fileInput.files.length > 0) {
        const files = Array.from(fileInput.files);
        fileInput.value = ''; // Immediately clear so user can reuse the button
        
        progressContainer.style.display = 'block';
        uploadStatus.className = "status";
        
        let batchResults = [];
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
            uploadStatus.innerHTML = `Scanning <b style="color:#facc15;">${i + 1} of ${files.length}</b>...`;
            try {
                const resData = await uploadSingleFile(files[i], i, files.length);
                if (resData && resData.stagedId) {
                    batchResults.push(resData);
                } else failCount++;
            } catch(e) {
                failCount++;
            }
        }
        
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        
        if (batchResults.length === 0) {
            uploadStatus.textContent = `Upload failed completely (Network issues).`;
            uploadStatus.className = "status error";
            return;
        }

        let spamCount = 0;
        let duplicatesCount = 0;
        let cleanIds = [];
        let junkIds = [];
        let seenHashes = new Set();
        
        batchResults.forEach(item => {
            let isJunk = false;
            
            if (item.isSpam) {
                spamCount++;
                isJunk = true;
            }
            if (seenHashes.has(item.hash)) {
                duplicatesCount++;
                isJunk = true;
            } else {
                seenHashes.add(item.hash);
            }
            
            if (isJunk) junkIds.push(item.stagedId);
            else cleanIds.push(item.stagedId);
        });
        
        if (spamCount > 0 || duplicatesCount > 0) {
            document.getElementById('spam-count').innerText = spamCount;
            document.getElementById('duplicate-count').innerText = duplicatesCount;
            document.getElementById('clean-count').innerText = cleanIds.length;
            document.getElementById('staging-view').style.display = 'flex';
            
            window._pendingCleanIds = cleanIds;
            window._pendingJunkIds = junkIds;
        } else {
            uploadStatus.textContent = `🚀 Uploading ${cleanIds.length} pristine files...`;
            await commitUpload(cleanIds, []);
            uploadStatus.textContent = `✅ Successfully backed up!`;
            uploadStatus.className = "status success";
            setTimeout(() => { uploadStatus.textContent = ""; }, 4000);
        }
    }
});

window.approveStaging = async function(filterJunk) {
    document.getElementById('staging-view').style.display = 'none';
    uploadStatus.textContent = `🚀 Committing pristine files to Cloud...`;
    
    let approved = window._pendingCleanIds || [];
    let rejected = window._pendingJunkIds || [];
    
    if (!filterJunk) {
        approved = approved.concat(rejected);
        rejected = [];
    }
    
    await commitUpload(approved, rejected);
    
    uploadStatus.textContent = `✅ Trashed junk! Successfully stored ${approved.length} pristine files!`;
    uploadStatus.className = "status success";
    setTimeout(() => { uploadStatus.textContent = ""; }, 4000);
};

function commitUpload(approvedIds, rejectedIds) {
    return fetch('/api/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedIds, rejectedIds })
    });
}

function uploadSingleFile(file, currentIndex, totalFiles) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/stage', true); // Changed to STAGE

        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
                const fileProgress = (e.loaded / e.total);
                const overallProgress = ((currentIndex + fileProgress) / totalFiles) * 100;
                progressBar.style.width = overallProgress + '%';
            }
        };

        xhr.onload = function() {
            if (xhr.status === 200) {
                try { resolve(JSON.parse(xhr.responseText)); } catch(e){ resolve(null); }
            } else reject(new Error(`HTTP ${xhr.status}`));
        };
        
        xhr.onerror = () => reject(new Error("Network drop"));
        xhr.setRequestHeader('Bypass-Tunnel-Reminder', 'true');
        xhr.send(formData);
    });
}

window.closeGallery = function() {
    document.getElementById('gallery-fullscreen-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'block';
};

window.loadGallery = function() {
    // Hide Upload UI & Show Fullscreen Overlay
    document.getElementById('main-view').style.display = 'none';
    const view = document.getElementById('gallery-fullscreen-view');
    view.style.display = 'flex';
    
    const container = document.getElementById('fullscreen-grid');
    container.innerHTML = '<p style="color:#facc15; text-align:center; padding-top:50px;">Loading high-res gallery...</p>';
    
    fetch('/api/files')
    .then(r => r.json())
    .then(data => {
        if(data.error) {
            container.innerHTML = `<p style="color:#ef4444; font-size:14px; text-align:center; padding-top:50px;">Error: ${data.error}</p>`;
            return;
        }
        if(data.files.length === 0) {
            container.innerHTML = `<p style="color:#94a3b8; font-size:14px; text-align:center; padding-top:50px;">Laptop folder is currently empty.</p>`;
            return;
        }
        
        container.innerHTML = '';
        container.style.display = 'grid';
        // Native 3-column photo grid like Apple Photos
        container.style.gridTemplateColumns = 'repeat(3, 1fr)'; 
        container.style.gap = '2px';
        
        data.files.forEach(f => {
            const ext = f.split('.').pop().toLowerCase();
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'].includes(ext);
            
            const link = document.createElement('a');
            link.href = `/api/files/${encodeURIComponent(f)}`;
            link.target = "_blank";
            link.style.display = "block";
            link.style.width = "100%";
            link.style.aspectRatio = "1 / 1"; // Perfect instagram squares!
            link.style.overflow = "hidden";
            link.style.background = "#1e293b";
            link.style.position = "relative";
            
            if (isImage) {
                const img = document.createElement('img');
                img.src = `/api/files/${encodeURIComponent(f)}`;
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.objectFit = "cover";
                link.appendChild(img);
            } else {
                const icon = document.createElement('div');
                icon.innerText = "📄";
                icon.style.fontSize = "40px";
                icon.style.display = "flex";
                icon.style.alignItems = "center";
                icon.style.justifyContent = "center";
                icon.style.height = "100%";
                link.appendChild(icon);
            }
            
            container.appendChild(link);
        });
    })
    .catch(e => {
        container.innerHTML = `<p style="color:#ef4444; font-size:14px; text-align:center; padding-top:50px;">Network fail. Laptop unreachable.</p>`;
    });
};
