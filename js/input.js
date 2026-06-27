// js/input.js
// =============================================================================
// 输入管理模块 (Input Manager)
// 集中处理键盘和鼠标的输入。
// 其他模块通过 Input.xxx() 来读取当前按键状态和鼠标位置。
// =============================================================================

var Input = (function () {

  // ---- 内部状态 ----
  var keys = {};          // 当前按下的键（例如 { 'w': true, 'd': true }）
  var mouseX = 0;         // 鼠标在画布上的 X 坐标（像素）
  var mouseY = 0;         // 鼠标在画布上的 Y 坐标（像素）
  var mouseDown = false;  // 鼠标左键是否按下
  var clicked = false;    // 鼠标是否刚刚点击了一下（读取一次后自动重置）
  var canvas = null;      // 画布元素（用于计算鼠标相对位置）

  /**
   * 初始化输入系统——绑定事件监听到画布上
   * 必须在游戏开始前调用一次
   */
  function init(canvasEl) {
    canvas = canvasEl;

    // ---- 键盘事件 ----
    // keydown: 按下某个键
    window.addEventListener('keydown', function (e) {
      keys[e.key.toLowerCase()] = true;
      // 阻止游戏按键的默认行为（比如空格键滚动页面）
      if (['w', 'a', 's', 'd', ' ', 'g', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(e.key.toLowerCase()) >= 0) {
        e.preventDefault();
      }
    });

    // keyup: 松开某个键
    window.addEventListener('keyup', function (e) {
      keys[e.key.toLowerCase()] = false;
    });

    // ---- 鼠标事件 ----
    // mousemove: 鼠标移动——更新鼠标在画布上的坐标
    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    });

    // mousedown: 鼠标左键按下
    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) {  // 0 = 左键
        mouseDown = true;
        clicked = true;
      }
    });

    // mouseup: 鼠标左键松开
    canvas.addEventListener('mouseup', function (e) {
      if (e.button === 0) {
        mouseDown = false;
      }
    });

    // 防止右键菜单弹出（我们可能用右键做其他操作）
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });
  }

  /**
   * 检查某个键是否被按下
   * 参数：键名（小写），例如 'w', 'a', 's', 'd', ' ', 'g'
   * 返回：true / false
   */
  function isKeyDown(key) {
    return keys[key] === true;
  }

  /**
   * 获取移动方向向量（WASD 或方向键）
   * 返回 {x, y}，长度最大为 1（归一化）
   * 如果没有按任何方向键，返回 {x:0, y:0}
   */
  function getMoveDir() {
    var dx = 0;
    var dy = 0;
    if (isKeyDown('w') || isKeyDown('arrowup'))    dy -= 1;
    if (isKeyDown('s') || isKeyDown('arrowdown'))  dy += 1;
    if (isKeyDown('a') || isKeyDown('arrowleft'))  dx -= 1;
    if (isKeyDown('d') || isKeyDown('arrowright')) dx += 1;

    // 如果同时按了两个方向（比如 W+D），需要归一化，否则斜着走会更快
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
    return { x: dx, y: dy };
  }

  /**
   * 获取鼠标在画布上的坐标（像素）
   */
  function getMousePos() {
    return { x: mouseX, y: mouseY };
  }

  /**
   * 获取鼠标在游戏世界中的坐标（考虑相机偏移）
   * camX, camY: 相机左上角在世界中的位置
   *
   * 原理：画布上看到的画面是经过相机偏移后的世界。
   *       鼠标在画布上的位置 + 相机偏移 = 世界坐标。
   */
  function getWorldMouse(camX, camY) {
    return { x: mouseX + camX, y: mouseY + camY };
  }

  /**
   * 获取从玩家到鼠标（世界坐标）的瞄准角度
   * px, py: 玩家在世界中的位置
   * camX, camY: 相机偏移
   * 返回：角度（弧度制），用于控制枪口朝向和子弹方向
   */
  function getAimAngle(px, py, camX, camY) {
    var wm = getWorldMouse(camX, camY);
    return Utils.angleBetween(px, py, wm.x, wm.y);
  }

  /**
   * 消费一次点击事件
   * 返回 true 表示刚才有一次点击，然后自动重置为 false
   * 这样每次点击只会被处理一次（不会重复触发）
   */
  function consumeClick() {
    if (clicked) {
      clicked = false;
      return true;
    }
    return false;
  }

  /**
   * 鼠标左键是否正在按住
   */
  function isMouseDown() {
    return mouseDown;
  }

  // 暴露公共接口
  return {
    init: init,
    isKeyDown: isKeyDown,
    getMoveDir: getMoveDir,
    getMousePos: getMousePos,
    getWorldMouse: getWorldMouse,
    getAimAngle: getAimAngle,
    consumeClick: consumeClick,
    isMouseDown: isMouseDown
  };

})();
