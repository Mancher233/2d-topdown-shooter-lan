// js/vision.js
// =============================================================================
// 战争迷雾 / 视线系统 (Vision / Fog of War)
// 从玩家位置向四周发射射线，碰到墙壁就停下。
// 射线无法到达的区域会被纯黑迷雾完全遮挡——视野外什么都看不到。
//
// 原理：
//   1. 从玩家位置向 360 度发射 144 条射线（每隔 2.5 度一条）
//   2. 每条射线碰到墙壁就停，否则延伸到最大视野距离
//   3. 把所有射线终点连成一个多边形——这就是"可视区域"
//   4. 画一层纯黑不透明遮罩覆盖整个画面
//   5. 在多边形区域"挖洞"——露出下面的游戏画面
//
// 注意：
//   - 144 条光线比 72 条精度更高，视野边缘更平滑、锯齿更少
//   - 黑雾是完全不透明的，墙后面的区域完全看不见
// =============================================================================

var Vision = (function () {

  // ---- 常量 ----
  var RAY_COUNT = 144;      // 射线数量（144 条 = 每 2.5 度一条，比 72 条精度更高）
  var VISION_RANGE = 400;   // 最大视野距离（像素）

  // 预先创建一个离屏画布（offscreen canvas），用于绘制迷雾
  // 这个画布不在页面上显示，只是作为"中间画布"使用
  var fogCanvas = document.createElement('canvas');
  var fogCtx = fogCanvas.getContext('2d');

  /**
   * 计算玩家的可视区域
   * px, py: 玩家在游戏世界中的位置
   * 返回：一个数组 [{x, y}, {x, y}, ...]，包含 144 个射线终点
   *
   * 每条射线从玩家位置出发，朝一个角度延伸到 VISION_RANGE 距离。
   * 如果中途碰到了墙壁，射线就停在墙壁交点处。
   */
  function computeVision(px, py) {
    var points = [];
    var angleStep = (Math.PI * 2) / RAY_COUNT;  // 每条射线之间的角度间隔

    for (var i = 0; i < RAY_COUNT; i++) {
      var angle = i * angleStep;

      // 射线的终点（如果没有墙壁阻挡的话）
      var endX = px + Math.cos(angle) * VISION_RANGE;
      var endY = py + Math.sin(angle) * VISION_RANGE;

      // 检测射线是否碰到了任何墙壁
      var wallHit = GameMap.lineHitsAnyWall(px, py, endX, endY);

      if (wallHit) {
        // 碰到了墙壁——射线停在墙壁交点处
        points.push({ x: wallHit.x, y: wallHit.y });
      } else {
        // 没有碰到墙壁——射线延伸到最大视野
        points.push({ x: endX, y: endY });
      }
    }

    return points;
  }

  /**
   * 绘制战争迷雾
   * mainCtx: 主画布的 Canvas 上下文
   * visionPoints: computeVision() 返回的射线终点数组
   * canvasW, canvasH: 画布尺寸
   *
   * 步骤：
   *   1. 在离屏画布上画满纯黑不透明迷雾（视野外完全看不见）
   *   2. 用可视多边形"挖掉"黑色（composite operation）
   *   3. 把离屏画布画到主画布上
   */
  function drawFog(mainCtx, visionPoints, canvasW, canvasH) {
    // 确保离屏画布和主画布一样大
    if (fogCanvas.width !== canvasW) fogCanvas.width = canvasW;
    if (fogCanvas.height !== canvasH) fogCanvas.height = canvasH;

    // ---- 第一步：画满纯黑不透明迷雾 ----
    // 视野外的区域完全变黑，看不到任何东西
    fogCtx.clearRect(0, 0, canvasW, canvasH);
    fogCtx.fillStyle = 'rgba(0, 0, 0, 1.0)';  // 纯黑，完全不透明
    fogCtx.fillRect(0, 0, canvasW, canvasH);

    // ---- 第二步：在迷雾上"挖洞"——可视区域变透明 ----
    // 'destination-out' 的意思是：新画的内容会把旧内容擦掉
    fogCtx.globalCompositeOperation = 'destination-out';

    // 注意：visionPoints 是游戏世界坐标，需要减去相机偏移才能画到画布上
    // 但是！此时画布已经做了 translate（相机变换），所以我们可以直接用世界坐标
    // 因为 fogCtx 是离屏画布，没有做 translate，所以我们需要传入已经转换好的坐标
    // 解决方案：让调用者传入已经减去 camX/camY 的坐标
    // （在 hostGame/clientGame 中做转换）

    // 画可视多边形
    fogCtx.fillStyle = '#fff';  // 颜色无所谓，destination-out 只看形状
    fogCtx.beginPath();
    if (visionPoints.length > 0) {
      fogCtx.moveTo(visionPoints[0].x, visionPoints[0].y);
      for (var i = 1; i < visionPoints.length; i++) {
        fogCtx.lineTo(visionPoints[i].x, visionPoints[i].y);
      }
    }
    fogCtx.closePath();
    fogCtx.fill();

    // 恢复正常的合成模式
    fogCtx.globalCompositeOperation = 'source-over';

    // ---- 第三步：把迷雾画到主画布上 ----
    mainCtx.drawImage(fogCanvas, 0, 0);
  }

  /**
   * 把世界坐标的可视点转换为画布坐标（减去相机偏移）
   * 在 hostGame/clientGame 的渲染循环中调用
   */
  function worldToScreenPoints(visionPoints, camX, camY) {
    var screenPts = [];
    for (var i = 0; i < visionPoints.length; i++) {
      screenPts.push({
        x: visionPoints[i].x - camX,
        y: visionPoints[i].y - camY
      });
    }
    return screenPts;
  }

  // 暴露公共接口
  return {
    VISION_RANGE: VISION_RANGE,
    computeVision: computeVision,
    drawFog: drawFog,
    worldToScreenPoints: worldToScreenPoints
  };

})();
