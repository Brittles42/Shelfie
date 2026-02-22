// Shelfie - Book Scanner PWA

class BookShelf {
  constructor() {
    this.books = [];
    this.currentBook = null;
    this.pendingBook = null;
    this.scanMode = 'auto';
    this.stream = null;
    this.scanning = false;
    this.ocrWorker = null;
    
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

    // Scan modes
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.scanMode = e.target.dataset.mode;
      });
    });

    // Confirmation modal
    document.getElementById('confirm-add').addEventListener('click', () => this.confirmAddBook());
    document.getElementById('confirm-cancel').addEventListener('click', () => this.hideModal());

    // Manual capture for cover mode
    document.getElementById('scanner-container').addEventListener('click', () => {
      if (this.scanMode === 'cover') {
        this.captureAndOCR();
      }
    });
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
        ${book.isbn ? `
          <div class="detail-meta-row">
            <span class="detail-meta-label">ISBN</span>
            <span>${book.isbn}</span>
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
    this.startScanning();
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      document.getElementById('camera').srcObject = this.stream;
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
    this.stopScanning();
    this.stopCamera();
    this.showView('library-view');
  }

  startScanning() {
    this.scanning = true;
    this.scanLoop();
  }

  stopScanning() {
    this.scanning = false;
  }

  async scanLoop() {
    if (!this.scanning) return;

    const video = document.getElementById('camera');
    const canvas = document.getElementById('scan-canvas');
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      if (this.scanMode === 'auto' || this.scanMode === 'barcode') {
        const barcode = await this.detectBarcode(canvas);
        if (barcode) {
          this.onBarcodeDetected(barcode);
          return;
        }
      }
    }

    requestAnimationFrame(() => this.scanLoop());
  }

  async detectBarcode(canvas) {
    return new Promise((resolve) => {
      // Use Quagga for barcode detection
      Quagga.decodeSingle({
        src: canvas.toDataURL(),
        numOfWorkers: 0,
        decoder: {
          readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader']
        },
        locate: true
      }, (result) => {
        if (result && result.codeResult) {
          resolve(result.codeResult.code);
        } else {
          resolve(null);
        }
      });
    });
  }

  async onBarcodeDetected(isbn) {
    this.stopScanning();
    document.getElementById('scan-status').textContent = `Found: ${isbn}`;
    
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(100);
    
    await this.lookupBook(isbn);
  }

  async captureAndOCR() {
    if (!this.scanning) return;
    this.stopScanning();
    
    document.getElementById('scan-status').textContent = 'Reading cover...';
    this.showLoading('Extracting text from cover...');

    const video = document.getElementById('camera');
    const canvas = document.getElementById('scan-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    try {
      // Initialize Tesseract worker if needed
      const result = await Tesseract.recognize(canvas, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            document.getElementById('loading-text').textContent = 
              `Reading... ${Math.round(m.progress * 100)}%`;
          }
        }
      });

      const text = result.data.text;
      console.log('OCR Result:', text);
      
      // Try to extract title and author
      await this.searchBookByText(text);
    } catch (e) {
      console.error('OCR error:', e);
      this.hideLoading();
      alert('Could not read the cover. Try the barcode instead.');
      this.startScanning();
    }
  }

  async searchBookByText(text) {
    // Clean up OCR text and search
    const cleanText = text
      .split('\n')
      .filter(line => line.trim().length > 3)
      .slice(0, 3)
      .join(' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim();

    if (!cleanText) {
      this.hideLoading();
      alert('Could not extract text. Try again or use barcode.');
      this.startScanning();
      return;
    }

    document.getElementById('loading-text').textContent = 'Searching for book...';

    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(cleanText)}&maxResults=1`
      );
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const book = this.parseGoogleBook(data.items[0]);
        this.hideLoading();
        this.showConfirmation(book);
      } else {
        this.hideLoading();
        alert('No book found. Try barcode scanning.');
        this.startScanning();
      }
    } catch (e) {
      console.error('Search error:', e);
      this.hideLoading();
      alert('Search failed. Check your connection.');
      this.startScanning();
    }
  }

  async lookupBook(isbn) {
    this.showLoading('Looking up book...');

    try {
      // Try Google Books API
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
      );
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const book = this.parseGoogleBook(data.items[0]);
        book.isbn = isbn;
        this.hideLoading();
        this.showConfirmation(book);
      } else {
        // Try Open Library as fallback
        await this.lookupOpenLibrary(isbn);
      }
    } catch (e) {
      console.error('Lookup error:', e);
      this.hideLoading();
      alert('Could not look up book. Check your connection.');
      this.startScanning();
    }
  }

  async lookupOpenLibrary(isbn) {
    try {
      const response = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`
      );
      const data = await response.json();
      const key = `ISBN:${isbn}`;

      if (data[key]) {
        const item = data[key];
        const book = {
          title: item.title,
          authors: item.authors?.map(a => a.name) || [],
          cover: item.cover?.medium || item.cover?.small || null,
          publishedDate: item.publish_date,
          pageCount: item.number_of_pages,
          isbn: isbn
        };
        this.hideLoading();
        this.showConfirmation(book);
      } else {
        this.hideLoading();
        alert(`No book found for ISBN: ${isbn}`);
        this.startScanning();
      }
    } catch (e) {
      this.hideLoading();
      alert('Could not look up book.');
      this.startScanning();
    }
  }

  parseGoogleBook(item) {
    const info = item.volumeInfo;
    return {
      title: info.title,
      authors: info.authors || [],
      cover: info.imageLinks?.thumbnail?.replace('http:', 'https:') || 
             info.imageLinks?.smallThumbnail?.replace('http:', 'https:') || null,
      publishedDate: info.publishedDate,
      pageCount: info.pageCount,
      description: info.description,
      categories: info.categories
    };
  }

  // Confirmation
  showConfirmation(book) {
    this.pendingBook = book;
    
    document.getElementById('confirm-book-info').innerHTML = `
      ${book.cover ? `<img src="${book.cover}" alt="${book.title}">` : ''}
      <h3>${book.title}</h3>
      <p>${book.authors?.join(', ') || 'Unknown Author'}</p>
    `;
    
    document.getElementById('confirm-modal').classList.add('active');
  }

  hideModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    this.pendingBook = null;
    this.startScanning();
  }

  confirmAddBook() {
    if (!this.pendingBook) return;
    
    this.pendingBook.addedAt = new Date().toISOString();
    this.pendingBook.id = Date.now().toString();
    
    this.books.unshift(this.pendingBook);
    this.saveBooks();
    this.renderLibrary();
    
    document.getElementById('confirm-modal').classList.remove('active');
    this.pendingBook = null;
    this.closeScanner();
    
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

  // Service Worker
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered');
      } catch (e) {
        console.error('SW registration failed:', e);
      }
    }
  }
}

// Initialize app
const app = new BookShelf();
