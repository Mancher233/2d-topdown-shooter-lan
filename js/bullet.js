// js/bullet.js
// =============================================================================
// 子弹模块 (Bullet)
// 处理子弹的创建、飞行、撞墙消失、击中玩家检测。
// 子弹是一个小圆圈（半径 4 像素），沿着瞄准方向直线飞行。
// =============================================================================

var Bullet = (function () {

  // ---- 游戏平衡常量 ----
  var SPEED = 600;       // 子弹速度（像素/秒）
  var DAMAGE = 17;       // 每颗子弹的伤害（6 发击杀 100HP，TTK ≈ 400ms）
  var RADIUS = 4;        // 子弹碰撞半径
  var MAX_RANGE = 800;   // 子弹最大飞行距离（超过后消失）
  var FIRE_INTERVAL = 0.08; // 射击间隔（秒）—— 750 发/分钟 = 12.5 发/秒

  /**
   * 创建一颗新子弹
   * ownerId: 射击者的 ID（'player1' 或 'player2'）
   * x, y: 子弹出生位置（通常是玩家的枪口位置）
   * angle: 射击方向（弧度，等于玩家的 aimAngle）
   * 返回子弹对象
   */
  function createBullet(ownerId, x, y, angle) {
    return {
      x: x,
      y: y,
      vx: Math.cos(angle) * SPEED,  // X 方向速度
      vy: Math.sin(angle) * SPEED,  // Y 方向速度
      ownerId: ownerId,
      damage: DAMAGE,
      alive: true,         // 是否还"活着"（false = 应被删除）
      distTraveled: 0,     // 已飞行距离
      radius: RADIUS
    };
  }

  /**
   * 更新一颗子弹的状态（每帧调用）
   * b: 子弹对象
   * dt: 帧间隔时间（秒）
   *
   * 逻辑：
   *   1. 让子弹按速度移动
   *   2. 检查是否撞墙（撞墙就消失）
   *   3. 检查是否飞了太远（超距离也消失）
   */
  function updateBullet(b, dt) {
    if (!b.alive) return;

    // 记录旧位置（用于线段碰撞检测）
    var oldX = b.x;
    var oldY = b.y;

    // 移动子弹
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // 计算这次移动的距离
    var moveDist = SPEED * dt;
    b.distTraveled += moveDist;

    // 超过最大射程——子弹消失
    if (b.distTraveled > MAX_RANGE) {
      b.alive = false;
      return;
    }

    // 检查子弹是否撞到了墙
    // 用线段检测（从旧位置到新位置），防止子弹"穿过"薄墙
    var wallHit = GameMap.lineHitsAnyWall(oldX, oldY, b.x, b.y);
    if (wallHit) {
      b.alive = false;
      return;
    }
  }

  /**
   * 检测子弹是否击中了某个玩家
   * b: 子弹对象
   * p: 玩家对象
   * 返回：true = 击中，false = 没击中
   *
   * 判断条件：
   *   1. 子弹和玩家的距离 < 子弹半径 + 玩家半径（圆形碰撞）
   *   2. 子弹不是自己打的（不能打自己）
   *   3. 玩家还活着
   *   4. 玩家不在翻滚（翻滚有无敌帧）
   */
  function bulletHitsPlayer(b, p) {
    if (!b.alive) return false;
    if (!p.alive) return false;
    if (b.ownerId === p.id) return false;  // 不能打自己
    if (p.isRolling) return false;         // 翻滚无敌

    var dist = Utils.distance(b.x, b.y, p.x, p.y);
    return dist < (b.radius + p.radius);
  }

  /**
   * 绘制子弹
   * ctx: Canvas 上下文
   * b: 子弹对象
   * 画一个亮黄色的小圆圈
   */
  function drawBullet(ctx, b) {
    if (!b.alive) return;

    // 子弹主体：亮黄色圆圈
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();

    // 发光效果：稍大的半透明圈
    ctx.fillStyle = 'rgba(255,235,59,0.3)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 暴露公共接口
  return {
    SPEED: SPEED,
    DAMAGE: DAMAGE,
    RADIUS: RADIUS,
    FIRE_INTERVAL: FIRE_INTERVAL,
    createBullet: createBullet,
    updateBullet: updateBullet,
    bulletHitsPlayer: bulletHitsPlayer,
    drawBullet: drawBullet
  };

})();
