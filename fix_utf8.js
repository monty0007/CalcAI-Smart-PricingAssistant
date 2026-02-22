const fs = require('fs');
const file = 'c:/Users/monty/Desktop/Azure Pricing Calc/frontend/src/pages/VmComparisonPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// The mangled strings seen in the file
content = content.replace(/—€”/g, '—');
content = content.replace(/â€”/g, '—');
content = content.replace(/—†’/g, '→');

// Fix the '€' headers by just putting ─ 
content = content.replace(/\"€\"€/g, '──');
content = content.replace(/\"€\"/g, '─');
content = content.replace(/€/g, '─');

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed encodings with Node');
