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
    var loaded = 0;      // 已加载数
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
    // 合并角色和手雷图片
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
    for (var key in voiceFiles) {
      if (voiceFiles.hasOwnProperty(key)) {
        total++;
        (function (k, src) {
          var audio = new Audio();
          audio.preload = 'auto';
          audio.addEventListener('canplaythrough', function () {
            sounds[k] = audio;
            console.log('[Assets] 音频加载成功: ' + k);
            checkDone();
          });
          audio.addEventListener('error', function () {
            sounds[k] = null;
            console.warn('[Assets] 音频加载失败: ' + src);
            checkDone();
          });
          audio.src = src;
          // 某些浏览器可能不触发 canplaythrough，设置超时兜底
          setTimeout(function () {
            if (!sounds.hasOwnProperty(k)) {
              // 如果还没设置过（既没成功也没失败），标记为 null
              if (sounds[k] === undefined) {
                sounds[k] = null;
                console.warn('[Assets] 音频加载超时: ' + src);
                checkDone();
              }
            }
          }, 5000);
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
