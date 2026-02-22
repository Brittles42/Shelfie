// Shelfie - Book Scanner PWA

class BookShelf {
  constructor() {
    this.books = [];
    this.currentBook = null;
    this.pendingBook = null;
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
      this.books = [];
    }
  }

  saveBooks() {
    localStorage.setItem('shelfie_books', JSON.stringify(this.books));
  }

  // Events
  bindEvents() {
    // Navigation
    document.getElementById('add-btn').addEventListener('click', () => this.showView('add-view'));
    document.getElementById('close-add').addEventListener('click', () => this.showView('library-view'));
    document.getElementById('timeline-btn').addEventListener('click', () => this.showView('timeline-view'));
    document.getElementById('close-timeline').addEventListener('click', () => this.showView('library-view'));
    document.getElementById('close-detail').addEventListener('click', () => this.showView('library-view'));
    document.getElementById('delete-book').addEventListener('click', () => this.deleteCurrentBook());
    document.getElementById('share-btn').addEventListener('click', () => this.shareShelf());

    // Add book options
    document.getElementById('camera-input').addEventListener('change', (e) => this.handleImage(e));
    document.getElementById('library-input').addEventListener('change', (e) => this.handleImage(e));
    document.getElementById('search-option').addEventListener('click', () => this.manualSearch());

    // Confirm modal
    document.getElementById('confirm-add').addEventListener('click', () => this.confirmAddBook());
    document.getElementById('confirm-cancel').addEventListener('click', () => this.hideModal());
  }

  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if (viewId === 'timeline-view') this.renderTimeline();
  }

  // Handle image from camera or library
  async handleImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    this.showLoading('Reading image...');

    try {
      // Convert to base64
      const base64 = await this.fileToBase64(file);
      this.capturedImage = base64;

      // Identify with Gemini
      this.updateLoading('Identifying book...');
      const bookInfo = await this.identifyBook(base64);

      if (bookInfo && bookInfo.title) {
        // Search for full details
        this.updateLoading('Getting details...');
        await this.searchAndConfirm(bookInfo);
      } else {
        this.hideLoading();
        this.showConfirmation({ title: '', authors: [], cover: base64 }, true);
      }
    } catch (e) {
      console.error('Error:', e);
      this.hideLoading();
      alert('Failed to process image: ' + e.message);
    }

    // Reset input
    event.target.value = '';
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Gemini Vision
  async identifyBook(base64Image) {
    const apiKey = this.getGeminiKey();
    if (!apiKey) return null;

    const base64Data = base64Image.split(',')[1];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'What book is this? Return ONLY JSON: {"title": "...", "author": "..."}' },
              { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
        })
      }
    );

    const data = await response.json();
    console.log('Gemini:', data);

    if (data.error) {
      throw new Error(data.error.message);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }

  getGeminiKey() {
    if (window.GEMINI_API_KEY) return window.GEMINI_API_KEY;
    
    let key = localStorage.getItem('shelfie_gemini_key');
    if (!key) {
      key = prompt('Enter your Gemini API key:\n(Free at aistudio.google.com)');
      if (key) localStorage.setItem('shelfie_gemini_key', key);
    }
    return key;
  }

  // Search Google Books
  async searchAndConfirm(bookInfo) {
    try {
      const query = `${bookInfo.title} ${bookInfo.author || ''}`;
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`
      );
      const data = await response.json();

      let book = { title: bookInfo.title, authors: bookInfo.author ? [bookInfo.author] : [] };
      
      if (data.items?.[0]) {
        const info = data.items[0].volumeInfo;
        book = {
          title: info.title || bookInfo.title,
          authors: info.authors || [],
          publishedDate: info.publishedDate,
          pageCount: info.pageCount,
          description: info.description
        };
      }

      book.cover = this.capturedImage;
      this.hideLoading();
      this.showConfirmation(book);
    } catch (e) {
      this.hideLoading();
      this.showConfirmation({
        title: bookInfo.title,
        authors: bookInfo.author ? [bookInfo.author] : [],
        cover: this.capturedImage
      });
    }
  }

  manualSearch() {
    const title = prompt('Enter book title:');
    if (!title?.trim()) return;

    this.showLoading('Searching...');
    this.searchByTitle(title.trim());
  }

  async searchByTitle(title) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=1`
      );
      const data = await response.json();

      if (data.items?.[0]) {
        const info = data.items[0].volumeInfo;
        const book = {
          title: info.title,
          authors: info.authors || [],
          publishedDate: info.publishedDate,
          pageCount: info.pageCount,
          description: info.description,
          cover: info.imageLinks?.thumbnail?.replace('http:', 'https:') || null
        };
        this.hideLoading();
        this.showView('library-view');
        this.showConfirmation(book);
      } else {
        this.hideLoading();
        alert('No book found');
      }
    } catch (e) {
      this.hideLoading();
      alert('Search failed');
    }
  }

  // Confirmation Modal
  showConfirmation(book, editable = false) {
    this.pendingBook = book;
    
    const coverHtml = book.cover 
      ? `<img src="${book.cover}" alt="Cover" class="confirm-cover">` 
      : '<div class="confirm-cover no-cover">No Cover</div>';

    document.getElementById('confirm-book-info').innerHTML = `
      ${coverHtml}
      ${editable ? `
        <input type="text" id="edit-title" value="${book.title}" placeholder="Book title" class="edit-input">
        <input type="text" id="edit-author" value="${book.authors?.join(', ') || ''}" placeholder="Author" class="edit-input">
      ` : `
        <h3>${book.title}</h3>
        <p class="subtle">${book.authors?.join(', ') || 'Unknown Author'}</p>
      `}
    `;

    document.getElementById('confirm-modal').classList.add('active');
    if (editable) document.getElementById('edit-title')?.focus();
  }

  hideModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    this.pendingBook = null;
    this.capturedImage = null;
  }

  confirmAddBook() {
    if (!this.pendingBook) return;

    // Get edited values if present
    const titleEl = document.getElementById('edit-title');
    const authorEl = document.getElementById('edit-author');
    
    if (titleEl) {
      const title = titleEl.value.trim();
      if (!title) {
        alert('Please enter a title');
        return;
      }
      this.pendingBook.title = title;
    }
    if (authorEl) {
      this.pendingBook.authors = authorEl.value.trim() ? [authorEl.value.trim()] : [];
    }

    this.pendingBook.id = Date.now().toString();
    this.pendingBook.addedAt = new Date().toISOString();

    this.books.unshift(this.pendingBook);
    this.saveBooks();
    this.renderLibrary();
    this.hideModal();
    this.showView('library-view');

    if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
  }

  // Library
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

    grid.innerHTML = this.books.map((book, i) => `
      <div class="book-card" data-index="${i}">
        ${book.cover 
          ? `<img src="${book.cover}" alt="${book.title}">` 
          : `<div class="no-cover">${book.title}</div>`}
      </div>
    `).join('');

    grid.querySelectorAll('.book-card').forEach(card => {
      card.addEventListener('click', () => this.showBookDetail(+card.dataset.index));
    });
  }

  showBookDetail(index) {
    this.currentBook = index;
    const book = this.books[index];

    document.getElementById('book-detail').innerHTML = `
      <div class="detail-cover">
        ${book.cover ? `<img src="${book.cover}">` : `<div class="no-cover">${book.title}</div>`}
      </div>
      <h2>${book.title}</h2>
      <p class="subtle">${book.authors?.join(', ') || 'Unknown Author'}</p>
      ${book.publishedDate ? `<p class="meta">Published: ${book.publishedDate}</p>` : ''}
      ${book.pageCount ? `<p class="meta">${book.pageCount} pages</p>` : ''}
      ${book.description ? `<p class="description">${book.description}</p>` : ''}
    `;

    this.showView('detail-view');
  }

  deleteCurrentBook() {
    if (this.currentBook === null) return;
    if (!confirm('Delete this book?')) return;

    this.books.splice(this.currentBook, 1);
    this.saveBooks();
    this.renderLibrary();
    this.showView('library-view');
  }

  // Timeline
  renderTimeline() {
    const container = document.getElementById('timeline-container');
    if (this.books.length === 0) {
      container.innerHTML = '<p class="empty-state">No books yet</p>';
      return;
    }

    const grouped = {};
    [...this.books].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)).forEach(book => {
      const date = new Date(book.addedAt);
      const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(book);
    });

    container.innerHTML = Object.entries(grouped).map(([month, books]) => `
      <div class="timeline-month">
        <h3>${month}</h3>
        ${books.map(book => `
          <div class="timeline-book">
            ${book.cover ? `<img src="${book.cover}">` : '<div class="no-cover-small"></div>'}
            <div>
              <div class="title">${book.title}</div>
              <div class="author">${book.authors?.[0] || ''}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  // Share
  async shareShelf() {
    if (this.books.length === 0) {
      alert('Add some books first!');
      return;
    }

    this.showLoading('Creating image...');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = 1080;
    const lineHeight = 70;
    const height = 250 + this.books.length * lineHeight;

    canvas.width = width;
    canvas.height = height;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📚 My Shelfie', width/2, 80);

    ctx.fillStyle = '#ffffff80';
    ctx.font = '28px sans-serif';
    ctx.fillText(`${this.books.length} books`, width/2, 130);

    // Books
    ctx.textAlign = 'left';
    this.books.forEach((book, i) => {
      const y = 200 + i * lineHeight;
      ctx.fillStyle = '#e94560';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(`${i+1}.`, 50, y);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '28px sans-serif';
      ctx.fillText(book.title.slice(0, 40), 90, y);
      
      ctx.fillStyle = '#ffffff80';
      ctx.font = '22px sans-serif';
      ctx.fillText(book.authors?.[0] || '', 90, y + 28);
    });

    // Footer
    ctx.fillStyle = '#ffffff40';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Made with Shelfie ✨', width/2, height - 30);

    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    this.hideLoading();

    // Share or download
    if (navigator.share) {
      try {
        await navigator.share({
          files: [new File([blob], 'my-shelfie.png', { type: 'image/png' })]
        });
      } catch (e) {
        this.downloadBlob(blob);
      }
    } else {
      this.downloadBlob(blob);
    }
  }

  downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-shelfie.png';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Loading
  showLoading(text) {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading').classList.add('active');
  }

  updateLoading(text) {
    document.getElementById('loading-text').textContent = text;
  }

  hideLoading() {
    document.getElementById('loading').classList.remove('active');
  }

  // Service Worker
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js');
    }
  }
}

new BookShelf();
