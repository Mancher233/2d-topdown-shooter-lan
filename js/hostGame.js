// js/hostGame.js
// =============================================================================
// 房主游戏逻辑 (Host Game)
// 房主负责运行整个游戏的模拟（两个玩家的移动、子弹、手雷、伤害等）。
// 同时也在本地渲染画面。
// 游戏状态大约每秒 30 次发送给加入者。
// =============================================================================

var HostGame = (function () {

  // ---- 游戏状态 ----
  var canvas, ctx;
  var myId;             // 我自己的 ID（'player1'）
  var players = [];     // 两个玩家对象
  var bullets = [];     // 所有子弹
  var grenades = [];    // 所有手雷
  var lastTime = 0;     // 上一帧的时间戳（用于计算 dt）
  var hostPlayer;       // 指向本地玩家（房主自己）
  var joinerPlayer;     // 指向远程玩家（加入者）

  // 射击冷却计时器（每个玩家各一个）
  var shootTimers = {};       // { player1: 0, player2: 0 }
  // 手雷冷却计时器
  var grenadeTimers = {};     // { player1: 0, player2: 0 }

  // 加入者的最新输入（从网络收到的）
  var joinerInput = null;
  // 加入者是否在本帧射击了（用于热量更新）
  var joinerDidShootThisFrame = false;

  // 击杀检测：记录上一帧玩家的存活状态
  var prevAlive = {};

  // 状态发送频率控制（约 30 次/秒）
  var stateSendTimer = 0;
  var STATE_SEND_INTERVAL = 1 / 30;  // 约 33ms 发送一次
  var running = false;  // 游戏循环是否正在运行

  // ---- 视线计算节流 ----
  // 高刷新率显示器（144Hz/240Hz）下，每帧都算 144 条射线太浪费
  // 限制视线计算最多每 ~16ms 一次（约 60Hz），中间帧复用上次结果
  var cachedVisionPoints = null;
  var visionUpdateTimer = 0;
  var VISION_UPDATE_INTERVAL = 1 / 60;  // 最多 60 次/秒

  /**
   * 启动游戏（由 index.html 中的 startGame() 调用）
   */
  function start(canvasEl, playerId) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    myId = playerId;

    // ==== 反浏览器节流 (Anti-Throttle) ====
    // 浏览器会限制后台标签页的 requestAnimationFrame 频率（降到约 1 次/秒）
    // 这会导致房主的游戏循环几乎停止，加入者无法操作。
    // 解决方案：播放一个几乎无声的音频——浏览器不会节流正在播放音频的标签页！
    startAntiThrottle();

    // 创建两个玩家
    var sp = GameMap.spawnPoints;
    var p1 = Player.createPlayer('player1', sp[0].x, sp[0].y, '#4fc3f7'); // 蓝色
    var p2 = Player.createPlayer('player2', sp[1].x, sp[1].y, '#ef5350'); // 红色
    players = [p1, p2];

    // 确定哪个是本地玩家，哪个是远程玩家
    hostPlayer = (myId === 'player1') ? p1 : p2;
    joinerPlayer = (myId === 'player1') ? p2 : p1;

    // 初始化冷却计时器
    shootTimers = { player1: 0, player2: 0 };
    grenadeTimers = { player1: 0, player2: 0 };

    // 初始化击杀检测状态
    prevAlive = { player1: true, player2: true };

    // 初始化角色精灵和手雷精灵
    initSprites();

    // 开始游戏循环
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  /**
   * 反浏览器节流机制
   * 创建一个几乎无声的音频振荡器，防止浏览器降低后台标签页的运行频率。
   * gain 值 0.001 几乎听不到，但足以让浏览器认为“这个标签正在播放音频”。
   */
  function startAntiThrottle() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var audioCtx = new AudioCtx();
      var oscillator = audioCtx.createOscillator();
      var gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.001;  // 音量极低，人耳几乎听不到
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      console.log('[HostGame] Anti-throttle audio started');
    } catch (e) {
      console.warn('[HostGame] Anti-throttle failed:', e);
    }
  }

  /**
   * 初始化角色精灵和手雷精灵
   * 从 Assets 模块加载图片，设置到玩家对象和手雷模块上
   * 如果图片加载失败，会回退到原始圆形
   */
  function initSprites() {
    // 房主（player1）= 张雪峰，加入者（player2）= 科比
    var zxfImg = Assets.getImage('zxf');
    var kobeImg = Assets.getImage('kobe');
    var qlzImg = Assets.getImage('qlz');
    var lqImg = Assets.getImage('lq');

    // 设置玩家精灵（player1 = 张雪峰，player2 = 科比）
    Player.setSprite(p1, zxfImg);
    Player.setSprite(p2, kobeImg);

    // 设置手雷精灵（按所有者 ID 区分）
    Grenade.setSprites({
      'player1': qlzImg,
      'player2': lqImg
    });
  }

  /**
   * 处理来自加入者的网络消息
   */
  function onNetworkMessage(data) {
    if (data.type === 'input') {
      // 加入者的输入状态
      joinerInput = data;
    }

    if (data.type === 'action') {
      // 加入者的动作事件（射击或扔手雷）
      handleJoinerAction(data);
    }
  }

  /**
   * 处理加入者的动作（射击 / 扔手雷）
   */
  function handleJoinerAction(data) {
    var jid = joinerPlayer.id;

    if (data.action === 'shoot') {
      // 检查射击冷却 + 过热检查
      if (shootTimers[jid] <= 0 && Player.canShoot(joinerPlayer)) {
        spawnBullet(joinerPlayer, data.params.angle);
        shootTimers[jid] = Bullet.FIRE_INTERVAL;
        joinerDidShootThisFrame = true;  // 标记加入者本帧射击了
      }
    }

    if (data.action === 'throw') {
      if (grenadeTimers[jid] <= 0) {
        spawnGrenade(joinerPlayer, data.params.targetX, data.params.targetY);
        grenadeTimers[jid] = Grenade.COOLDOWN;
        // 科比技能：扔手雷后获得 5 秒无热量 buff
        joinerPlayer.noHeatBuffTimer = Player.BUFF_DURATION;
        // 播放科比扔手雷语音（双方都能听到）
        Assets.playVoice('kobe1');
        Network.sendVoice('kobe1');
      }
    }
  }

  // ---- 辅助函数：生成子弹 ----
  function spawnBullet(player, angle) {
    // 子弹从枪口位置生成（玩家中心 + 枪管方向偏移）
    var bx = player.x + Math.cos(angle) * 20;
    var by = player.y + Math.sin(angle) * 20;
    bullets.push(Bullet.createBullet(player.id, bx, by, angle));
  }

  // ---- 辅助函数：生成手雷 ----
  function spawnGrenade(player, targetX, targetY) {
    grenades.push(Grenade.createGrenade(player.id, player.x, player.y, targetX, targetY));
  }

  // ==========================================================================
  // 主游戏循环
  // ==========================================================================
  function gameLoop(timestamp) {
    if (!running) return;  // 如果被取消了就停止
    // 计算帧间隔 dt（秒），限制最大值防止物理异常
    var dt = (timestamp - lastTime) / 1000;
    if (dt > 1 / 30) dt = 1 / 30;
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
  }

  // ==========================================================================
  // 更新逻辑（每帧）
  // ==========================================================================
  // G 键防连按标记
  var hostGWasDown = false;

  function update(dt) {
    // ---- 1. 处理房主（本地）的输入 ----
    var hostMoveDir = Input.getMoveDir();
    var hostRoll = Input.isKeyDown(' ');  // 空格键 = 翻滚
    Player.updatePlayer(hostPlayer, dt, hostMoveDir, hostRoll);

    // 计算相机偏移（后面要用）
    var camX = hostPlayer.x - canvas.width / 2;
    var camY = hostPlayer.y - canvas.height / 2;

    // 瞄准：让枪口朝向鼠标
    var worldMouse = Input.getWorldMouse(camX, camY);
    Player.updateAim(hostPlayer, worldMouse.x, worldMouse.y);

    // 房主射击（全自动：按住左键连续射击 + 未过热）
    var hostDidShoot = false;  // 本帧是否射击了
    shootTimers[hostPlayer.id] -= dt;
    if (Input.isMouseDown() && shootTimers[hostPlayer.id] <= 0 && hostPlayer.alive && Player.canShoot(hostPlayer)) {
      spawnBullet(hostPlayer, hostPlayer.aimAngle);
      shootTimers[hostPlayer.id] = Bullet.FIRE_INTERVAL;
      hostDidShoot = true;
    }

    // 房主扔手雷（G 键，按一下扔一个）
    grenadeTimers[hostPlayer.id] -= dt;
    if (Input.isKeyDown('g') && !hostGWasDown && grenadeTimers[hostPlayer.id] <= 0 && hostPlayer.alive) {
      spawnGrenade(hostPlayer, worldMouse.x, worldMouse.y);
      grenadeTimers[hostPlayer.id] = Grenade.COOLDOWN;
      // 张雪峰技能：扔手雷后获得 5 秒 1.5 倍加速
      hostPlayer.speedBuffTimer = Player.BUFF_DURATION;
      // 播放张雪峰扔手雷语音（双方都能听到）
      Assets.playVoice('zxf1');
      Network.sendVoice('zxf1');
    }
    hostGWasDown = Input.isKeyDown('g');

    // ---- 2. 处理加入者（远程）的输入 ----
    if (joinerInput) {
      // 把加入者的按键转换为移动方向
      var jMoveDir = { x: 0, y: 0 };
      if (joinerInput.keys) {
        var k = joinerInput.keys;
        if (k.indexOf('w') >= 0 || k.indexOf('arrowup') >= 0)    jMoveDir.y -= 1;
        if (k.indexOf('s') >= 0 || k.indexOf('arrowdown') >= 0)  jMoveDir.y += 1;
        if (k.indexOf('a') >= 0 || k.indexOf('arrowleft') >= 0)  jMoveDir.x -= 1;
        if (k.indexOf('d') >= 0 || k.indexOf('arrowright') >= 0) jMoveDir.x += 1;
        // 归一化
        var jLen = Math.sqrt(jMoveDir.x * jMoveDir.x + jMoveDir.y * jMoveDir.y);
        if (jLen > 0) { jMoveDir.x /= jLen; jMoveDir.y /= jLen; }
      }

      var jWantRoll = joinerInput.keys && joinerInput.keys.indexOf(' ') >= 0;
      Player.updatePlayer(joinerPlayer, dt, jMoveDir, jWantRoll);

      // 加入者的瞄准角度
      if (typeof joinerInput.aimAngle === 'number') {
        joinerPlayer.aimAngle = joinerInput.aimAngle;
      }
    }

    // 减少加入者的冷却计时器
    shootTimers[joinerPlayer.id] -= dt;
    grenadeTimers[joinerPlayer.id] -= dt;

    // ---- 2.5 更新枪械热量 ----
    // 热量是每个玩家本地计算的，不通过网络同步
    Player.updateHeat(hostPlayer, dt, hostDidShoot);
    Player.updateHeat(joinerPlayer, dt, joinerDidShootThisFrame);
    joinerDidShootThisFrame = false;  // 重置加入者射击标记

    // ---- 2.6 更新技能 buff 计时器 ----
    var hostBuffResult = Player.updateBuffs(hostPlayer, dt);
    var joinerBuffResult = Player.updateBuffs(joinerPlayer, dt);
    // 张雪峰加速结束语音（只有房主自己听到）
    if (hostBuffResult.speedBuffEnded) {
      Assets.playVoice('zxf2');
      Network.sendVoice('zxf2');
    }

    // ---- 3. 更新子弹 ----
    for (var i = 0; i < bullets.length; i++) {
      Bullet.updateBullet(bullets[i], dt);
    }

    // ---- 4. 更新手雷 ----
    // 跟踪哪些手雷刚刚爆炸（用于伤害判定）
    var justExploded = [];
    for (var i = 0; i < grenades.length; i++) {
      var wasExploded = grenades[i].exploded;
      Grenade.updateGrenade(grenades[i], dt);
      if (!wasExploded && grenades[i].exploded) {
        justExploded.push(grenades[i]);
      }
    }

    // ---- 5. 碰撞检测：子弹 vs 玩家 ----
    for (var bi = 0; bi < bullets.length; bi++) {
      for (var pi = 0; pi < players.length; pi++) {
        if (Bullet.bulletHitsPlayer(bullets[bi], players[pi])) {
          Player.damagePlayer(players[pi], bullets[bi].damage);
          bullets[bi].alive = false;
        }
      }
    }

    // ---- 6. 碰撞检测：手雷爆炸 vs 玩家 ----
    for (var gi = 0; gi < justExploded.length; gi++) {
      for (var pi = 0; pi < players.length; pi++) {
        if (Grenade.grenadeHitsPlayer(justExploded[gi], players[pi])) {
          Player.damagePlayer(players[pi], justExploded[gi].damage);
        }
      }
    }

    // ---- 7. 清理已失效的对象 ----
    bullets = bullets.filter(function (b) { return b.alive; });
    grenades = grenades.filter(function (g) { return g.alive; });

    // ---- 7.5 击杀检测 + 语音触发 ----
    for (var pi = 0; pi < players.length; pi++) {
      var p = players[pi];
      var wasAlive = prevAlive[p.id];
      if (wasAlive && !p.alive) {
        // 这个玩家刚刚死亡！
        if (p.id === hostPlayer.id) {
          // 房主被击杀——播放房主死亡语音（同步给加入者）
          Assets.playVoice('zxf3');
          Network.sendVoice('zxf3');
          // 加入者击杀了房主——加入者本地播放击杀语音（不发送）
          // 加入者自己会在客户端检测到并播放 kobe4
        } else {
          // 加入者被击杀——播放加入者死亡语音（同步给加入者）
          Assets.playVoice('kobe3');
          Network.sendVoice('kobe3');
          // 房主击杀了加入者——房主本地播放击杀语音（不发送）
          Assets.playVoice('zxf4');
        }
      }
      prevAlive[p.id] = p.alive;
    }

    // ---- 8. 重生检查 ----
    var sp = GameMap.spawnPoints;
    Player.checkRespawn(players[0], dt, sp[0].x, sp[0].y);
    Player.checkRespawn(players[1], dt, sp[1].x, sp[1].y);

    // ---- 9. 视线计算节流（高刷新率下避免每帧都算 144 条射线） ----
    visionUpdateTimer += dt;
    if (visionUpdateTimer >= VISION_UPDATE_INTERVAL || !cachedVisionPoints) {
      cachedVisionPoints = Vision.computeVision(hostPlayer.x, hostPlayer.y);
      visionUpdateTimer = 0;
    }

    // ---- 10. 发送游戏状态给加入者（~30次/秒） ----
    stateSendTimer += dt;
    if (stateSendTimer >= STATE_SEND_INTERVAL) {
      stateSendTimer = 0;
      Network.sendState({
        players: players,
        bullets: bullets,
        grenades: grenades
      });
    }
  }

  // ==========================================================================
  // 渲染（每帧）
  // ==========================================================================
  function render() {
    var cw = canvas.width;
    var ch = canvas.height;

    // 计算相机偏移：让本地玩家始终在屏幕中央
    var camX = hostPlayer.x - cw / 2;
    var camY = hostPlayer.y - ch / 2;

    // 清空画布
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cw, ch);

    // 应用相机变换（平移坐标系）
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

    ctx.restore();  // 恢复坐标系

    // 6. 画战争迷雾（在屏幕坐标系中）—— 节流到 ~60Hz
    if (!cachedVisionPoints) {
      cachedVisionPoints = Vision.computeVision(hostPlayer.x, hostPlayer.y);
    }
    var screenPts = Vision.worldToScreenPoints(cachedVisionPoints, camX, camY);
    Vision.drawFog(ctx, screenPts, cw, ch);

    // 7. 画 HUD（血量条、冷却指示器）
    drawHUD(cw, ch);
  }

  // ---- HUD：显示在屏幕固定位置的 UI ----
  function drawHUD(cw, ch) {
    var barX = 20;
    var barY = ch - 60;
    var barW = 200;
    var barH = 20;

    // -- 血量条 --
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    var hpRatio = hostPlayer.hp / hostPlayer.maxHp;
    ctx.fillStyle = hpRatio > 0.3 ? '#43a047' : '#e53935';  // 低于 30% 变红
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    // 血量数字
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('HP: ' + hostPlayer.hp + ' / ' + hostPlayer.maxHp, barX + 5, barY + 15);

    // -- 热量条（在血量条下方） --
    var heatY = barY + barH + 5;  // 血量条下面 5px
    var heatH = 14;               // 热量条高度
    var heat = hostPlayer.heat;
    var heatRatio = heat / Player.MAX_HEAT;

    // 背景
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, heatY, barW, heatH);

    // 根据热量水平选择颜色
    var heatColor;
    var warnThreshold = Player.MAX_HEAT * 0.8;  // 80% 警告线
    if (hostPlayer.overheated) {
      // 过热状态：红色 + 脉冲效果
      var pulse = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 150));
      ctx.globalAlpha = pulse;
      heatColor = '#ff1744';  // 亮红色
    } else if (heat >= warnThreshold) {
      // 警告区（80-100%）：橙红色渐变
      var t = (heat - warnThreshold) / (Player.MAX_HEAT - warnThreshold);
      heatColor = lerpColor('#ff9800', '#f44336', t);  // 橙色到红色
    } else {
      // 正常区（0-80%）：黄色到橙色渐变
      var t = heat / warnThreshold;
      heatColor = lerpColor('#ffeb3b', '#ff9800', t);  // 黄色到橙色
    }

    // 画热量条
    ctx.fillStyle = heatColor;
    ctx.fillRect(barX, heatY, barW * heatRatio, heatH);
    ctx.globalAlpha = 1;  // 恢复透明度

    // 边框
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, heatY, barW, heatH);

    // 热量文字
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    var heatText = 'HEAT: ' + Math.round(heat) + ' / ' + Player.MAX_HEAT;
    if (hostPlayer.overheated) heatText += ' 过热！';
    ctx.fillText(heatText, barX + 5, heatY + 11);

    // -- 翻滚冷却条 --
    var rollY = barY - 25;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, rollY, barW, 10);
    var rollCdRatio = 1 - (hostPlayer.rollCooldown / Player.ROLL_COOLDOWN);
    ctx.fillStyle = rollCdRatio >= 1 ? '#42a5f5' : '#666';
    ctx.fillRect(barX, rollY, barW * rollCdRatio, 10);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText('翻滚 [空格]', barX, rollY - 3);

    // -- 手雷冷却条 --
    var grenadeY = rollY - 25;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, grenadeY, barW, 10);
    var gCdRatio = 1 - (grenadeTimers[hostPlayer.id] / Grenade.COOLDOWN);
    if (gCdRatio < 0) gCdRatio = 0;  // 冷却中不能小于 0
    if (gCdRatio > 1) gCdRatio = 1;  // 不能超过 1（timer 可能为负值）
    ctx.fillStyle = gCdRatio >= 1 ? '#66bb6a' : '#666';
    ctx.fillRect(barX, grenadeY, barW * gCdRatio, 10);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText('手雷 [G]', barX, grenadeY - 3);

    // -- 击杀提示 / 状态信息 --
    if (!hostPlayer.alive) {
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
   * 颜色线性插值辅助函数
   * 将两个 hex 颜色按比例混合
   * t=0 返回 c1，t=1 返回 c2
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
