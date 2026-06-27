// js/utils.js
// =============================================================================
// 工具函数模块 (Utilities)
// 这里定义了一些简单的数学辅助函数，被游戏的其他模块使用。
// 所有函数都是"纯函数"——不修改外部状态，只根据输入返回结果。
// =============================================================================

// 创建一个全局对象来存放工具函数（这样其他文件可以直接用 Utils.xxx 调用）
var Utils = (function () {

  /**
   * 计算两个点之间的欧几里得距离（就是普通的直线距离）
   * 公式：sqrt((x2-x1)^2 + (y2-y1)^2)
   */
  function distance(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 计算从点 (x1,y1) 指向 (x2,y2) 的角度（弧度制）
   * 返回值范围：-PI 到 PI
   * 用于计算玩家朝向、子弹飞行方向等
   */
  function angleBetween(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  /**
   * 把一个数值限制在 [min, max] 范围内
   * 例如：clamp(150, 0, 100) 返回 100
   *       clamp(-5, 0, 100) 返回 0
   *       clamp(50, 0, 100) 返回 50
   */
  function clamp(val, min, max) {
    if (val < min) return min;
    if (val > max) return max;
    return val;
  }

  /**
   * 线性插值：在 a 和 b 之间按 t 比例取值
   * t=0 返回 a，t=1 返回 b，t=0.5 返回中间值
   * 用于手雷飞行轨迹、平滑移动等
   */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * 检测一条线段是否与一个矩形（AABB）相交
   * 参数：线段端点 (x1,y1)-(x2,y2)，矩形左上角 (rx,ry) 和宽高 (rw,rh)
   * 返回：如果相交，返回线段上离起点最近的交点 {x, y}；否则返回 null
   *
   * 原理：对矩形的四条边分别做线段相交检测，取最近的交点。
   * 这个函数被子弹和视线射线使用。
   */
  function lineHitsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    // 矩形的四条边
    var left   = rx;
    var right  = rx + rw;
    var top    = ry;
    var bottom = ry + rh;

    var closest = null;
    var minDist = Infinity;

    // 依次检测与矩形的四条边是否相交
    var edges = [
      [left, top, right, top],      // 上边
      [left, bottom, right, bottom], // 下边
      [left, top, left, bottom],     // 左边
      [right, top, right, bottom]    // 右边
    ];

    for (var i = 0; i < edges.length; i++) {
      var hit = lineLineIntersect(
        x1, y1, x2, y2,
        edges[i][0], edges[i][1], edges[i][2], edges[i][3]
      );
      if (hit) {
        var d = distance(x1, y1, hit.x, hit.y);
        if (d < minDist) {
          minDist = d;
          closest = hit;
        }
      }
    }
    return closest;
  }

  /**
   * 两条线段的交点检测（辅助函数）
   * 线段1: (ax1,ay1)-(ax2,ay2)
   * 线段2: (bx1,by1)-(bx2,by2)
   * 返回交点 {x, y} 或 null（如果不相交）
   *
   * 使用参数化方程求解交点：
   *   P = A + t*(B-A)   线段1上的点
   *   P = C + u*(D-C)   线段2上的点
   *   当 t 和 u 都在 [0,1] 范围内时，两线段相交
   */
  function lineLineIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    var dxA = ax2 - ax1;
    var dyA = ay2 - ay1;
    var dxB = bx2 - bx1;
    var dyB = by2 - by1;

    var denom = dxA * dyB - dyA * dxB;
    if (Math.abs(denom) < 0.0001) return null; // 平行或重合

    var t = ((bx1 - ax1) * dyB - (by1 - ay1) * dxB) / denom;
    var u = ((bx1 - ax1) * dyA - (by1 - ay1) * dxA) / denom;

    // t 和 u 都在 0~1 之间，说明交点在两条线段上
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: ax1 + t * dxA,
        y: ay1 + t * dyA
      };
    }
    return null;
  }

  /**
   * 检测一个圆是否与一个矩形（AABB）重叠
   * 参数：圆心 (cx,cy)、半径 cr、矩形左上角 (rx,ry) 和宽高 (rw,rh)
   * 返回：如果重叠，返回推离方向 {dx, dy, overlap}；否则返回 null
   *
   * 原理：找到矩形上离圆心最近的点，计算距离是否小于半径。
   * 用于玩家（圆形）与墙壁（矩形）的碰撞检测。
   */
  function circleHitsRect(cx, cy, cr, rx, ry, rw, rh) {
    // 找到矩形上离圆心最近的点
    var closestX = clamp(cx, rx, rx + rw);
    var closestY = clamp(cy, ry, ry + rh);

    var dx = cx - closestX;
    var dy = cy - closestY;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < cr) {
      // 圆和矩形重叠了
      var overlap = cr - dist;
      // 如果圆心正好在矩形内部（dist=0），给一个默认推离方向
      if (dist === 0) {
        return { dx: 0, dy: -1, overlap: cr };
      }
      return { dx: dx / dist, dy: dy / dist, overlap: overlap };
    }
    return null;
  }

  // 把这些函数暴露出去，让其他模块可以使用
  return {
    distance: distance,
    angleBetween: angleBetween,
    clamp: clamp,
    lerp: lerp,
    lineHitsRect: lineHitsRect,
    circleHitsRect: circleHitsRect
  };

})();
