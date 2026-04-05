/**
 * vendor-loader.js - CDN/Local 自动切换加载器
 * 
 * 工作原理：
 * 1. 页面加载时先尝试 fetch 一个轻量级的 CDN 资源
 * 2. 如果成功 → 标记为在线，优先使用 CDN
 * 3. 如果失败 → 标记为离线，使用本地 vendor/ 文件
 * 4. 所有 CSS 和 JS 通过此模块动态加载，确保顺序正确
 * 
 * 使用方式：
 *   VendorLoader.loadCSS(resources, callback)
 *   VendorLoader.loadJS(resources, callback)
 *   VendorLoader.getStatus() → 'online' | 'offline'
 */

const VendorLoader = (() => {
    let _online = null; // null = not checked yet
    let _cssQueue = [];
    let _jsQueue = [];
    let _onReady = null;

    // CDN 资源定义（优先 CDN，回退本地）
    const RESOURCES = {
        css: [
            {
                name: 'codemirror-core',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css',
                local: '/static/vendor/codemirror/codemirror.min.css'
            },
            {
                name: 'codemirror-dracula',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css',
                local: '/static/vendor/codemirror/dracula.min.css'
            },
            {
                name: 'codemirror-show-hint',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css',
                local: '/static/vendor/codemirror/show-hint.min.css'
            }
        ],
        js: [
            {
                name: 'codemirror-core',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js',
                local: '/static/vendor/codemirror/codemirror.min.js'
            },
            {
                name: 'codemirror-python',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js',
                local: '/static/vendor/codemirror/python.min.js'
            },
            {
                name: 'codemirror-javascript',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js',
                local: '/static/vendor/codemirror/javascript.min.js'
            },
            {
                name: 'codemirror-clike',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js',
                local: '/static/vendor/codemirror/clike.min.js'
            },
            {
                name: 'codemirror-matchbrackets',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/matchbrackets.min.js',
                local: '/static/vendor/codemirror/matchbrackets.min.js'
            },
            {
                name: 'codemirror-closebrackets',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closebrackets.min.js',
                local: '/static/vendor/codemirror/closebrackets.min.js'
            },
            {
                name: 'codemirror-active-line',
                cdn: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/selection/active-line.min.js',
                local: '/static/vendor/codemirror/active-line.min.js'
            },
            {
                name: 'marked',
                cdn: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
                local: '/static/vendor/marked/marked.min.js'
            }
        ],
        fonts: {
            cdn: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
            local: '/static/vendor/fonts/fonts.css'
        }
    };

    /**
     * 检测网络连接（通过尝试加载一个小型 CDN 资源）
     * 使用 AbortController 设置超时，避免断网时长时间等待
     */
    function checkNetwork() {
        return new Promise((resolve) => {
            if (navigator.onLine === false) {
                _online = false;
                resolve(false);
                return;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => {
                controller.abort();
                _online = false;
                resolve(false);
            }, 3000); // 3 秒超时

            // 尝试 fetch 一个很小的 CDN 资源来判断连通性
            fetch('https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css', {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            }).then(() => {
                clearTimeout(timeout);
                _online = true;
                resolve(true);
            }).catch(() => {
                clearTimeout(timeout);
                _online = false;
                resolve(false);
            });
        });
    }

    /**
     * 加载单个 CSS 文件
     */
    function loadCSSFile(href) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = () => resolve();
            link.onerror = () => reject(new Error('Failed to load: ' + href));
            document.head.appendChild(link);
        });
    }

    /**
     * 加载单个 JS 文件
     */
    function loadJSFile(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load: ' + src));
            document.head.appendChild(script);
        });
    }

    /**
     * 加载字体（CSS）
     */
    function loadFonts() {
        const url = _online ? RESOURCES.fonts.cdn : RESOURCES.fonts.local;
        return loadCSSFile(url);
    }

    /**
     * 顺序加载一组 CSS
     */
    async function loadAllCSS() {
        for (const res of RESOURCES.css) {
            const url = _online ? res.cdn : res.local;
            try {
                await loadCSSFile(url);
            } catch (e) {
                // CDN 失败，尝试本地回退
                if (_online) {
                    console.warn(`[VendorLoader] CDN failed for ${res.name}, falling back to local`);
                    try {
                        await loadCSSFile(res.local);
                        console.info(`[VendorLoader] Local fallback OK for ${res.name}`);
                    } catch (e2) {
                        console.error(`[VendorLoader] Both CDN and local failed for ${res.name}`);
                    }
                } else {
                    console.error(`[VendorLoader] Local load failed for ${res.name}`);
                }
            }
        }
    }

    /**
     * 顺序加载一组 JS
     */
    async function loadAllJS() {
        for (const res of RESOURCES.js) {
            const url = _online ? res.cdn : res.local;
            try {
                await loadJSFile(url);
            } catch (e) {
                // CDN 失败，尝试本地回退
                if (_online) {
                    console.warn(`[VendorLoader] CDN failed for ${res.name}, falling back to local`);
                    try {
                        await loadJSFile(res.local);
                        console.info(`[VendorLoader] Local fallback OK for ${res.name}`);
                    } catch (e2) {
                        console.error(`[VendorLoader] Both CDN and local failed for ${res.name}`);
                    }
                } else {
                    console.error(`[VendorLoader] Local load failed for ${res.name}`);
                }
            }
        }
    }

    /**
     * 初始化：检测网络 → 加载字体 → 加载 CSS → 加载 JS → 触发回调
     */
    async function init(callback) {
        const t0 = performance.now();

        // 1. 检测网络
        const online = await checkNetwork();
        const mode = online ? 'online (CDN)' : 'offline (local)';
        console.log(`[VendorLoader] Network: ${mode} (${(performance.now() - t0).toFixed(0)}ms)`);

        // 更新页面上的网络状态指示器
        const indicator = document.getElementById('network-status');
        if (indicator) {
            indicator.textContent = online ? '🟢 在线' : '🔴 离线';
            indicator.title = online ? '使用 CDN 加载资源' : '使用本地资源';
        }
        // 更新侧边栏网络状态
        if (typeof _updateNetUI === 'function') {
            _updateNetUI(online);
        }

        try {
            // 2. 加载字体
            await loadFonts();

            // 3. 加载 CSS
            await loadAllCSS();

            // 4. 加载 JS
            await loadAllJS();

            console.log(`[VendorLoader] All resources loaded in ${(performance.now() - t0).toFixed(0)}ms`);

            // 5. 触发就绪回调
            if (callback) callback();
        } catch (e) {
            console.error('[VendorLoader] Fatal error during loading:', e);
        }
    }

    return {
        init,
        getStatus: () => _online === null ? 'checking' : (_online ? 'online' : 'offline'),
        RESOURCES
    };
})();
