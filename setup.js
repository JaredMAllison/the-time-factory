const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

const DEFAULT_CATEGORIES = [
  { name: 'Self-Care',      color: '#4fc3f7' },
  { name: 'Community',      color: '#ab47bc' },
  { name: 'Productivity',   color: '#ffb300' },
  { name: 'Infrastructure', color: '#4db6ac' },
  { name: 'Personal',       color: '#81c784' },
];

async function setup() {
  console.log('\n=== Welcome to The Time Factory ===\n');
  console.log('This wizard will set up your personal installation.\n');

  const displayName = await ask('What would you like to call your calendar? [My Time Factory]: ');
  const port        = await ask('Which port should the server run on? [3000]: ');
  const soundAnswer = await ask('Enable startup sounds? [Y/n]: ');

  const config = {
    port:         parseInt(port) || 3000,
    host:         '0.0.0.0',
    displayName:  displayName.trim() || 'My Time Factory',
    soundEnabled: soundAnswer.trim().toLowerCase() !== 'n',
    categories:   DEFAULT_CATEGORIES,
  };

  const configPath = path.join(__dirname, 'config', 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('\nSetup complete. Your config has been saved.');
  console.log('Tip: edit config/config.json to customize category names and colors.');
  console.log('Run "npm start" to launch your Time Factory.\n');

  rl.close();
}

setup();
