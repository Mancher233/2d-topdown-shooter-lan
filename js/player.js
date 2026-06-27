// js/player.js
// =============================================================================
// 玩家模块 (Player)
// 处理玩家的所有逻辑：创建、移动、翻滚闪避、瞄准、受伤、重生、绘制。
// 玩家角色是一个圆形（半径 15 像素），带一根指向鼠标方向的"枪管"线。
// =============================================================================

var Player = (function () {

  // ---- 游戏平衡常量 ----
  var RADIUS = 15;         // 玩家碰撞半径（圆形 hitbox）
  var MOVE_SPEED = 250;    // 移动速度（像素/秒）
  var ROLL_SPEED = 500;    // 翻滚速度（像素/秒）—— 比移动快
  var ROLL_DURATION = 0.4; // 翻滚持续时间（秒）
  var ROLL_COOLDOWN = 3;   // 翻滚冷却时间（秒）—— 翻滚结束后开始计时
  var MAX_HP = 100;        // 最大生命值
  var RESPAWN_DELAY = 3;   // 死亡后等待重生的时间（秒）
  var GUN_BARREL_LEN = 25; // 枪管线的长度（装饰用）

  /**
   * 创建一个新玩家对象
   * id: 'player1' 或 'player2'
   * x, y: 出生位置
   * color: 玩家颜色（例如 '#4fc3f7'）
   * 返回一个包含所有玩家属性的对象
   */
  function createPlayer(id, x, y, color) {
    return {
      id: id,
      x: x,
      y: y,
      aimAngle: 0,          // 瞄准角度（弧度），0 = 朝右
      hp: MAX_HP,
      maxHp: MAX_HP,
      color: color,
      isRolling: false,     // 是否正在翻滚
      rollTimer: 0,         // 翻滚剩余时间
      rollCooldown: 0,      // 翻滚冷却剩余时间
      rollDirX: 0,          // 翻滚方向 X
      rollDirY: 0,          // 翻滚方向 Y
      alive: true,          // 是否存活
      respawnTimer: 0,      // 重生倒计时
      radius: RADIUS
    };
  }

  /**
   * 更新玩家状态（每帧调用一次）
   * p: 玩家对象
   * dt: 距离上一帧的时间（秒）
   * moveDir: 移动方向 {x, y}（归一化向量，从 Input.getMoveDir() 获取）
   * wantRoll: 是否想翻滚（按了空格键）
   */
  function updatePlayer(p, dt, moveDir, wantRoll) {
    if (!p.alive) return;  // 死了就不更新移动

    // ---- 翻滚逻辑 ----
    if (p.isRolling) {
      // 正在翻滚：以翻滚速度朝翻滚方向移动
      p.x += p.rollDirX * ROLL_SPEED * dt;
      p.y += p.rollDirY * ROLL_SPEED * dt;
      p.rollTimer -= dt;
      if (p.rollTimer <= 0) {
        // 翻滚结束
        p.isRolling = false;
        p.rollCooldown = ROLL_COOLDOWN;  // 开始冷却
      }
    } else {
      // ---- 普通移动 ----
      p.x += moveDir.x * MOVE_SPEED * dt;
      p.y += moveDir.y * MOVE_SPEED * dt;

      // ---- 触发翻滚 ----
      // 按下空格键 且 冷却结束 且 有移动方向
      if (wantRoll && p.rollCooldown <= 0) {
        p.isRolling = true;
        p.rollTimer = ROLL_DURATION;

        // 翻滚方向 = 当前移动方向；如果站着不动，就朝瞄准方向翻滚
        if (moveDir.x !== 0 || moveDir.y !== 0) {
          p.rollDirX = moveDir.x;
          p.rollDirY = moveDir.y;
        } else {
          p.rollDirX = Math.cos(p.aimAngle);
          p.rollDirY = Math.sin(p.aimAngle);
        }
      }

      // 减少冷却时间
      if (p.rollCooldown > 0) {
        p.rollCooldown -= dt;
        if (p.rollCooldown < 0) p.rollCooldown = 0;
      }
    }

    // ---- 墙壁碰撞修正 ----
    var corrected = GameMap.checkWallCollision(p.x, p.y, p.radius);
    p.x = corrected.x;
    p.y = corrected.y;
  }

  /**
   * 更新瞄准角度：让枪口朝向鼠标位置
   * p: 玩家对象
   * worldMouseX, worldMouseY: 鼠标在游戏世界中的坐标
   */
  function updateAim(p, worldMouseX, worldMouseY) {
    p.aimAngle = Utils.angleBetween(p.x, p.y, worldMouseX, worldMouseY);
  }

  /**
   * 对玩家造成伤害
   * amount: 伤害值
   * 如果玩家正在翻滚（无敌帧），不会受到伤害
   */
  function damagePlayer(p, amount) {
    if (!p.alive) return;
    if (p.isRolling) return;  // 翻滚期间无敌！

    p.hp -= amount;
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.respawnTimer = RESPAWN_DELAY;  // 开始重生倒计时
    }
  }

  /**
   * 检查并处理玩家重生
   * p: 玩家对象
   * dt: 帧间隔时间
   * spawnX, spawnY: 出生点坐标
   */
  function checkRespawn(p, dt, spawnX, spawnY) {
    if (p.alive) return;

    p.respawnTimer -= dt;
    if (p.respawnTimer <= 0) {
      // 重生！
      p.alive = true;
      p.hp = p.maxHp;
      p.x = spawnX;
      p.y = spawnY;
      p.isRolling = false;
      p.rollCooldown = 0;
    }
  }

  /**
   * 绘制玩家角色
   * ctx: Canvas 2D 上下文
   * p: 玩家对象
   */
  function drawPlayer(ctx, p) {
    if (!p.alive) {
      // 死了：画一个灰色圆圈 + X 标记
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      // 画 X
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 8, p.y - 8);
      ctx.lineTo(p.x + 8, p.y + 8);
      ctx.moveTo(p.x + 8, p.y - 8);
      ctx.lineTo(p.x - 8, p.y + 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // ---- 翻滚时的视觉效果：半透明 + 残影 ----
    if (p.isRolling) {
      ctx.globalAlpha = 0.3;
      // 画一个残影（在翻滚方向的反方向偏移一点）
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - p.rollDirX * 15, p.y - p.rollDirY * 15, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.7;
    }

    // ---- 画玩家身体（实心圆） ----
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();

    // 画一个白色边框
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ---- 画枪管（从圆心朝瞄准方向画一条线） ----
    var gunX = p.x + Math.cos(p.aimAngle) * GUN_BARREL_LEN;
    var gunY = p.y + Math.sin(p.aimAngle) * GUN_BARREL_LEN;
    ctx.strokeStyle = '#ffeb3b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(gunX, gunY);
    ctx.stroke();
    ctx.lineCap = 'butt';  // 恢复默认

    // 恢复正常透明度
    ctx.globalAlpha = 1;

    // ---- 画血条（在玩家头顶） ----
    var barW = 30;           // 血条总宽度
    var barH = 4;            // 血条高度
    var barX = p.x - barW / 2;
    var barY = p.y - p.radius - 10;  // 在头顶上方

    // 红色背景（表示失去的血）
    ctx.fillStyle = '#e53935';
    ctx.fillRect(barX, barY, barW, barH);

    // 绿色前景（表示当前血量）
    var hpRatio = p.hp / p.maxHp;
    ctx.fillStyle = '#43a047';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
  }

  /**
   * 画十字准星（在鼠标位置）
   * ctx: Canvas 上下文
   * worldMouseX, worldMouseY: 鼠标的世界坐标
   */
  function drawCrosshair(ctx, worldMouseX, worldMouseY) {
    var size = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    // 水平线
    ctx.beginPath();
    ctx.moveTo(worldMouseX - size, worldMouseY);
    ctx.lineTo(worldMouseX + size, worldMouseY);
    ctx.stroke();
    // 垂直线
    ctx.beginPath();
    ctx.moveTo(worldMouseX, worldMouseY - size);
    ctx.lineTo(worldMouseX, worldMouseY + size);
    ctx.stroke();
    // 中心小圆
    ctx.beginPath();
    ctx.arc(worldMouseX, worldMouseY, 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 暴露公共接口
  return {
    RADIUS: RADIUS,
    MAX_HP: MAX_HP,
    ROLL_COOLDOWN: ROLL_COOLDOWN,
    createPlayer: createPlayer,
    updatePlayer: updatePlayer,
    updateAim: updateAim,
    damagePlayer: damagePlayer,
    checkRespawn: checkRespawn,
    drawPlayer: drawPlayer,
    drawCrosshair: drawCrosshair
  };

})();
