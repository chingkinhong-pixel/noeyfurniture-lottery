const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ==========================================
// 1. 数据库连接设置
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://你的账号:你的密码@cluster0.xxxx.mongodb.net/lottery?retryWrites=true&w=majority";

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB 云数据库连接成功！'))
    .catch(err => console.error('❌ MongoDB 连接失败:', err));

// ==========================================
// 2. 定义数据模型 (Schema)
// ==========================================
const userSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, default: "" },
    role: { type: String, default: "user" },
    chances: { type: Number, default: 1 },
    rewards: [{ name: String, time: String }],
    // 新增：裂变拉新数据追踪
    shareCount: { type: Number, default: 0 },
    inviteCount: { type: Number, default: 0 },
    hasShared: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const prizeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    weight: { type: Number, required: true }
});
const Prize = mongoose.model('Prize', prizeSchema);

const leadSchema = new mongoose.Schema({
    userName: String,
    userPhone: String,
    city: String,
    stage: String,
    layout: String,
    budget: String,
    prizeName: String,
    claimTime: String,
    status: { type: String, default: "新客户" } 
});
const Lead = mongoose.model('Lead', leadSchema);

const configSchema = new mongoose.Schema({
    identifier: { type: String, default: "global", unique: true },
    title: String,
    subtitle: String,
    paymentCopy: String,
    qrCodeUrl: String,
    rules: Array,
    brandPhilosophy: String,
    logoColorUrl: String,
    logoBlackUrl: String,
    logoWhiteUrl: String,
    startTime: { type: Date, default: new Date() },
    endTime: { type: Date, default: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000) }
});
const Config = mongoose.model('Config', configSchema);

// ==========================================
// 3. 自动初始化数据
// ==========================================
async function initData() {
    try {
        if (await User.countDocuments() === 0) {
            await User.create({ phone: "15728656310", password: "000000", role: "admin", chances: 0, rewards: [] });
            console.log("初始化: 管理员账号已创建");
        }
        if (await Prize.countDocuments() === 0) {
            await Prize.insertMany([
                { name: "NOEY DESIGN GIFT - 设计师床头柜", weight: 2 }, 
                { name: "NOEY COLLECTION - 极简边几", weight: 8 },
                { name: "CUSTOM UPGRADE - 拉直器2套", weight: 30 }, 
                { name: "HOME BONUS - 定制优惠券500元", weight: 30 }, 
                { name: "HOME BONUS - 定制优惠券1000元", weight: 30 }
            ]);
            console.log("初始化: 默认奖品池已创建");
        }
        if (await Config.countDocuments() === 0) {
            await Config.create({ 
                identifier: "global",
                title: "NOEY 幸运礼遇", 
                subtitle: "为每一位选择诺一家具的客户，准备专属定制礼物。",
                paymentCopy: "尊享专属设计方案，支付定金即刻解锁至臻礼遇。请扫码支付后联系您的专属设计师为您录入抽奖次数。",
                qrCodeUrl: "https://cdn.phototourl.com/free/2026-07-18-98c9e787-a88e-4b7d-969f-3cb31603a68c.png",
                rules: [
                    { condition: "设计方案定金", value: "3000元", reward: "1次" },
                    { condition: "家具订单", value: "20000元", reward: "3次" },
                    { condition: "整屋定制", value: "50000元以上", reward: "8次" }
                ],
                brandPhilosophy: "以设计回应生活，以品质兑现承诺",
                logoColorUrl: "https://i.hd-r.cn/0f8d5bee-a893-4a9d-acd6-d8a9c5b4357f.png",
                logoBlackUrl: "https://i.hd-r.cn/10eebc24-8a58-463e-9433-0e7d54bada9c.png",
                logoWhiteUrl: "https://i.hd-r.cn/10e4b29a-4ea1-4f46-884c-ff4e913cd476.png"
            });
            console.log("初始化: 全局配置已创建");
        }
    } catch (err) { console.error("初始化数据失败:", err); }
}
setTimeout(initData, 2000);

// ==========================================
// 4. 权限拦截器 (中间件)
// ==========================================
const requireAdmin = async (req, res, next) => {
    const phone = req.headers.authorization;
    const user = await User.findOne({ phone: phone, role: 'admin' });
    if (!user) return res.status(403).json({ error: '权限不足' });
    next();
};

// ==========================================
// 5. API 接口
// ==========================================
app.get('/api/config', async (req, res) => {
    const config = await Config.findOne({ identifier: "global" });
    res.json(config || {});
});

app.post('/api/config', requireAdmin, async (req, res) => {
    await Config.findOneAndUpdate({ identifier: "global" }, req.body, { upsert: true });
    res.json({ success: true });
});

app.get('/api/prizes', async (req, res) => {
    const prizes = await Prize.find();
    res.json(prizes);
});

app.get('/api/stats', async (req, res) => {
    const users = await User.find({ role: 'user' });
    const totalUsers = users.length;
    const totalRewards = users.reduce((sum, u) => sum + u.rewards.length, 0);
    res.json({ totalUsers: totalUsers, totalRewards: totalRewards });
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, password, isAdminLogin, inviter } = req.body;
        let user = await User.findOne({ phone: phone });

        if (isAdminLogin) {
            if (!user || user.password !== password || user.role !== 'admin') {
                return res.status(401).json({ error: '管理员账号或密码错误' });
            }
            return res.json({ token: user.phone, role: user.role });
        } else {
            if (user && user.role === 'admin') return res.status(403).json({ error: '管理员请通过专属通道登录' });
            if (!user) {
                user = await User.create({ phone, role: 'user', chances: 1, rewards: [] });
                // 核心：处理朋友扫码带来的裂变邀请逻辑
                if (inviter && inviter !== phone) {
                    await User.updateOne({ phone: inviter }, { $inc: { inviteCount: 1 } });
                }
            }
            return res.json({ token: user.phone, role: user.role });
        }
    } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

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
        let randomNum = Math.random() * totalWeight;
        let wonPrize = prizes[prizes.length - 1];

        for (let prize of prizes) {
            if (randomNum < prize.weight) { wonPrize = prize; break; }
            randomNum -= prize.weight;
        }

        user.chances -= 1;
        user.rewards.push({ name: wonPrize.name, time: new Date().toLocaleString() });
        await user.save(); 

        res.json({ prize: wonPrize, user: user });
    } catch (err) { res.status(500).json({ error: '抽奖失败' }); }
});

// ==========================================
// 新增：分享奖励接口
// ==========================================
app.post('/api/share', async (req, res) => {
    try {
        const phone = req.headers.authorization;
        const user = await User.findOne({ phone: phone });
        if (!user) return res.status(401).json({ error: '非法请求' });

        user.shareCount = (user.shareCount || 0) + 1;
        let rewarded = false;
        
        // 防刷限制：每个账号仅限领取一次额外机会
        if (!user.hasShared) {
            user.chances += 1;
            user.hasShared = true;
            rewarded = true;
        }
        await user.save();
        res.json({ success: true, rewarded: rewarded, chances: user.chances });
    } catch (err) { res.status(500).json({ error: '分享记录失败' }); }
});

app.get('/api/admin/leads', requireAdmin, async (req, res) => {
    const leads = await Lead.find().sort({ _id: -1 });
    res.json(leads);
});

app.post('/api/admin/leads/status', requireAdmin, async (req, res) => {
    await Lead.findByIdAndUpdate(req.body.id, { status: req.body.status });
    res.json({ success: true });
});

app.get('/api/admin/data', requireAdmin, async (req, res) => {
    const users = await User.find({ role: 'user' });
    const prizes = await Prize.find();
    const admin = await User.findOne({ role: 'admin' });
    res.json({ users, prizes, admin });
});

app.post('/api/admin/prizes', requireAdmin, async (req, res) => {
    await Prize.deleteMany({}); 
    await Prize.insertMany(req.body); 
    res.json({ success: true });
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const incomingUsers = req.body;
    for (let u of incomingUsers) {
        if (u.phone && u.role !== 'admin') {
            await User.updateOne({ phone: u.phone }, { chances: u.chances });
        }
    }
    res.json({ success: true });
});

app.post('/api/admin/account', requireAdmin, async (req, res) => {
    const admin = await User.findOne({ role: 'admin' });
    if (admin) {
        admin.phone = req.body.phone;
        if (req.body.password) admin.password = req.body.password;
        await admin.save();
    }
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 服务已启动! 运行在端口: ${PORT}\n`);
});
