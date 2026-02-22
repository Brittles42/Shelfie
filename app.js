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
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
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
    this.capturedImage = canvas.toDataURL('image/jpeg', 0.7);
    
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);
    
    document.getElementById('scan-status').textContent = 'Processing...';
    this.showLoading('Reading cover text...');

    try {
      // OCR the cover
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
      
      // Search for the book
      await this.searchBookByText(text);
    } catch (e) {
      console.error('OCR error:', e);
      this.hideLoading();
      // Even if OCR fails, let user add with just the photo
      this.showManualEntry();
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
  }

  confirmAddBook() {
    if (!this.pendingBook) return;
    
    // Check for editable fields
    const titleInput = document.getElementById('edit-title');
    const authorInput = document.getElementById('edit-author');
    
    if (titleInput) {
      this.pendingBook.title = titleInput.value || 'Untitled';
    }
    if (authorInput) {
      this.pendingBook.authors = authorInput.value ? [authorInput.value] : [];
    }
    
    this.pendingBook.addedAt = new Date().toISOString();
    this.pendingBook.id = Date.now().toString();
    
    this.books.unshift(this.pendingBook);
    this.saveBooks();
    this.renderLibrary();
    
    document.getElementById('confirm-modal').classList.remove('active');
    this.pendingBook = null;
    this.capturedImage = null;
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
