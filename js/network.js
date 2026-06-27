// js/network.js
// =============================================================================
// 网络通信模块 (Network)
// 封装 WebSocket 连接，处理消息的发送和接收。
// 服务器只是一个"中转站"——把 A 的消息转给 B。
// =============================================================================

var Network = (function () {

  var ws = null;                 // WebSocket 连接对象
  var onMessageCallback = null;  // 收到消息时的回调函数
  var onOpenCallback = null;     // 连接成功时的回调函数
  var onCloseCallback = null;    // 连接断开时的回调函数

  /**
   * 连接到 WebSocket 服务器
   * ip: 服务器的 IP 地址（或 'localhost'）
   * onOpen: 连接成功时调用的函数
   * onMessage: 收到消息时调用的函数（参数是解析后的 JS 对象）
   * onClose: 连接断开时调用的函数
   */
  function connect(ip, onOpen, onMessage, onClose) {
    onOpenCallback = onOpen;
    onMessageCallback = onMessage;
    onCloseCallback = onClose;

    // 创建 WebSocket 连接
    // URL 格式：ws://IP地址:端口号
    // （ws:// 是 WebSocket 协议，类似 http://）
    ws = new WebSocket('ws://' + ip + ':3000');

    // 连接成功
    ws.onopen = function () {
      console.log('[Network] Connected to server at ' + ip);
      if (onOpenCallback) onOpenCallback();
    };

    // 收到消息
    ws.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data);  // 把 JSON 字符串转为 JS 对象
        if (onMessageCallback) onMessageCallback(data);
      } catch (e) {
        console.error('[Network] Failed to parse message:', e);
      }
    };

    // 连接断开
    ws.onclose = function () {
      console.log('[Network] Connection closed');
      if (onCloseCallback) onCloseCallback();
    };

    // 连接出错
    ws.onerror = function (err) {
      console.error('[Network] WebSocket error:', err);
    };

    // 返回 WebSocket 引用（供 beforeunload 时主动关闭）
    return ws;
  }

  /**
   * 发送消息给对方（通过服务器转发）
   * obj: 要发送的 JS 对象（会被自动转为 JSON 字符串）
   */
  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  /**
   * 发送输入状态（加入者 -> 房主）
   * 每帧发送一次，告诉房主"我正在按什么键、鼠标在哪里"
   */
  function sendInput(keys, mouseX, mouseY, mouseDown, aimAngle) {
    send({
      type: 'input',
      keys: keys,
      mouseX: mouseX,
      mouseY: mouseY,
      mouseDown: mouseDown,
      aimAngle: aimAngle
    });
  }

  /**
   * 发送动作事件（加入者 -> 房主）
   * action: 'shoot' 或 'throw'
   * params: 附加参数（如射击角度、手雷目标位置等）
   */
  function sendAction(action, params) {
    send({
      type: 'action',
      action: action,
      params: params || {}
    });
  }

  /**
   * 发送游戏状态快照（房主 -> 加入者）
   * state: 完整的游戏状态对象（包含所有玩家、子弹、手雷）
   * 注意：这个消息可能比较大（JSON 序列化后几 KB），但局域网速度够快。
   */
  function sendState(state) {
    send({
      type: 'state',
      state: state
    });
  }

  /**
   * 检查 WebSocket 是否已连接
   */
  function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  // 暴露公共接口
  return {
    connect: connect,
    send: send,
    sendInput: sendInput,
    sendAction: sendAction,
    sendState: sendState,
    isConnected: isConnected
  };

})();
