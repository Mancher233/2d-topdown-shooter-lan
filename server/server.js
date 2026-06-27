// server/server.js
// =============================================================================
// WebSocket 中继服务器 (Relay Server)
// 这个服务器做两件事：
//   1. 把根目录的静态文件（index.html、js/、css/）发送给浏览器
//   2. 在两个玩家之间转发 WebSocket 消息（不做任何游戏逻辑）
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// ---- 第一部分：静态文件服务器 ----

// 静态文件的根目录是 server/ 的上一级（即项目根目录）
const STATIC_ROOT = path.join(__dirname, '..');

// 根据文件后缀名返回正确的 MIME 类型（浏览器需要这个来正确解析文件）
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.gif':  'image/gif',
    '.ico':  'image/x-icon',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// 创建 HTTP 服务器：收到请求时，找到对应的静态文件并返回
const server = http.createServer((req, res) => {
  // 把 URL 映射到文件路径（例如 "/" -> "/index.html"）
  let urlPath = req.url.split('?')[0]; // 去掉查询参数
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(STATIC_ROOT, urlPath);

  // 安全检查：确保文件路径不会跑到项目根目录之外
  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // 读取文件并发送给浏览器
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found: ' + urlPath);
      return;
    }
    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    res.end(data);
  });
});

// ---- 第二部分：WebSocket 中继 ----

const PORT = 3000;

// 在同一个 HTTP 服务器上创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// 记录已连接的玩家
let players = [];   // 最多 2 个玩家
let nextId = 1;     // 玩家编号：1 或 2

wss.on('connection', (ws) => {
  // 给新连接的玩家分配 ID
  const playerId = 'player' + nextId;
  nextId++;
  players.push({ id: playerId, ws: ws });

  console.log('[Server] ' + playerId + ' connected. Total players: ' + players.length);

  // 告诉这个玩家他的 ID 和当前人数
  ws.send(JSON.stringify({
    type: 'welcome',
    id: playerId,
    playerCount: players.length
  }));

  // 如果已经有 2 个玩家了，通知双方游戏可以开始
  if (players.length === 2) {
    players.forEach(p => {
      p.ws.send(JSON.stringify({ type: 'gameStart', yourId: p.id }));
    });
    console.log('[Server] 2 players connected. Game starting!');
  }

  // 当收到玩家的消息时，转发给另一个玩家
  ws.on('message', (rawMsg) => {
    players.forEach(p => {
      if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(rawMsg.toString());
      }
    });
  });

  // 当玩家断开连接时，从列表中移除
  ws.on('close', () => {
    players = players.filter(p => p.ws !== ws);
    console.log('[Server] ' + playerId + ' disconnected. Remaining: ' + players.length);

    // 通知剩下的玩家对手离开了
    players.forEach(p => {
      p.ws.send(JSON.stringify({ type: 'opponentLeft' }));
    });

    // 重置 ID 分配——找到最低可用的编号
    if (players.length === 0) {
      nextId = 1;
    } else {
      var usedIds = players.map(function(p) { return p.id; });
      nextId = usedIds.indexOf('player1') >= 0 ? 2 : 1;
    }
  });
});

// ---- 启动服务器 ----

server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================');
  console.log('  2D Top-Down Shooter Server Running!');
  console.log('  Open http://localhost:' + PORT);
  console.log('========================================');
});
