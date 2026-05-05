const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

if (process.env.CONTEXT === 'deploy-preview') {
  const inject = `<script>(function(){var g=document.getElementById('login-gate'),r=document.getElementById('root');if(g&&r){g.style.display='none';r.style.display='';}})();<\/script>`;
  html = html.replace('</body>', inject + '</body>');
  console.log('✅ Preview bypass injected');
}

fs.writeFileSync(indexPath, html);
