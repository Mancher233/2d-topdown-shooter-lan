// js/clientGame.js
// =============================================================================
// 加入者游戏逻辑 (Client / Joiner Game)
// 加入者不运行任何游戏模拟！
// 它只负责：
//   1. 读取本地输入，发送给房主
//   2. 接收房主发来的游戏状态
//   3. 渲染收到的游戏状态
// 这种"傻瓜渲染器"方式非常简洁，避免了同步问题。
// =============================================================================

var ClientGame = (function () {

  // ---- 游戏状态 ----
  var canvas, ctx;
  var myId;                   // 我自己的 ID（通常是 'player2'）
  var lastTime = 0;

  // 从房主收到的最新游戏状态
  var receivedState = null;   // { players: [...], bullets: [...], grenades: [...] }

  // 本地玩家的引用（从 receivedState 中找到）
  var localPlayer = null;

  // G 键的防连按标记
  var gKeyWasDown = false;
  var running = false;  // 游戏循环是否正在运行

  // ---- 本地冷却追踪 ----
  // 手雷冷却在本地计算，不通过网络同步
  var localGrenadeTimer = 0;  // 手雷冷却剩余时间（秒）
  // 加入者用这个来限制发送射击事件的频率（匹配房主的 FIRE_INTERVAL）
  var localShootTimer = 0;

  // ---- 本地热量追踪 ----
  // 热量不通过网络同步，每个客户端自己计算自己的热量
  var localHeat = 0;          // 本地热量（0 ~ MAX_HEAT）
  var localOverheated = false; // 本地过热状态
  var localCoolDelay = 0;     // 射击后 0.1 秒内不自然冷却

  // ---- 击杀检测（客户端本地） ----
  var prevAlive = {};  // 上一帧各玩家存活状态 { player1: bool, player2: bool }

  // ---- 视线计算节流（高刷新率显示器优化） ----
  var cachedVisionPoints = null;
  var lastVisionTime = 0;
  var VISION_UPDATE_INTERVAL = 1 / 60;  // 最多 60 次/秒

  /**
   * 启动游戏（由 index.html 中的 startGame() 调用）
   */
  function start(canvasEl, playerId) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    myId = playerId;

    lastTime = performance.now();
    running = true;
    startAntiThrottle();
    requestAnimationFrame(gameLoop);
  }

  /**
   * 反浏览器节流机制（与房主端相同）
   * 防止切换标签页时游戏循环被浏览器降速
   */
  function startAntiThrottle() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var audioCtx = new AudioCtx();
      var oscillator = audioCtx.createOscillator();
      var gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.001;
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
    } catch (e) {
      console.warn('[ClientGame] Anti-throttle failed:', e);
    }
  }

  /**
   * 处理网络消息（从房主发来的游戏状态）
   */
  function onNetworkMessage(data) {
    if (data.type === 'state') {
      receivedState = data.state;
    }
    // 处理房主发来的语音事件（双方都能听到的语音）
    if (data.type === 'voice') {
      Assets.playVoice(data.voiceId);
    }
  }

  // ==========================================================================
  // 主循环
  // ==========================================================================
  function gameLoop(timestamp) {
    if (!running) return;  // 如果被取消了就停止
    var dt = (timestamp - lastTime) / 1000;
    if (dt > 1 / 30) dt = 1 / 30;
    lastTime = timestamp;

    sendInput(dt);
    render(timestamp);

    requestAnimationFrame(gameLoop);
  }

  // ==========================================================================
  // 发送本地输入给房主
  // ==========================================================================
  function sendInput(dt) {
    if (!receivedState) return;

    // 找到本地玩家对象（用于计算瞄准角度）
    findLocalPlayer();
    if (!localPlayer) return;

    // 计算相机偏移
    var camX = localPlayer.x - canvas.width / 2;
    var camY = localPlayer.y - canvas.height / 2;

    // 计算瞄准角度
    var aimAngle = Input.getAimAngle(localPlayer.x, localPlayer.y, camX, camY);

    // 收集当前按下的键
    var keysList = [];
    ['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].forEach(function (k) {
      if (Input.isKeyDown(k)) keysList.push(k);
    });

    // 发送输入状态
    Network.sendInput(keysList, Input.getMousePos().x, Input.getMousePos().y, Input.isMouseDown(), aimAngle);

    // 全自动射击：按住左键连续射击 + 未过热
    var didShoot = false;
    localShootTimer -= dt;
    if (Input.isMouseDown() && localShootTimer <= 0 && localPlayer.alive && !localOverheated) {
      Network.sendAction('shoot', { angle: aimAngle });
      localShootTimer = Bullet.FIRE_INTERVAL;
      didShoot = true;
    }

    // 检测扔手雷（G 键，按一下扔一个）
    if (Input.isKeyDown('g') && !gKeyWasDown && localPlayer.alive && localGrenadeTimer <= 0) {
      var wm = Input.getWorldMouse(camX, camY);
      Network.sendAction('throw', { targetX: wm.x, targetY: wm.y });
      localGrenadeTimer = Grenade.COOLDOWN;  // 本地开始冷却
    }
    gKeyWasDown = Input.isKeyDown('g');

    // 本地手雷冷却更新
    if (localGrenadeTimer > 0) {
      localGrenadeTimer -= dt;
      if (localGrenadeTimer < 0) localGrenadeTimer = 0;
    }

    // ---- 本地热量更新 ----
    // 热量不通过网络同步，加入者自己计算自己的热量
    // 检查无热量 buff（从房主同步的玩家对象中获取）
    var hasNoHeatBuff = localPlayer && localPlayer.noHeatBuffTimer > 0;
    if (didShoot) {
      // 无热量 buff 期间不增加热量
      if (!hasNoHeatBuff) {
        localHeat += Player.HEAT_PER_SHOT;
        if (localHeat >= Player.MAX_HEAT) {
          localHeat = Player.MAX_HEAT;
          localOverheated = true;
        }
      }
      localCoolDelay = Player.SHOT_COOL_DELAY;  // 射击后短暂禁止自然冷却
    } else if (localHeat > 0) {
      if (localCoolDelay > 0) {
        localCoolDelay -= dt;
        if (localCoolDelay < 0) localCoolDelay = 0;
      } else {
        var coolRate = localOverheated ? 7 : 10;  // 过热 7度/秒，正常 10度/秒
        localHeat -= coolRate * dt;
        if (localHeat <= 0) {
          localHeat = 0;
          localOverheated = false;  // 完全冷却，解除过热
        }
      }
    }
  }

  // ==========================================================================
  // 渲染
  // ==========================================================================
  function render(timestamp) {
    var cw = canvas.width;
    var ch = canvas.height;

    // 如果还没收到状态，显示等待画面
    if (!receivedState) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#fff';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待游戏状态...', cw / 2, ch / 2);
      ctx.textAlign = 'left';
      return;
    }

    findLocalPlayer();
    if (!localPlayer) return;

    var players = receivedState.players;
    var bullets = receivedState.bullets;
    var grenades = receivedState.grenades;

    // 为玩家对象设置精灵图片（每帧都要设置，因为 receivedState 每次更新都是新对象）
    applySprites(players);

    // ---- 客户端击杀检测 ----
    for (var pi = 0; pi < players.length; pi++) {
      var p = players[pi];
      var wasAlive = prevAlive[p.id];
      if (wasAlive === true && !p.alive) {
        // 某个玩家刚刚死亡
        if (p.id === myId) {
          // 本地玩家（科比）被击杀——死亡语音已由房主同步播放
          // 这里不需要额外处理（房主会发送 kobe3）
        } else {
          // 房主被击杀——科比击杀了房主，本地播放击杀语音（不同步）
          Assets.playVoice('kobe4');
        }
      }
      prevAlive[p.id] = p.alive;
    }

    // 相机跟随本地玩家
    var camX = localPlayer.x - cw / 2;
    var camY = localPlayer.y - ch / 2;

    // 清空画布
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cw, ch);

    // 应用相机变换
    ctx.save();
    ctx.translate(-camX, -camY);

    // 1. 画地图
    GameMap.drawMap(ctx);

    // 2. 画手雷
    for (var i = 0; i < grenades.length; i++) {
      Grenade.drawGrenade(ctx, grenades[i]);
    }

    // 3. 画子弹
    for (var i = 0; i < bullets.length; i++) {
      Bullet.drawBullet(ctx, bullets[i]);
    }

    // 4. 画玩家
    for (var i = 0; i < players.length; i++) {
      Player.drawPlayer(ctx, players[i]);
    }

    // 5. 画十字准星
    var wm = Input.getWorldMouse(camX, camY);
    Player.drawCrosshair(ctx, wm.x, wm.y);

    ctx.restore();

    // 6. 战争迷雾（基于本地玩家的视线）—— 节流到 ~60Hz
    if (!cachedVisionPoints || (timestamp - lastVisionTime) >= (VISION_UPDATE_INTERVAL * 1000)) {
      cachedVisionPoints = Vision.computeVision(localPlayer.x, localPlayer.y);
      lastVisionTime = timestamp;
    }
    var screenPts = Vision.worldToScreenPoints(cachedVisionPoints, camX, camY);
    Vision.drawFog(ctx, screenPts, cw, ch);

    // 7. HUD
    drawHUD(cw, ch, players, bullets, grenades);
  }

  /**
   * 从收到的状态中找到本地玩家对象
   */
  function findLocalPlayer() {
    if (!receivedState || !receivedState.players) return;
    for (var i = 0; i < receivedState.players.length; i++) {
      if (receivedState.players[i].id === myId) {
        localPlayer = receivedState.players[i];
        return;
      }
    }
  }

  /**
   * 为收到的玩家对象设置精灵图片
   * 房主（player1）= 张雪峰，加入者（player2）= 科比
   * 同时设置手雷精灵
   */
  function applySprites(players) {
    var zxfImg = Assets.getImage('zxf');
    var kobeImg = Assets.getImage('kobe');
    var qlzImg = Assets.getImage('qlz');
    var lqImg = Assets.getImage('lq');

    for (var i = 0; i < players.length; i++) {
      if (players[i].id === 'player1') {
        Player.setSprite(players[i], zxfImg);
      } else {
        Player.setSprite(players[i], kobeImg);
      }
    }

    // 设置手雷精灵
    Grenade.setSprites({
      'player1': qlzImg,
      'player2': lqImg
    });
  }

  // ---- HUD ----
  function drawHUD(cw, ch, players, bullets, grenades) {
    if (!localPlayer) return;

    var barX = 20;
    var barY = ch - 60;
    var barW = 200;
    var barH = 20;

    // 血量条
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    var hpRatio = localPlayer.hp / localPlayer.maxHp;
    ctx.fillStyle = hpRatio > 0.3 ? '#43a047' : '#e53935';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('HP: ' + localPlayer.hp + ' / ' + localPlayer.maxHp, barX + 5, barY + 15);

    // -- 热量条（在血量条下方） --
    var heatY = barY + barH + 5;
    var heatH = 14;
    var heatRatio = localHeat / Player.MAX_HEAT;

    // 背景
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, heatY, barW, heatH);

    // 根据热量水平选择颜色（与房主端相同的逻辑）
    var heatColor;
    var warnThreshold = Player.MAX_HEAT * 0.8;
    if (localOverheated) {
      var pulse = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 150));
      ctx.globalAlpha = pulse;
      heatColor = '#ff1744';
    } else if (localHeat >= warnThreshold) {
      var t = (localHeat - warnThreshold) / (Player.MAX_HEAT - warnThreshold);
      heatColor = lerpColor('#ff9800', '#f44336', t);
    } else {
      var t = localHeat / warnThreshold;
      heatColor = lerpColor('#ffeb3b', '#ff9800', t);
    }

    ctx.fillStyle = heatColor;
    ctx.fillRect(barX, heatY, barW * heatRatio, heatH);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, heatY, barW, heatH);

    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    var heatText = 'HEAT: ' + Math.round(localHeat) + ' / ' + Player.MAX_HEAT;
    if (localOverheated) heatText += ' 过热！';
    ctx.fillText(heatText, barX + 5, heatY + 11);

    // 翻滚冷却
    var rollY = barY - 25;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, rollY, barW, 10);
    var rollCdRatio = 1 - (localPlayer.rollCooldown / Player.ROLL_COOLDOWN);
    ctx.fillStyle = rollCdRatio >= 1 ? '#42a5f5' : '#666';
    ctx.fillRect(barX, rollY, barW * rollCdRatio, 10);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText('翻滚 [空格]', barX, rollY - 3);

    // 手雷冷却（加入者本地追踪）
    var grenadeY = rollY - 25;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, grenadeY, barW, 10);
    var gReadyRatio = 1 - (localGrenadeTimer / Grenade.COOLDOWN);
    if (gReadyRatio < 0) gReadyRatio = 0;
    if (gReadyRatio > 1) gReadyRatio = 1;
    ctx.fillStyle = gReadyRatio >= 1 ? '#66bb6a' : '#666';
    ctx.fillRect(barX, grenadeY, barW * gReadyRatio, 10);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText('手雷 [G]', barX, grenadeY - 3);

    // 死亡提示
    if (!localPlayer.alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, ch / 2 - 30, cw, 60);
      ctx.fillStyle = '#fff';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('你被击败了！重生中...', cw / 2, ch / 2 + 8);
      ctx.textAlign = 'left';
    }
  }

  /**
   * 颜色线性插值辅助函数（与房主端相同）
   */
  function lerpColor(c1, c2, t) {
    var r1 = parseInt(c1.slice(1, 3), 16);
    var g1 = parseInt(c1.slice(3, 5), 16);
    var b1 = parseInt(c1.slice(5, 7), 16);
    var r2 = parseInt(c2.slice(1, 3), 16);
    var g2 = parseInt(c2.slice(3, 5), 16);
    var b2 = parseInt(c2.slice(5, 7), 16);
    var r = Math.round(r1 + (r2 - r1) * t);
    var g = Math.round(g1 + (g2 - g1) * t);
    var b = Math.round(b1 + (b2 - b1) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // 暴露公共接口
  return {
    start: start,
    stop: function () { running = false; },
    onNetworkMessage: onNetworkMessage
  };

})();
