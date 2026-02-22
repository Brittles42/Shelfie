const fs = require('fs');
const path = require('path');

// Create dist folder
const dist = path.join(__dirname, 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist);

// Copy files
const files = ['index.html', 'styles.css', 'app.js', 'manifest.json', 'sw.js'];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Inject API key into app.js
  if (f === 'app.js' && process.env.GEMINI_API_KEY) {
    content = `window.GEMINI_API_KEY = "${process.env.GEMINI_API_KEY}";\n` + content;
  }
  
  fs.writeFileSync(path.join(dist, f), content);
});

// Copy icons folder
const iconsDir = path.join(dist, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);
fs.readdirSync('icons').forEach(f => {
  fs.copyFileSync(path.join('icons', f), path.join(iconsDir, f));
});

console.log('Build complete!');
