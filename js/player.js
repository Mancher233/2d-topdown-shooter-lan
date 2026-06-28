// js/player.js
// =============================================================================
// 玩家模块 (Player)
// 处理玩家的所有逻辑：创建、移动、翻滚闪避、瞄准、受伤、重生、绘制、枪械过热。
// 玩家角色是一个圆形（半径 15 像素），带一根指向鼠标方向的“枪管”线。
//
// 枪械过热系统：
//   - 每发射击 +1 热量，温度上限 40 度
//   - 未过热时，停止射击按 10 度/秒冷却
//   - 过热后，按 7 度/秒缓慢恢复
//   - 过热后需等待热量降至 0 才能重新射击
//   - 过热玩家会有视觉标签（对手也能看到）
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
  var SPRITE_SIZE = 40;    // 角色精灵显示尺寸（像素）
  var BUFF_DURATION = 5;   // 手雷技能 buff 持续时间（秒）
  var SPEED_MULTIPLIER = 1.5;  // 张雪峰加速 buff 倍率

  // ---- 枪械过热系统常量 ----
  // 射速 12 发/秒，每发 +1 热量，连续射击 ~3.33 秒达到上限
  var HEAT_PER_SHOT = 1;              // 每发射击增加的热量
  var MAX_HEAT = 40;                  // 温度上限（到达后过热）
  var NORMAL_COOL_RATE = 10;          // 正常冷却速率（10 度/秒）
  var OVERHEATED_COOL_RATE = 7;       // 过热后恢复速率（7 度/秒，更慢）
  var SHOT_COOL_DELAY = 0.1;          // 射击后 0.1 秒内不自然冷却（不累加）

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
      radius: RADIUS,
      // ---- 枪械过热属性 ----
      heat: 0,              // 当前热量（0 ~ MAX_HEAT）
      overheated: false,    // 是否处于过热状态（通过网络同步，对手可见）
      coolDelay: 0,         // 射击后冷却延迟（秒），期间不自然降温
      // ---- 角色精灵 ----
      sprite: null,         // 角色图片（Image 对象），null 则用圆形回退
      fallbackColor: color, // 回退颜色（图片加载失败时使用）
      // ---- 技能 buff 属性 ----
      speedBuffTimer: 0,    // 加速 buff 剩余时间（秒），0 = 无 buff
      noHeatBuffTimer: 0    // 无热量 buff 剩余时间（秒），0 = 无 buff
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
      // 计算实际移动速度（考虑加速 buff）
      var actualSpeed = MOVE_SPEED;
      if (p.speedBuffTimer > 0) {
        actualSpeed = MOVE_SPEED * SPEED_MULTIPLIER;
      }
      p.x += moveDir.x * actualSpeed * dt;
      p.y += moveDir.y * actualSpeed * dt;

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
   * 更新枪械热量（每帧调用）
   * p: 玩家对象
   * dt: 帧间隔时间（秒）
   * didShoot: 本帧是否开了一枪
   *
   * 逻辑：
   *   1. 如果本帧射击了，热量 +HEAT_PER_SHOT（射击时不冷却！）
   *   2. 如果热量达到 MAX_HEAT，标记为过热
   *   3. 如果没有射击，热量按时间递减
   *      - 正常状态：10 度/秒
   *      - 过热状态：7 度/秒（更慢）
   *   4. 过热后必须降到 0 才能重新射击
   */
  function updateHeat(p, dt, didShoot) {
    if (didShoot) {
      // 射击增加热量（射击帧不冷却！）
      // 如果处于无热量 buff 期间，不增加热量
      if (p.noHeatBuffTimer <= 0) {
        p.heat += HEAT_PER_SHOT;
        if (p.heat >= MAX_HEAT) {
          p.heat = MAX_HEAT;
          p.overheated = true;  // 达到上限，标记为过热
        }
      }
      p.coolDelay = SHOT_COOL_DELAY;  // 射击后短暂禁止自然冷却
    } else if (p.heat > 0) {
      // 射击后的短暂延迟期内不冷却
      if (p.coolDelay > 0) {
        p.coolDelay -= dt;
        if (p.coolDelay < 0) p.coolDelay = 0;
      } else {
        // 延迟结束，正常冷却
        var coolRate = p.overheated ? OVERHEATED_COOL_RATE : NORMAL_COOL_RATE;
        p.heat -= coolRate * dt;
        if (p.heat <= 0) {
          p.heat = 0;
          p.overheated = false;  // 完全冷却，解除过热
        }
      }
    }
  }

  /**
   * 检查玩家是否可以射击（未过热）
   * p: 玩家对象
   * 返回：true = 可以射击，false = 过热中不能射击
   */
  function canShoot(p) {
    // 过热后必须等热量完全降到 0 才能射击
    if (p.overheated) return false;
    return true;
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
      // 注意：重生不重置热量（热量跨重生保持）
    }
  }

  /**
   * 更新技能 buff 计时器（每帧调用）
   * p: 玩家对象
   * dt: 帧间隔时间（秒）
   * 返回：{ speedBuffEnded: bool, noHeatBuffEnded: bool } 标记 buff 是否刚好在本帧结束
   */
  function updateBuffs(p, dt) {
    var result = { speedBuffEnded: false, noHeatBuffEnded: false };
    if (p.speedBuffTimer > 0) {
      p.speedBuffTimer -= dt;
      if (p.speedBuffTimer <= 0) {
        p.speedBuffTimer = 0;
        result.speedBuffEnded = true;
      }
    }
    if (p.noHeatBuffTimer > 0) {
      p.noHeatBuffTimer -= dt;
      if (p.noHeatBuffTimer <= 0) {
        p.noHeatBuffTimer = 0;
        result.noHeatBuffEnded = true;
      }
    }
    return result;
  }

  /**
   * 设置玩家的角色精灵图片
   * p: 玩家对象
   * img: Image 对象（或 null 使用回退）
   */
  function setSprite(p, img) {
    p.sprite = img;
  }

  /**
   * 绘制玩家角色
   * ctx: Canvas 2D 上下文
   * p: 玩家对象
   */
  function drawPlayer(ctx, p) {
    if (!p.alive) {
      // ---- 死亡状态：灰色精灵/圆圈 + X 标记 ----
      ctx.globalAlpha = 0.4;
      if (p.sprite) {
        // 画灰色精灵
        ctx.save();
        ctx.filter = 'grayscale(100%) brightness(0.5)';
        ctx.drawImage(p.sprite,
          p.x - SPRITE_SIZE / 2, p.y - SPRITE_SIZE / 2,
          SPRITE_SIZE, SPRITE_SIZE);
        ctx.restore();
      } else {
        // 回退：灰色圆圈
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      // 画 X
      ctx.globalAlpha = 0.8;
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
      if (p.sprite) {
        // 残影用精灵绘制
        ctx.drawImage(p.sprite,
          p.x - p.rollDirX * 15 - SPRITE_SIZE / 2,
          p.y - p.rollDirY * 15 - SPRITE_SIZE / 2,
          SPRITE_SIZE, SPRITE_SIZE);
      } else {
        ctx.fillStyle = p.fallbackColor;
        ctx.beginPath();
        ctx.arc(p.x - p.rollDirX * 15, p.y - p.rollDirY * 15, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.7;
    }

    // ---- 加速 buff 视觉效果：蓝色光圈 ----
    if (p.speedBuffTimer > 0) {
      var glowPulse = 0.3 + 0.2 * Math.abs(Math.sin(performance.now() / 150));
      ctx.globalAlpha = glowPulse;
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, SPRITE_SIZE / 2 + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ---- 无热量 buff 视觉效果：橙色光圈 ----
    if (p.noHeatBuffTimer > 0) {
      var glowPulse = 0.3 + 0.2 * Math.abs(Math.sin(performance.now() / 200));
      ctx.globalAlpha = glowPulse;
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(p.x, p.y, SPRITE_SIZE / 2 + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ---- 画玩家身体（精灵或圆圈） ----
    if (p.sprite) {
      // 画角色精灵（40x40，居中于玩家位置）
      ctx.drawImage(p.sprite,
        p.x - SPRITE_SIZE / 2, p.y - SPRITE_SIZE / 2,
        SPRITE_SIZE, SPRITE_SIZE);
    } else {
      // 回退：画圆形角色
      ctx.fillStyle = p.fallbackColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      // 白色边框
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

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
    var barY = p.y - SPRITE_SIZE / 2 - 10;  // 在精灵头顶上方

    // 红色背景（表示失去的血）
    ctx.fillStyle = '#e53935';
    ctx.fillRect(barX, barY, barW, barH);

    // 绿色前景（表示当前血量）
    var hpRatio = p.hp / p.maxHp;
    ctx.fillStyle = '#43a047';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    // ---- 过热视觉标签 ----
    // 过热玩家在头顶显示红色警告标记（对手也能看到）
    if (p.overheated && p.alive) {
      var tagY = barY - 14;
      // 红色闪烁背景
      var pulse = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 200));
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(barX - 2, tagY - 2, barW + 4, 12);
      ctx.globalAlpha = 1;
      // 文字
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('OVERHEAT', p.x, tagY + 7);
      ctx.textAlign = 'left';
    }

    // ---- buff 持续时间文字（小字显示在血条上方） ----
    if (p.speedBuffTimer > 0) {
      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡' + p.speedBuffTimer.toFixed(1) + 's', p.x, barY - 4);
      ctx.textAlign = 'left';
    }
    if (p.noHeatBuffTimer > 0) {
      ctx.fillStyle = '#ff9800';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🔥' + p.noHeatBuffTimer.toFixed(1) + 's', p.x, barY - 4);
      ctx.textAlign = 'left';
    }
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
    HEAT_PER_SHOT: HEAT_PER_SHOT,
    MAX_HEAT: MAX_HEAT,
    SHOT_COOL_DELAY: SHOT_COOL_DELAY,
    BUFF_DURATION: BUFF_DURATION,
    SPEED_MULTIPLIER: SPEED_MULTIPLIER,
    SPRITE_SIZE: SPRITE_SIZE,
    createPlayer: createPlayer,
    updatePlayer: updatePlayer,
    updateHeat: updateHeat,
    updateBuffs: updateBuffs,
    setSprite: setSprite,
    canShoot: canShoot,
    updateAim: updateAim,
    damagePlayer: damagePlayer,
    checkRespawn: checkRespawn,
    drawPlayer: drawPlayer,
    drawCrosshair: drawCrosshair
  };

})();
