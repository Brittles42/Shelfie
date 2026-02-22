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
    // Navigation
    document.getElementById('scan-btn').addEventListener('click', () => this.openScanner());
    document.getElementById('close-scanner').addEventListener('click', () => this.closeScanner());
    document.getElementById('timeline-btn').addEventListener('click', () => this.showView('timeline-view'));
    document.getElementById('close-timeline').addEventListener('click', () => this.showView('library-view'));
    document.getElementById('close-detail').addEventListener('click', () => this.showView('library-view'));
    document.getElementById('delete-book').addEventListener('click', () => this.deleteCurrentBook());

    // Capture on tap
    document.getElementById('scanner-container').addEventListener('click', () => this.captureAndProcess());

    // Manual search
    document.getElementById('manual-search-btn')?.addEventListener('click', () => this.showManualSearch());

    // Confirmation modal
    document.getElementById('confirm-add').addEventListener('click', () => this.confirmAddBook());
    document.getElementById('confirm-cancel').addEventListener('click', () => this.hideModal());
  }

  // Views
  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    if (viewId === 'timeline-view') {
      this.renderTimeline();
    }
  }

  // Library Rendering
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

  // Book Detail
  showBookDetail(index) {
    this.currentBook = index;
    const book = this.books[index];
    
    document.getElementById('book-detail').innerHTML = `
      <div class="detail-cover">
        ${book.cover 
          ? `<img src="${book.cover}" alt="${book.title}">` 
          : `<div class="no-cover" style="height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-surface)">${book.title}</div>`
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
      
      ${book.description ? `
        <p class="detail-description">${book.description}</p>
      ` : ''}
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

  // Timeline
  renderTimeline() {
    const container = document.getElementById('timeline-container');
    
    if (this.books.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No books in your timeline yet</p></div>';
      return;
    }

    // Group by month
    const grouped = {};
    const sortedBooks = [...this.books].sort((a, b) => 
      new Date(b.addedAt) - new Date(a.addedAt)
    );

    sortedBooks.forEach((book, i) => {
      const date = new Date(book.addedAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      if (!grouped[key]) {
        grouped[key] = { label, books: [] };
      }
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
                  ${book.cover 
                    ? `<img src="${book.cover}" alt="${book.title}">` 
                    : `<div class="no-cover" style="height:100%;background:var(--bg-surface);font-size:8px;display:flex;align-items:center;justify-content:center;padding:4px;text-align:center">${book.title}</div>`
                  }
                </div>
                <div class="timeline-book-info">
                  <div class="timeline-book-title">${book.title}</div>
                  <div class="timeline-book-author">${book.authors?.[0] || 'Unknown'}</div>
                  <div class="timeline-book-date">${new Date(book.addedAt).toLocaleDateString()}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.timeline-book').forEach(el => {
      el.addEventListener('click', () => {
        this.showBookDetail(parseInt(el.dataset.index));
      });
    });
  }

  // Scanner
  async openScanner() {
    this.showView('scanner-view');
    await this.startCamera();
  }

  async startCamera() {
    try {
      // Portrait orientation for books (height > width)
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 720 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 0.5625 } // 9:16 portrait
        }
      });
      document.getElementById('camera').srcObject = this.stream;
      document.getElementById('scan-status').textContent = 'Point at book cover';
    } catch (e) {
      console.error('Camera error:', e);
      alert('Could not access camera. Please grant camera permission.');
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
    
    // Capture the frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    // Save as thumbnail (compressed)
    this.capturedImage = canvas.toDataURL('image/jpeg', 0.8);
    
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);
    
    document.getElementById('scan-status').textContent = 'Identifying book...';
    this.showLoading('Reading cover...');
    
    try {
      const bookInfo = await this.identifyBook();
      
      if (bookInfo && bookInfo.title) {
        // Got it! Search for full metadata
        document.getElementById('loading-text').textContent = 'Finding details...';
        await this.searchAndConfirm(bookInfo);
      } else {
        // Couldn't identify - manual fallback
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
    if (!apiKey) return null;

    try {
      const base64Data = this.capturedImage.split(',')[1];
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: 'What book is this? Return ONLY valid JSON: {"title": "...", "author": "..."}. No markdown, no explanation.' },
                { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
              ]
            }]
          })
        }
      );
      
      const data = await response.json();
      
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const text = data.candidates[0].content.parts[0].text;
        const jsonMatch = text.match(/\{[^}]+\}/s);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
      return null;
    } catch (e) {
      console.error('Gemini error:', e);
      return null;
    }
  }

  getGeminiKey() {
    let key = localStorage.getItem('shelfie_gemini_key');
    if (!key) {
      key = prompt('Enter your Gemini API key (free at aistudio.google.com):');
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
      
      book.cover = this.capturedImage;
      this.hideLoading();
      this.showConfirmation(book);
    } catch (e) {
      console.error('Search error:', e);
      this.hideLoading();
      const book = {
        title: bookInfo.title,
        authors: bookInfo.author ? [bookInfo.author] : [],
        cover: this.capturedImage
      };
      this.showConfirmation(book);
    }
  }

  async searchBookByText(text) {
    // Clean up OCR text - get the most prominent lines (likely title/author)
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(line => line.length > 2 && !/^[\d\W]+$/.test(line));
    
    // Take first few meaningful lines as search query
    const searchQuery = lines.slice(0, 4).join(' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log('Search query:', searchQuery);

    if (!searchQuery || searchQuery.length < 3) {
      this.hideLoading();
      this.showManualEntry();
      return;
    }

    document.getElementById('loading-text').textContent = 'Searching for book...';

    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}&maxResults=5`
      );
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        // Show best match, use our captured image as cover
        const book = this.parseGoogleBook(data.items[0]);
        book.cover = this.capturedImage; // Use photo as thumbnail!
        this.hideLoading();
        this.showConfirmation(book);
      } else {
        this.hideLoading();
        this.showManualEntry();
      }
    } catch (e) {
      console.error('Search error:', e);
      this.hideLoading();
      this.showManualEntry();
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
    // Fallback - add book with just the photo
    const book = {
      title: 'Unknown Book',
      authors: [],
      cover: this.capturedImage
    };
    this.showConfirmation(book, true);
  }

  showManualSearch() {
    const title = prompt('Enter book title:');
    if (!title) return;
    
    this.showLoading('Searching...');
    this.searchBookByTitle(title);
  }

  async searchBookByTitle(title) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=5`
      );
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const book = this.parseGoogleBook(data.items[0]);
        // Use Google's cover since we didn't take a photo
        const info = data.items[0].volumeInfo;
        book.cover = info.imageLinks?.thumbnail?.replace('http:', 'https:') || 
                     info.imageLinks?.smallThumbnail?.replace('http:', 'https:') || null;
        this.hideLoading();
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

  // Confirmation
  showConfirmation(book, editable = false) {
    this.pendingBook = book;
    
    document.getElementById('confirm-book-info').innerHTML = `
      <img src="${book.cover || ''}" alt="Cover">
      ${editable ? `
        <input type="text" id="edit-title" value="${book.title}" placeholder="Book title">
        <input type="text" id="edit-author" value="${book.authors?.join(', ') || ''}" placeholder="Author">
      ` : `
        <h3>${book.title}</h3>
        <p>${book.authors?.join(', ') || 'Unknown Author'}</p>
      `}
    `;
    
    document.getElementById('confirm-modal').classList.add('active');
  }

  hideModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    this.pendingBook = null;
    this.capturedImage = null;
    this.searchResults = null;
    // Go back to scanner or library
    if (this.stream) {
      document.getElementById('scan-status').textContent = 'Point at book cover';
    }
  }

  confirmAddBook() {
    // If no book selected yet, use the typed title
    if (!this.pendingBook) {
      const titleInput = document.getElementById('quick-title');
      const title = titleInput?.value?.trim();
      
      if (!title) {
        alert('Please enter a book title or select from search results');
        return;
      }
      
      this.pendingBook = {
        title: title,
        authors: [],
        cover: this.capturedImage
      };
    }
    
    this.pendingBook.addedAt = new Date().toISOString();
    this.pendingBook.id = Date.now().toString();
    
    this.books.unshift(this.pendingBook);
    this.saveBooks();
    this.renderLibrary();
    
    document.getElementById('confirm-modal').classList.remove('active');
    this.pendingBook = null;
    this.capturedImage = null;
    this.searchResults = null;
    this.showView('library-view');
    
    // Celebration feedback
    if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
  }

  // Loading
  showLoading(text = 'Loading...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading').classList.add('active');
  }

  hideLoading() {
    document.getElementById('loading').classList.remove('active');
  }

  // Service Worker & Install
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered');
      } catch (e) {
        console.error('SW registration failed:', e);
      }
    }
    
    // Install prompt
    this.setupInstallPrompt();
  }

  setupInstallPrompt() {
    let deferredPrompt;
    const installPrompt = document.getElementById('install-prompt');
    const installBtn = document.getElementById('install-btn');
    const dismissBtn = document.getElementById('install-dismiss');

    // Check if already installed or dismissed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return; // Already installed
    }
    if (localStorage.getItem('shelfie_install_dismissed')) {
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installPrompt.classList.remove('hidden');
    });

    installBtn?.addEventListener('click', async () => {
      if (!deferredPrompt) {
        // Show manual instructions for iOS
        alert('To install:\n\n1. Tap the Share button\n2. Tap "Add to Home Screen"');
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        installPrompt.classList.add('hidden');
      }
      deferredPrompt = null;
    });

    dismissBtn?.addEventListener('click', () => {
      installPrompt.classList.add('hidden');
      localStorage.setItem('shelfie_install_dismissed', 'true');
    });

    // Show prompt after a delay if on mobile and not installed
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      setTimeout(() => {
        if (!window.matchMedia('(display-mode: standalone)').matches) {
          installPrompt.classList.remove('hidden');
        }
      }, 3000);
    }
  }
}

// Initialize app
const app = new BookShelf();
