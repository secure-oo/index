// ST Health Inject Extension
// Reads Apple Health data from a GitHub Gist and injects into system prompt

(function () {
    'use strict';

    const EXT = 'st-health';
    const STORAGE_TOKEN   = 'st_health_gh_token';
    const STORAGE_GIST    = 'st_health_gist_id';
    const STORAGE_ENABLED = 'st_health_enabled';
    const STORAGE_CACHE   = 'st_health_cache';

    // ── Helpers ───────────────────────────────────────────────────────────────

    function load(key) { return localStorage.getItem(key) || ''; }
    function save(key, val) { localStorage.setItem(key, val); }

    function setStatus(msg) {
        const el = document.getElementById('st-health-status');
        if (el) el.textContent = msg;
    }

    // ── Fetch health data from Gist ───────────────────────────────────────────

    async function fetchHealthData() {
        const token  = load(STORAGE_TOKEN);
        const gistId = load(STORAGE_GIST);

        if (!token || !gistId) {
            setStatus('⚠️ 请先填写 Token 和 Gist ID');
            return null;
        }

        try {
            setStatus('⏳ 正在读取健康数据…');
            const res = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!res.ok) {
                setStatus(`❌ 读取失败 (${res.status})，请检查 Token 和 Gist ID`);
                return null;
            }

            const data = await res.json();
            const file = data.files["health.json"] || Object.values(data.files).find(f => f.filename.endsWith(".json"));
            if (!file) {
                setStatus('❌ Gist 里找不到 health.json 文件');
                return null;
            }

            const health = JSON.parse(file.content);
            save(STORAGE_CACHE, JSON.stringify(health));
            setStatus(`✅ 数据已更新：${new Date().toLocaleTimeString()}`);
            return health;

        } catch (e) {
            setStatus('❌ 网络错误：' + e.message);
            return null;
        }
    }

    // ── Build injection text ──────────────────────────────────────────────────

    function buildInjectionText(health) {
        if (!health || Object.keys(health).length === 0) return '';

        const lines = ['[用户健康数据（来自 Apple Watch）]'];

        if (health.steps !== undefined)
            lines.push(`今日步数：${health.steps} 步`);
        if (health.heart_rate !== undefined)
            lines.push(`当前心率：${health.heart_rate} bpm`);
        if (health.sleep_hours !== undefined)
            lines.push(`昨晚睡眠：${health.sleep_hours} 小时`);
        if (health.calories !== undefined)
            lines.push(`今日消耗：${health.calories} 千卡`);
        if (health.stand_hours !== undefined)
            lines.push(`站立小时：${health.stand_hours} 小时`);
        if (health.exercise_minutes !== undefined)
            lines.push(`运动时间：${health.exercise_minutes} 分钟`);
        if (health.updated_at)
            lines.push(`数据时间：${health.updated_at}`);

        lines.push('[请根据以上数据自然地关心用户，不要刻意列举数字]');

        return lines.join('\n');
    }

    // ── Inject into ST system prompt ──────────────────────────────────────────

    function injectIntoSystemPrompt(health) {
        if (!health) return;
        const enabled = load(STORAGE_ENABLED);
        if (enabled === 'false') return;

        const text = buildInjectionText(health);
        if (!text) return;

        // Store for ST to pick up via the context script injection
        window._stHealthInjection = text;

        // Hook into SillyTavern's getSystemPrompt or chat send event
        // ST fires 'chatCompletion' events we can hook
        document.addEventListener('chatcompletion_request', (e) => {
            if (!e.detail || !window._stHealthInjection) return;
            try {
                const injStr = '\n\n' + window._stHealthInjection;
                if (e.detail.system_prompt !== undefined) {
                    if (!e.detail.system_prompt.includes('[用户健康数据')) {
                        e.detail.system_prompt += injStr;
                    }
                }
            } catch {}
        });

        // Also try injecting via ST's extension API if available
        try {
            if (typeof window.SillyTavern !== 'undefined') {
                const ctx = window.SillyTavern.getContext();
                if (ctx && ctx.extensionPrompts) {
                    ctx.extensionPrompts[EXT] = {
                        value: text,
                        position: 0,   // after system prompt
                        depth: 0,
                        scan: false,
                    };
                    setStatus(`✅ 已注入系统提示词 · ${new Date().toLocaleTimeString()}`);
                }
            }
        } catch (e) {
            console.warn(`[${EXT}] extensionPrompts inject failed:`, e);
        }
    }

    // ── Settings panel UI ─────────────────────────────────────────────────────

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'st-health-panel';

        const cachedRaw = load(STORAGE_CACHE);
        let previewText = '（还没有数据）';
        if (cachedRaw) {
            try {
                const h = JSON.parse(cachedRaw);
                previewText = buildInjectionText(h) || '（数据为空）';
            } catch {}
        }

        panel.innerHTML = `
            <h4>🍎 Apple Health 注入设置</h4>

            <div>
                <label>GitHub Token</label>
                <input type="password" id="sh-token" placeholder="ghp_xxxxxxxxxxxx" value="${load(STORAGE_TOKEN)}">
            </div>

            <div>
                <label>Gist ID</label>
                <input type="text" id="sh-gist" placeholder="9579cd7a..." value="${load(STORAGE_GIST)}">
            </div>

            <div class="sh-row">
                <button id="sh-save">保存并拉取数据</button>
                <button id="sh-toggle" class="secondary">${load(STORAGE_ENABLED) === 'false' ? '▶ 启用注入' : '⏸ 暂停注入'}</button>
            </div>

            <div id="st-health-status">${cachedRaw ? '✅ 有缓存数据（刷新前最后一次）' : '未配置'}</div>

            <label>当前会注入的内容预览：</label>
            <div id="st-health-preview" style="display:block">${previewText}</div>
        `;

        panel.querySelector('#sh-save').addEventListener('click', async () => {
            const token  = panel.querySelector('#sh-token').value.trim();
            const gistId = panel.querySelector('#sh-gist').value.trim();
            if (!token || !gistId) { setStatus('⚠️ Token 和 Gist ID 不能为空'); return; }
            save(STORAGE_TOKEN, token);
            save(STORAGE_GIST, gistId);
            const health = await fetchHealthData();
            injectIntoSystemPrompt(health);
            // Update preview
            const prev = document.getElementById('st-health-preview');
            if (prev && health) prev.textContent = buildInjectionText(health);
        });

        panel.querySelector('#sh-toggle').addEventListener('click', (e) => {
            const isEnabled = load(STORAGE_ENABLED) !== 'false';
            save(STORAGE_ENABLED, isEnabled ? 'false' : 'true');
            e.target.textContent = isEnabled ? '▶ 启用注入' : '⏸ 暂停注入';
            setStatus(isEnabled ? '注入已暂停' : '注入已启用');
        });

        return panel;
    }

    // ── Register extension panel in ST ────────────────────────────────────────

    function registerPanel() {
        // Wait for ST's extension drawer to exist
        const tryInsert = setInterval(() => {
            const drawer = document.querySelector('#extensions_settings2, #extensions_settings, .extensions_block');
            if (!drawer) return;
            clearInterval(tryInsert);

            const wrapper = document.createElement('div');
            wrapper.className = 'extension_block';
            wrapper.appendChild(buildPanel());
            drawer.appendChild(wrapper);
        }, 500);
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    async function init() {
        console.log(`[${EXT}] Health inject extension loaded`);
        registerPanel();

        // On page load, auto-fetch and inject if configured
        const token  = load(STORAGE_TOKEN);
        const gistId = load(STORAGE_GIST);
        if (token && gistId && load(STORAGE_ENABLED) !== 'false') {
            const health = await fetchHealthData();
            injectIntoSystemPrompt(health);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
