// ... existing code ...
app.get('/api/user', async (req, res) => {
    const phone = req.headers.authorization;
    const user = await User.findOne({ phone: phone });
    user ? res.json(user) : res.status(404).json({ error: '用户不存在' });
});

app.post('/api/draw', async (req, res) => {
    try {
        const phone = req.headers.authorization;
        const user = await User.findOne({ phone: phone });
        
        if (!user || user.chances <= 0) {
            return res.status(400).json({ error: '没有抽奖次数了' });
        }

        const prizes = await Prize.find();
        const totalWeight = prizes.reduce((sum, p) => sum + Number(p.weight), 0);
// ... existing code ...
```

### 2. 移除后台时间配置项 (`public/admin.html`)
清理掉后台页面中设置时间的输入框和对应逻辑。

**第一处：移除 HTML 界面输入框**
```html:后台系统页面:public/admin.html
<!-- ... existing code ... -->
        <div class="bg-white p-6 rounded-lg shadow-sm mb-8 border-t-4 border-[#1A1A1A]">
            <h2 class="text-lg font-bold mb-6">品牌资产与营销配置 (前台实时生效)</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label class="block text-xs font-bold text-gray-500 mb-1 tracking-widest">活动大标题</label>
                    <input type="text" id="configTitle" class="w-full border border-gray-200 p-2 text-sm rounded bg-gray-50 focus:bg-white focus:outline-none focus:border-black">
                </div>
<!-- ... existing code ... -->
```

**第二处：移除初始化加载时间数据的 JS 逻辑**
```html:后台系统页面:public/admin.html
<!-- ... existing code ... -->
        async function init() {
            const cfgRes = await fetch('/api/config');
            const config = await cfgRes.json();
            
            document.getElementById('configTitle').value = config.title;
            document.getElementById('configSubtitle').value = config.subtitle;
            document.getElementById('configPhilosophy').value = config.brandPhilosophy || "";
            document.getElementById('configPaymentCopy').value = config.paymentCopy || "";
<!-- ... existing code ... -->
```

**第三处：移除保存设置时的时间提交流程**
```html:后台系统页面:public/admin.html
<!-- ... existing code ... -->
        async function saveConfig() {
            const payload = {
                title: document.getElementById('configTitle').value,
                subtitle: document.getElementById('configSubtitle').value,
                brandPhilosophy: document.getElementById('configPhilosophy').value,
                paymentCopy: document.getElementById('configPaymentCopy').value,
                qrCodeUrl: document.getElementById('configQrCodeUrl').value,
                rules: currentRules
            };
            await fetch('/api/config', { method: 'POST', headers, body: JSON.stringify(payload) });
            alert('品牌营销配置已保存！首页已实时更新。');
        }

        function renderPrizes() {
<!-- ... existing code ... -->
```

如果您指的是其他倒计时（例如您本地曾经添加过的某个前端倒计时卡片），您只需在您的 `index.html` 里直接删除那段 `<section>...</section>` 即可。完成上述修改并推送到云端后，抽奖限制就彻底解除了！
