// The original core remains the source of truth for both preview and WeChat.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
const files = [
  ...fs.readdirSync(path.join(root, 'miniprogram/core')).filter(name => name.endsWith('.js')).map(name => `core/${name}`),
  ...fs.readdirSync(path.join(root, 'miniprogram/assets/audio')).filter(name => name.endsWith('.wav')).map(name => `assets/audio/${name}`)
];
let bytes = 0;
for (const relative of files) {
  const source = path.join(root, 'miniprogram', relative), target = path.join(root, 'minigame', relative);
  const content = fs.readFileSync(source);
  if (check) {
    if (!fs.existsSync(target) || !content.equals(fs.readFileSync(target))) throw new Error(`小游戏资源需要更新：${relative}`);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  bytes += content.length;
}
console.log(`${check ? '校验' : '生成'}微信小游戏共享模块和音频：${files.length} 个文件，${bytes} 字节`);
