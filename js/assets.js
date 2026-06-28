// js/assets.js
// =============================================================================
// 资源预加载模块 (Assets)
// 在游戏开始前预加载所有图片和音频资源。
// 如果某个资源加载失败，对应的值为 null，游戏会回退到原始几何图形。
// =============================================================================

var Assets = (function () {

  // ---- 图片资源 ----
  var images = {};   // 存放所有预加载的图片 { key: Image 对象 }
  var sounds = {};   // 存放所有预加载的音频 { key: Audio 对象 }

  /**
   * 预加载所有游戏资源（图片 + 音频）
   * callback: 加载完成后调用的回调函数（无论成功失败都会调用）
   */
  function preloadAll(callback) {
    var total = 0;       // 总资源数
    var loaded = 0;      // 已加载/已处理数
    var callbackCalled = false;

    // 进度检查函数：当所有资源都尝试加载后（成功或失败），调用回调
    function checkDone() {
      loaded++;
      if (loaded >= total && !callbackCalled) {
        callbackCalled = true;
        console.log('[Assets] 所有资源加载完成 (' + loaded + '/' + total + ')');
        if (callback) callback();
      }
    }

    // ---- 角色图片 ----
    var characterFiles = {
      'zxf': 'assets/characters/zxf.png',
      'kobe': 'assets/characters/kobe.png'
    };

    // ---- 手雷图片 ----
    var grenadeFiles = {
      'qlz': 'assets/grenades/qlz.png',
      'lq': 'assets/grenades/lq.png'
    };

    // ---- 语音音频 ----
    var voiceFiles = {
      'zxf1': 'assets/voices/zxf1.mp3',
      'zxf2': 'assets/voices/zxf2.mp3',
      'zxf3': 'assets/voices/zxf3.mp3',
      'zxf4': 'assets/voices/zxf4.mp3',
      'kobe1': 'assets/voices/kobe1.mp3',
      'kobe3': 'assets/voices/kobe3.mp3',
      'kobe4': 'assets/voices/kobe4.mp3'
    };

    // ---- 加载图片 ----
    var allImageFiles = {};
    for (var k in characterFiles) {
      if (characterFiles.hasOwnProperty(k)) allImageFiles[k] = characterFiles[k];
    }
    for (var k in grenadeFiles) {
      if (grenadeFiles.hasOwnProperty(k)) allImageFiles[k] = grenadeFiles[k];
    }

    for (var key in allImageFiles) {
      if (allImageFiles.hasOwnProperty(key)) {
        total++;
        (function (k, src) {
          var img = new Image();
          img.onload = function () {
            images[k] = img;
            console.log('[Assets] 图片加载成功: ' + k);
            checkDone();
          };
          img.onerror = function () {
            images[k] = null;
            console.warn('[Assets] 图片加载失败，将使用回退图形: ' + src);
            checkDone();
          };
          img.src = src;
        })(key, allImageFiles[key]);
      }
    }

    // ---- 加载音频 ----
    // 使用 resolved 标志防止重复调用 checkDone()
    // canplaythrough 可能永远不会触发（某些浏览器对 MP3 的支持问题）
    // 因此设置一个较短的超时作为兜底机制
    for (var key in voiceFiles) {
      if (voiceFiles.hasOwnProperty(key)) {
        total++;
        (function (k, src) {
          var audio = new Audio();
          audio.preload = 'auto';
          var resolved = false;

          function resolve(success) {
            if (resolved) return;
            resolved = true;
            if (success) {
              sounds[k] = audio;
              console.log('[Assets] 音频加载成功: ' + k);
            } else {
              sounds[k] = null;
              console.warn('[Assets] 音频加载失败/超时: ' + src);
            }
            checkDone();
          }

          // canplaythrough 触发时标记为成功
          audio.addEventListener('canplaythrough', function () {
            resolve(true);
          });

          // error 事件触发时标记为失败
          audio.addEventListener('error', function () {
            resolve(false);
          });

          // 设置音频源
          audio.src = src;

          // 超时兜底：如果 3 秒内没有任何事件触发，视为加载完成（可能可用也可能不可用）
          setTimeout(function () {
            // 如果还没解决，就认为音频已经"尽力了"
            // 此时音频对象可能已经可以使用，也可能不行
            // 无论如何都要推进游戏启动
            if (!resolved) {
              // 如果音频对象存在且没有报错，认为它可能可用
              sounds[k] = audio;
              resolve(true);
            }
          }, 3000);
        })(key, voiceFiles[key]);
      }
    }

    // 如果没有任何资源需要加载，直接回调
    if (total === 0) {
      checkDone();
    }
  }

  /**
   * 获取预加载的图片
   * key: 图片键名（如 'zxf', 'kobe', 'qlz', 'lq'）
   * 返回：Image 对象，或 null（如果加载失败）
   */
  function getImage(key) {
    return images[key] || null;
  }

  /**
   * 播放语音/音效
   * key: 音频键名（如 'zxf1', 'kobe3'）
   * 每次播放会 clone 一个新的 Audio 实例，支持重叠播放
   */
  function playVoice(key) {
    var audio = sounds[key];
    if (!audio) {
      console.warn('[Assets] 音频不可用: ' + key);
      return;
    }
    try {
      // 克隆一个新的 Audio 实例，避免重叠播放冲突
      var clone = audio.cloneNode();
      clone.volume = audio.volume;
      clone.play().catch(function (e) {
        console.warn('[Assets] 播放失败: ' + key, e);
      });
    } catch (e) {
      console.warn('[Assets] 播放出错: ' + key, e);
    }
  }

  // 暴露公共接口
  return {
    preloadAll: preloadAll,
    getImage: getImage,
    playVoice: playVoice,
    images: images,
    sounds: sounds
  };

})();
