// js/grenade.js
// =============================================================================
// 手雷模块 (Grenade)
// 处理手雷的抛掷弧线飞行、爆炸效果、范围伤害。
// 手雷可以飞过墙壁（不被墙壁阻挡），落地后爆炸造成范围伤害。
// =============================================================================

var Grenade = (function () {

  // ---- 游戏平衡常量 ----
  var FLIGHT_TIME = 0.8;      // 手雷飞行时间（秒）—— 从扔出到爆炸
  var DAMAGE = 40;            // 爆炸伤害
  var EXPLOSION_RADIUS = 100; // 爆炸范围半径（像素）
  var COOLDOWN = 20;          // 手雷冷却时间（秒）—— 角色技能冷却
  var ARC_HEIGHT = 60;        // 抛物线弧度高度（纯视觉效果）
  var EXPLOSION_DURATION = 0.4; // 爆炸动画持续时间（秒）
  var SPRITE_SIZE = 24;      // 手雷精灵显示尺寸（像素）

  // 手雷精灵图片引用（通过 setSprites 设置）
  var grenadeSprites = {};   // { ownerId: Image 对象 }

  /**
   * 设置手雷精灵图片
   * sprites: { ownerId: Image 对象 } 例如 { player1: qlzImg, player2: lqImg }
   */
  function setSprites(sprites) {
    grenadeSprites = sprites || {};
  }

  /**
   * 创建一颗新手雷
   * ownerId: 扔手雷的玩家 ID
   * startX, startY: 扔出位置（玩家位置）
   * targetX, targetY: 目标位置（鼠标世界坐标位置）
   */
  function createGrenade(ownerId, startX, startY, targetX, targetY) {
    return {
      startX: startX,
      startY: startY,
      targetX: targetX,
      targetY: targetY,
      x: startX,           // 当前位置 X（随时间更新）
      y: startY,           // 当前位置 Y（随时间更新）
      ownerId: ownerId,
      timer: 0,            // 已经飞了多久
      exploded: false,     // 是否已经爆炸
      explosionTimer: 0,   // 爆炸动画计时器
      radius: EXPLOSION_RADIUS,
      damage: DAMAGE,
      alive: true          // 是否还需要继续存在
    };
  }

  /**
   * 更新手雷状态（每帧调用）
   * g: 手雷对象
   * dt: 帧间隔时间（秒）
   *
   * 飞行阶段：沿抛物线从起点飞向终点
   * 爆炸阶段：显示爆炸动画，持续一段时间后消失
   */
  function updateGrenade(g, dt) {
    if (!g.alive) return;

    if (!g.exploded) {
      // ---- 飞行阶段 ----
      g.timer += dt;

      // 计算飞行进度 t（0 = 刚扔出，1 = 到达目标）
      var t = g.timer / FLIGHT_TIME;
      if (t > 1) t = 1;

      // 水平位置：从起点线性插值到终点
      g.x = Utils.lerp(g.startX, g.targetX, t);
      g.y = Utils.lerp(g.startY, g.targetY, t);

      // 飞行结束——触发爆炸！
      if (t >= 1) {
        g.exploded = true;
        g.explosionTimer = 0;
        // 确保最终位置就是目标位置
        g.x = g.targetX;
        g.y = g.targetY;
      }
    } else {
      // ---- 爆炸阶段 ----
      g.explosionTimer += dt;

      // 爆炸动画播放完毕——移除手雷
      if (g.explosionTimer > EXPLOSION_DURATION) {
        g.alive = false;
      }
    }
  }

  /**
   * 获取手雷的"视觉高度"（纯用于绘制时的立体效果）
   * 飞行中：手雷看起来"飞在空中"，用正弦函数模拟抛物线高度
   * 爆炸后：高度为 0
   */
  function getArcHeight(g) {
    if (g.exploded) return 0;
    var t = g.timer / FLIGHT_TIME;
    // sin(t * PI) 在 t=0 和 t=1 时为 0，在 t=0.5 时达到最大值
    return Math.sin(t * Math.PI) * ARC_HEIGHT;
  }

  /**
   * 检测手雷爆炸是否伤害到某个玩家
   * g: 手雷对象（必须已经爆炸才有效）
   * p: 玩家对象
   * 返回：true = 在爆炸范围内且可以被伤害
   */
  function grenadeHitsPlayer(g, p) {
    if (!g.exploded) return false;   // 还没爆炸
    if (!p.alive) return false;      // 玩家已死
    if (g.ownerId === p.id) return false;  // 不能炸到自己
    if (p.isRolling) return false;   // 翻滚无敌

    // 爆炸位置（目标点）到玩家的距离
    var dist = Utils.distance(g.targetX, g.targetY, p.x, p.y);
    return dist < EXPLOSION_RADIUS;
  }

  /**
   * 绘制手雷
   * ctx: Canvas 上下文
   * g: 手雷对象
   */
  function drawGrenade(ctx, g) {
    if (!g.alive) return;

    if (!g.exploded) {
      // ---- 飞行中的手雷 ----
      var arcH = getArcHeight(g);
    
      // 画影子（在地地面上，不随弧度升高）
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    
      // 画手雷本体（抬高 arcH 像素，看起来在飞）
      var drawY = g.y - arcH;
      var spriteImg = grenadeSprites[g.ownerId];
      if (spriteImg) {
        // 用精灵图片绘制手雷
        ctx.drawImage(spriteImg,
          g.x - SPRITE_SIZE / 2, drawY - SPRITE_SIZE / 2,
          SPRITE_SIZE, SPRITE_SIZE);
      } else {
        // 回退：画圆形手雷（根据所有者区分颜色）
        var fallbackColor = (g.ownerId === 'player1') ? '#4caf50' : '#ff9800';
        var borderColor = (g.ownerId === 'player1') ? '#2e7d32' : '#e65100';
        ctx.fillStyle = fallbackColor;
        ctx.beginPath();
        ctx.arc(g.x, drawY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 画投掷目标的指示圈（半透明虚线圈）
      ctx.strokeStyle = 'rgba(255,100,100,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(g.targetX, g.targetY, EXPLOSION_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);  // 恢复实线

    } else {
      // ---- 爆炸动画 ----
      var t = g.explosionTimer / EXPLOSION_DURATION;  // 0 -> 1
      var currentRadius = EXPLOSION_RADIUS * t;        // 爆炸圈从小到大扩散
      var alpha = 1 - t;                                // 透明度从 1 -> 0（逐渐消失）

      // 外圈：橙色
      ctx.fillStyle = 'rgba(255,152,0,' + (alpha * 0.4) + ')';
      ctx.beginPath();
      ctx.arc(g.targetX, g.targetY, currentRadius, 0, Math.PI * 2);
      ctx.fill();

      // 内圈：亮黄色
      ctx.fillStyle = 'rgba(255,235,59,' + (alpha * 0.6) + ')';
      ctx.beginPath();
      ctx.arc(g.targetX, g.targetY, currentRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // 爆炸边框
      ctx.strokeStyle = 'rgba(255,87,34,' + alpha + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.targetX, g.targetY, currentRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 暴露公共接口
  return {
    FLIGHT_TIME: FLIGHT_TIME,
    DAMAGE: DAMAGE,
    EXPLOSION_RADIUS: EXPLOSION_RADIUS,
    COOLDOWN: COOLDOWN,
    SPRITE_SIZE: SPRITE_SIZE,
    setSprites: setSprites,
    createGrenade: createGrenade,
    updateGrenade: updateGrenade,
    grenadeHitsPlayer: grenadeHitsPlayer,
    drawGrenade: drawGrenade
  };

})();
