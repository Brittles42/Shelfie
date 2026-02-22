// Shelfie - Book Scanner PWA

class BookShelf {
  constructor() {
    this.books = [];
    this.currentBook = null;
    this.pendingBook = null;
    this.stream = null;
    this.capturedImage = null;
    
    this.init();
  }

  async init() {
    await this.loadBooks();
    this.bindEvents();
    this.renderLibrary();
    this.registerServiceWorker();
  }

  // Storage
  async loadBooks() {
    try {
      const stored = localStorage.getItem('shelfie_books');
      this.books = stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load books:', e);
      this.books = [];
    }
  }

  saveBooks() {
    localStorage.setItem('shelfie_books', JSON.stringify(this.books));
  }

  // Event Binding
  bindEvents() {
    document.getElementById('scan-btn').addEventListener('click', () => this.openScanner());
    document.getElementById('close-scanner').addEventListener('click', () => this.closeScanner());
    document.getElementById('timeline-btn').addEventListener('click', () => this.showView('timeline-view'));
    document.getElementById('share-btn')?.addEventListener('click', () => this.shareShelf());
    document.getElementById('close-timeline').addEventListener('click', () => this.showView('library-view'));
    document.getElementById('close-detail').addEventListener('click', () => this.showView('library-view'));
    document.getElementById('delete-book').addEventListener('click', () => this.deleteCurrentBook());

    // Capture button - single tap
    document.getElementById('capture-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.captureAndProcess();
    });

    document.getElementById('confirm-add').addEventListener('click', () => this.confirmAddBook());
    document.getElementById('confirm-cancel').addEventListener('click', () => this.hideModal());

    // Photo upload from library
    document.getElementById('photo-input')?.addEventListener('change', (e) => this.handlePhotoUpload(e));
    document.getElementById('manual-search-btn')?.addEventListener('click', () => this.showManualSearch());
  }

  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    if (viewId === 'timeline-view') {
      this.renderTimeline();
    }
  }

  renderLibrary() {
    const grid = document.getElementById('book-grid');
    const empty = document.getElementById('empty-state');

    if (this.books.length === 0) {
      empty.classList.remove('hidden');
      grid.classList.add('hidden');
      return;
    }

    empty.classList.add('hidden');
    grid.classList.remove('hidden');

    grid.innerHTML = this.books.map((book, index) => `
      <div class="book-card" data-index="${index}">
        ${book.cover 
          ? `<img src="${book.cover}" alt="${book.title}" loading="lazy">` 
          : `<div class="no-cover">${book.title}</div>`
        }
      </div>
    `).join('');

    grid.querySelectorAll('.book-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showBookDetail(parseInt(card.dataset.index));
      });
    });
  }

  showBookDetail(index) {
    this.currentBook = index;
    const book = this.books[index];
    
    document.getElementById('book-detail').innerHTML = `
      <div class="detail-cover">
        ${book.cover 
          ? `<img src="${book.cover}" alt="${book.title}">` 
          : `<div class="no-cover">${book.title}</div>`
        }
      </div>
      <h2 class="detail-title">${book.title}</h2>
      <p class="detail-author">${book.authors?.join(', ') || 'Unknown Author'}</p>
      
      <div class="detail-meta">
        ${book.publishedDate ? `
          <div class="detail-meta-row">
            <span class="detail-meta-label">Published</span>
            <span>${book.publishedDate}</span>
          </div>
        ` : ''}
        ${book.pageCount ? `
          <div class="detail-meta-row">
            <span class="detail-meta-label">Pages</span>
            <span>${book.pageCount}</span>
          </div>
        ` : ''}
        <div class="detail-meta-row">
          <span class="detail-meta-label">Added</span>
          <span>${new Date(book.addedAt).toLocaleDateString()}</span>
        </div>
      </div>
      
      ${book.description ? `<p class="detail-description">${book.description}</p>` : ''}
    `;
    
    this.showView('detail-view');
  }

  deleteCurrentBook() {
    if (this.currentBook === null) return;
    if (!confirm('Remove this book from your shelf?')) return;
    
    this.books.splice(this.currentBook, 1);
    this.saveBooks();
    this.renderLibrary();
    this.showView('library-view');
  }

  renderTimeline() {
    const container = document.getElementById('timeline-container');
    
    if (this.books.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No books yet</p></div>';
      return;
    }

    const grouped = {};
    const sortedBooks = [...this.books].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    sortedBooks.forEach(book => {
      const date = new Date(book.addedAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      if (!grouped[key]) grouped[key] = { label, books: [] };
      grouped[key].books.push({ ...book, originalIndex: this.books.indexOf(book) });
    });

    container.innerHTML = `
      <div class="timeline">
        ${Object.entries(grouped).map(([key, group]) => `
          <div class="timeline-month">
            <div class="timeline-month-header">${group.label}</div>
            ${group.books.map(book => `
              <div class="timeline-book" data-index="${book.originalIndex}">
                <div class="timeline-book-cover">
                  ${book.cover ? `<img src="${book.cover}" alt="${book.title}">` : `<div class="no-cover">${book.title}</div>`}
                </div>
                <div class="timeline-book-info">
                  <div class="timeline-book-title">${book.title}</div>
                  <div class="timeline-book-author">${book.authors?.[0] || 'Unknown'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.timeline-book').forEach(el => {
      el.addEventListener('click', () => this.showBookDetail(parseInt(el.dataset.index)));
    });
  }

  async openScanner() {
    this.showView('scanner-view');
    await this.startCamera();
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1080 },
          height: { ideal: 1920 }
        }
      });
      const video = document.getElementById('camera');
      video.srcObject = this.stream;
      await video.play();
      document.getElementById('scan-status').textContent = 'Tap button to capture';
    } catch (e) {
      console.error('Camera error:', e);
      alert('Camera access denied. Please enable camera permissions.');
      this.closeScanner();
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  closeScanner() {
    this.stopCamera();
    this.showView('library-view');
  }

  async captureAndProcess() {
    const video = document.getElementById('camera');
    const canvas = document.getElementById('scan-canvas');
    const ctx = canvas.getContext('2d');
    
    // Visual feedback - flash
    const scanOverlay = document.querySelector('.scan-overlay');
    scanOverlay.style.background = 'rgba(255,255,255,0.8)';
    setTimeout(() => scanOverlay.style.background = '', 150);
    
    // Haptic
    if (navigator.vibrate) navigator.vibrate(50);
    
    // Capture full frame (we'll crop in the thumbnail)
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    // Stop camera immediately after capture
    this.stopCamera();
    
    // Save as thumbnail
    this.capturedImage = canvas.toDataURL('image/jpeg', 0.85);
    
    document.getElementById('scan-status').textContent = 'Identifying book...';
    this.showLoading('Reading cover...');
    
    try {
      const bookInfo = await this.identifyBook();
      console.log('Gemini result:', bookInfo);
      
      if (bookInfo && bookInfo.title && bookInfo.title !== 'Unknown') {
        document.getElementById('loading-text').textContent = 'Finding details...';
        await this.searchAndConfirm(bookInfo);
      } else {
        this.hideLoading();
        this.showManualEntry();
      }
    } catch (e) {
      console.error('Identification error:', e);
      this.hideLoading();
      this.showManualEntry();
    }
  }

  async identifyBook() {
    const apiKey = this.getGeminiKey();
    if (!apiKey) {
      console.log('No API key found');
      document.getElementById('scan-status').textContent = 'No API key!';
      return null;
    }
    
    console.log('API key found:', apiKey.substring(0, 10) + '...');

    try {
      const base64Data = this.capturedImage.split(',')[1];
      console.log('Image size:', Math.round(base64Data.length / 1024), 'KB');
      
      document.getElementById('scan-status').textContent = 'Asking Gemini...';
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { 
                  text: 'This is a photo of a book cover. Tell me the book title and author. Respond with ONLY valid JSON in this exact format: {"title": "The Book Title", "author": "Author Name"}. No other text.' 
                },
                { 
                  inline_data: { 
                    mime_type: 'image/jpeg', 
                    data: base64Data 
                  } 
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 100
            }
          })
        }
      );
      
      if (!response.ok) {
        const errText = await response.text();
        console.error('API request failed:', response.status, errText);
        document.getElementById('scan-status').textContent = 'API error: ' + response.status;
        return null;
      }
      
      const data = await response.json();
      console.log('Gemini response:', JSON.stringify(data, null, 2));
      
      if (data.error) {
        console.error('Gemini error:', data.error);
        document.getElementById('scan-status').textContent = 'Error: ' + data.error.message;
        return null;
      }
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log('Gemini said:', text);
        document.getElementById('scan-status').textContent = 'Parsing result...';
        
        // Clean up response - remove markdown code blocks if present
        let cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          console.log('Parsed:', result);
          return result;
        } else {
          console.log('No JSON found in:', cleanText);
        }
      } else {
        console.log('No text in response');
      }
      
      return null;
    } catch (e) {
      console.error('identifyBook error:', e);
      document.getElementById('scan-status').textContent = 'Error: ' + e.message;
      return null;
    }
  }
  getGeminiKey() {
    // Check window first (injected by Vercel build)
    if (window.GEMINI_API_KEY) {
      return window.GEMINI_API_KEY;
    }
    // Fallback to localStorage
    let key = localStorage.getItem('shelfie_gemini_key');
    if (!key) {
      key = prompt('Enter your Gemini API key:\n(Get one free at aistudio.google.com)');
      if (key) {
        localStorage.setItem('shelfie_gemini_key', key);
      }
    }
    return key;
  }

  async searchAndConfirm(bookInfo) {
    try {
      const query = `${bookInfo.title} ${bookInfo.author || ''}`;
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`
      );
      const data = await response.json();

      let book;
      if (data.items && data.items.length > 0) {
        book = this.parseGoogleBook(data.items[0]);
      } else {
        book = { title: bookInfo.title, authors: bookInfo.author ? [bookInfo.author] : [] };
      }
      
      // Use our captured photo as cover
      book.cover = this.capturedImage;
      this.hideLoading();
      this.showConfirmation(book);
    } catch (e) {
      console.error('Search error:', e);
      this.hideLoading();
      this.showConfirmation({
        title: bookInfo.title,
        authors: bookInfo.author ? [bookInfo.author] : [],
        cover: this.capturedImage
      });
    }
  }

  parseGoogleBook(item) {
    const info = item.volumeInfo;
    return {
      title: info.title,
      authors: info.authors || [],
      publishedDate: info.publishedDate,
      pageCount: info.pageCount,
      description: info.description,
      categories: info.categories
    };
  }

  showManualEntry() {
    this.showConfirmation({
      title: 'Unknown Book',
      authors: [],
      cover: this.capturedImage
    }, true);
  }

  showConfirmation(book, editable = false) {
    this.pendingBook = book;
    
    document.getElementById('confirm-book-info').innerHTML = `
      <img src="${book.cover || ''}" alt="Cover" style="max-height: 200px; border-radius: 8px;">
      ${editable ? `
        <input type="text" id="edit-title" value="${book.title === 'Unknown Book' ? '' : book.title}" placeholder="Enter book title..." style="font-size: 18px; padding: 12px; margin-top: 16px; width: 100%; border: 2px solid var(--accent); border-radius: 8px; background: var(--bg-surface); color: var(--text);">
        <input type="text" id="edit-author" value="${book.authors?.join(', ') || ''}" placeholder="Enter author..." style="font-size: 16px; padding: 10px; margin-top: 8px; width: 100%; border: 1px solid var(--bg-surface); border-radius: 8px; background: var(--bg-card); color: var(--text-muted);">
      ` : `
        <h3 style="margin-top: 16px;">${book.title}</h3>
        <p style="color: var(--text-muted);">${book.authors?.join(', ') || 'Unknown Author'}</p>
      `}
    `;
    
    document.getElementById('confirm-modal').classList.add('active');
    
    // Focus title input if editable
    if (editable) {
      setTimeout(() => document.getElementById('edit-title')?.focus(), 100);
    }
  }

  hideModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    this.pendingBook = null;
    this.capturedImage = null;
  }

  confirmAddBook() {
    if (!this.pendingBook) return;
    
    // Check for edited values
    const titleInput = document.getElementById('edit-title');
    const authorInput = document.getElementById('edit-author');
    
    if (titleInput) {
      const title = titleInput.value.trim();
      if (!title) {
        alert('Please enter a book title');
        titleInput.focus();
        return;
      }
      this.pendingBook.title = title;
    }
    
    if (authorInput) {
      const author = authorInput.value.trim();
      this.pendingBook.authors = author ? [author] : [];
    }
    
    this.pendingBook.addedAt = new Date().toISOString();
    this.pendingBook.id = Date.now().toString();
    
    this.books.unshift(this.pendingBook);
    this.saveBooks();
    this.renderLibrary();
    
    document.getElementById('confirm-modal').classList.remove('active');
    this.pendingBook = null;
    this.capturedImage = null;
    this.showView('library-view');
    
    if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
  }



  showManualSearch() {
    const title = prompt('Enter book title:');
    if (!title || !title.trim()) return;
    
    this.showLoading('Searching...');
    this.searchBookByTitle(title.trim());
  }

  async searchBookByTitle(title) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=1`
      );
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const book = this.parseGoogleBook(data.items[0]);
        const info = data.items[0].volumeInfo;
        book.cover = info.imageLinks?.thumbnail?.replace('http:', 'https:') || null;
        this.hideLoading();
        this.closeScanner();
        this.showConfirmation(book, false);
      } else {
        this.hideLoading();
        alert('No book found. Try a different title.');
      }
    } catch (e) {
      console.error('Search error:', e);
      this.hideLoading();
      alert('Search failed. Check your connection.');
    }
  }
  async handlePhotoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Close camera if open
    this.stopCamera();
    
    this.showLoading('Processing photo...');
    
    try {
      // Read the file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        this.capturedImage = e.target.result;
        
        // Now identify the book
        document.getElementById('loading-text').textContent = 'Identifying book...';
        
        try {
          const bookInfo = await this.identifyBook();
          console.log('Gemini result:', bookInfo);
          
          if (bookInfo && bookInfo.title && bookInfo.title !== 'Unknown') {
            document.getElementById('loading-text').textContent = 'Finding details...';
            await this.searchAndConfirm(bookInfo);
          } else {
            this.hideLoading();
            this.showManualEntry();
          }
        } catch (err) {
          console.error('Identification error:', err);
          this.hideLoading();
          this.showManualEntry();
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error('Photo upload error:', e);
      this.hideLoading();
      alert('Failed to process photo');
    }
    
    // Reset input so same file can be selected again
    event.target.value = '';
  }

  async shareShelf() {
    if (this.books.length === 0) {
      alert('Add some books first!');
      return;
    }
    
    this.showLoading('Creating shareable image...');
    
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Size for social media (Instagram story friendly)
      const width = 1080;
      const padding = 60;
      const bookHeight = 80;
      const headerHeight = 200;
      const height = Math.max(1920, headerHeight + (this.books.length * bookHeight) + padding * 2);
      
      canvas.width = width;
      canvas.height = height;
      
      // Background gradient (fairy tale theme)
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(0.5, '#16213e');
      gradient.addColorStop(1, '#0f3460');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Add some stars
      ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 3 + 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Header
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📚 My Shelfie', width / 2, 100);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '32px system-ui, sans-serif';
      ctx.fillText(`${this.books.length} book${this.books.length === 1 ? '' : 's'}`, width / 2, 150);
      
      // Books list
      ctx.textAlign = 'left';
      let y = headerHeight + padding;
      
      for (const book of this.books) {
        // Book number bullet
        const index = this.books.indexOf(book) + 1;
        ctx.fillStyle = '#e94560';
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.fillText(`${index}.`, padding, y);
        
        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px system-ui, sans-serif';
        const title = book.title.length > 35 ? book.title.substring(0, 35) + '...' : book.title;
        ctx.fillText(title, padding + 50, y);
        
        // Author
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '24px system-ui, sans-serif';
        const author = book.authors?.join(', ') || 'Unknown Author';
        ctx.fillText(author, padding + 50, y + 35);
        
        y += bookHeight;
      }
      
      // Footer
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Made with Shelfie 📖✨', width / 2, height - 40);
      
      // Convert to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      this.hideLoading();
      
      // Try native share first, fallback to download
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'my-shelfie.png', { type: 'image/png' })] })) {
        const file = new File([blob], 'my-shelfie.png', { type: 'image/png' });
        await navigator.share({
          title: 'My Shelfie',
          text: `Check out my bookshelf! ${this.books.length} books 📚`,
          files: [file]
        });
      } else {
        // Download fallback
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'my-shelfie.png';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Share error:', e);
      this.hideLoading();
      alert('Failed to create share image');
    }
  }
  showLoading(text = 'Loading...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading').classList.add('active');
  }

  hideLoading() {
    document.getElementById('loading').classList.remove('active');
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
      } catch (e) {
        console.error('SW failed:', e);
      }
    }
    this.setupInstallPrompt();
  }

  setupInstallPrompt() {
    let deferredPrompt;
    const installPrompt = document.getElementById('install-prompt');
    const installBtn = document.getElementById('install-btn');
    const dismissBtn = document.getElementById('install-dismiss');

    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (localStorage.getItem('shelfie_install_dismissed')) return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installPrompt?.classList.remove('hidden');
    });

    installBtn?.addEventListener('click', async () => {
      if (!deferredPrompt) {
        alert('To install:\n\n1. Tap Share button\n2. Tap "Add to Home Screen"');
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installPrompt?.classList.add('hidden');
    });

    dismissBtn?.addEventListener('click', () => {
      installPrompt?.classList.add('hidden');
      localStorage.setItem('shelfie_install_dismissed', 'true');
    });
  }
}

const app = new BookShelf();
