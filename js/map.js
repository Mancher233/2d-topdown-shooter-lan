// js/map.js
// =============================================================================
// 地图模块 (Map)
// 定义游戏场景的布局：竞技场大小、墙壁和掩体的位置。
// 同时提供碰撞检测函数——判断玩家/子弹是否撞到了墙。
// =============================================================================

var GameMap = (function () {

  // ---- 地图尺寸（像素） ----
  var MAP_W = 1600;  // 地图宽度
  var MAP_H = 1200;  // 地图高度

  // ---- 墙壁列表 ----
  // 每面墙是一个矩形：{ x, y, w, h }
  // (x, y) 是墙的左上角坐标，(w, h) 是宽高
  // 地图布局是对称的，让两个玩家有公平的战术环境
  var walls = [
    // == 四条边界墙（围住整个竞技场） ==
    { x: -20,    y: -20,     w: MAP_W + 40, h: 20 },    // 上边界
    { x: -20,    y: MAP_H,   w: MAP_W + 40, h: 20 },    // 下边界
    { x: -20,    y: -20,     w: 20,          h: MAP_H + 40 }, // 左边界
    { x: MAP_W,  y: -20,     w: 20,          h: MAP_H + 40 }, // 右边界

    // == 内部掩体（对称放置） ==
    // 中央大箱子
    { x: 740,  y: 540,  w: 120, h: 120 },

    // 左上方掩体
    { x: 300,  y: 250,  w: 100, h: 60 },
    { x: 250,  y: 400,  w: 60,  h: 100 },

    // 右下方掩体（与左上方对称）
    { x: 1200, y: 890,  w: 100, h: 60 },
    { x: 1290, y: 700,  w: 60,  h: 100 },

    // 右上方掩体
    { x: 1200, y: 250,  w: 100, h: 60 },
    { x: 1290, y: 400,  w: 60,  h: 100 },

    // 左下方掩体（与右上方对称）
    { x: 300,  y: 890,  w: 100, h: 60 },
    { x: 250,  y: 700,  w: 60,  h: 100 },

    // 上方和下方的水平掩体
    { x: 700,  y: 200,  w: 200, h: 40 },
    { x: 700,  y: 960,  w: 200, h: 40 },
  ];

  // 玩家出生点（两个对角位置）
  var spawnPoints = [
    { x: 150,  y: 150 },   // player1 出生在左上角
    { x: 1450, y: 1050 }   // player2 出生在右下角
  ];

  /**
   * 绘制地图
   * ctx: Canvas 2D 绘图上下文
   * 先画地面（浅色背景），再画每面墙（深色方块）
   */
  function drawMap(ctx) {
    // 画地面：一个大的浅灰色矩形
    ctx.fillStyle = '#3a3a5c';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // 画地面网格（装饰用，让地面不那么单调）
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < MAP_W; gx += 80) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, MAP_H);
      ctx.stroke();
    }
    for (var gy = 0; gy < MAP_H; gy += 80) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(MAP_W, gy);
      ctx.stroke();
    }

    // 画每面墙
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      // 边界墙用深色，内部掩体用棕色
      if (i < 4) {
        ctx.fillStyle = '#1a1a2e';  // 边界墙：很深色
      } else {
        ctx.fillStyle = '#6b5b3e';  // 掩体：棕色（像木箱）
      }
      ctx.fillRect(w.x, w.y, w.w, w.h);

      // 掩体画个边框，看起来更立体
      if (i >= 4) {
        ctx.strokeStyle = '#8b7355';
        ctx.lineWidth = 2;
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      }
    }
  }

  /**
   * 检测一个圆（玩家）是否与任何墙壁碰撞，并进行推离修正
   * cx, cy: 圆心坐标（玩家位置）
   * radius: 圆的半径（玩家碰撞半径 = 15）
   * 返回：修正后的位置 {x, y}（如果没碰撞，位置不变）
   *
   * 原理：逐个检测每面墙，如果圆和墙重叠，把圆沿着推离方向移出墙。
   */
  function checkWallCollision(cx, cy, radius) {
    var x = cx;
    var y = cy;

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var hit = Utils.circleHitsRect(x, y, radius, w.x, w.y, w.w, w.h);
      if (hit) {
        // 把玩家推出墙壁
        x += hit.dx * hit.overlap;
        y += hit.dy * hit.overlap;
      }
    }

    // 最后再确保不超出地图边界
    x = Utils.clamp(x, radius, MAP_W - radius);
    y = Utils.clamp(y, radius, MAP_H - radius);

    return { x: x, y: y };
  }

  /**
   * 检测一条线段是否击中任何墙壁
   * x1,y1 -> x2,y2: 线段的两个端点（比如子弹的起点和终点）
   * 返回：最近的交点 {x, y}，或者 null（没有击中任何墙）
   * 用于子弹碰撞和视线射线。
   */
  function lineHitsAnyWall(x1, y1, x2, y2) {
    var closest = null;
    var minDist = Infinity;

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var hit = Utils.lineHitsRect(x1, y1, x2, y2, w.x, w.y, w.w, w.h);
      if (hit) {
        var d = Utils.distance(x1, y1, hit.x, hit.y);
        if (d < minDist) {
          minDist = d;
          closest = hit;
        }
      }
    }
    return closest;
  }

  /**
   * 检测一个点是否在任何墙壁内部
   * 用于检查子弹出生点是否在墙里（避免在墙里开枪）
   */
  function pointInsideWall(px, py) {
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (px >= w.x && px <= w.x + w.w && py >= w.y && py <= w.y + w.h) {
        return true;
      }
    }
    return false;
  }

  // 暴露公共接口
  return {
    MAP_W: MAP_W,
    MAP_H: MAP_H,
    walls: walls,
    spawnPoints: spawnPoints,
    drawMap: drawMap,
    checkWallCollision: checkWallCollision,
    lineHitsAnyWall: lineHitsAnyWall,
    pointInsideWall: pointInsideWall
  };

})();
