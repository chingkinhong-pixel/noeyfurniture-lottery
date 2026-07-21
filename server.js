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
    // 新增字段：处理强制登记和信息暂存逻辑
    pendingPrize: { type: String, default: "" }, // 暂存刚抽中但未领取的奖品
    claimInfo: { 
        userName: String, 
        userPhone: String,
        city: String,
        stage: String,
        layout: String,
        budget: String
    }
});
const User = mongoose.model('User', userSchema);

const prizeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    weight: { type: Number, required: true }
});
const Prize = mongoose.model('Prize', prizeSchema);

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
    logoWhiteUrl: String
});
const Config = mongoose.model('Config', configSchema);

// ==========================================
// 3. 自动初始化数据 (如果数据库为空)
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
        const { phone, password, isAdminLogin } = req.body;
        let user = await User.findOne({ phone: phone });

        if (isAdminLogin) {
            if (!user || user.password !== password || user.role !== 'admin') {
                return res.status(401).json({ error: '管理员账号或密码错误' });
            }
            return res.json({ token: user.phone, role: user.role });
        } else {
            if (user && user.role === 'admin') return res.status(403).json({ error: '管理员请通过专属通道登录' });
            if (!user) {
                user = await User.create({ phone, role: 'user', chances: 1, rewards: [], pendingPrize: "" });
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
        
        if (!user) return res.status(404).json({ error: '用户不存在' });
        
        // 如果用户有未处理的奖品，要求先处理
        if(user.pendingPrize) {
            return res.status(400).json({ error: '您有一个尚未领取的奖品，请先完善信息', hasPending: true });
        }
        
        if (user.chances <= 0) {
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

        // 修改核心：扣除次数，但不立即写入 rewards 数组，而是写入 pendingPrize 暂存
        user.chances -= 1;
        user.pendingPrize = wonPrize.name;
        await user.save(); 

        res.json({ prize: wonPrize, user: user });
    } catch (err) { res.status(500).json({ error: '抽奖失败' }); }
});

// 新增：领取奖品并提交信息
app.post('/api/claim', async (req, res) => {
    try {
        const phone = req.headers.authorization;
        const user = await User.findOne({ phone: phone });
        
        if (!user) return res.status(404).json({ error: '用户不存在' });
        if (!user.pendingPrize) return res.status(400).json({ error: '当前没有待领取的奖品' });

        const { userName, userPhone, city, stage, layout, budget } = req.body;

        // 将 pendingPrize 移入真正的 rewards 数组，完成发奖
        user.rewards.push({ name: user.pendingPrize, time: new Date().toLocaleString() });
        user.pendingPrize = ""; // 清空待领取状态
        
        // 保存用户提交的信息
        user.claimInfo = { userName, userPhone, city, stage, layout, budget };
        
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: '提交失败' }); }
});

// 新增：放弃奖品
app.post('/api/abandon', async (req, res) => {
    try {
        const phone = req.headers.authorization;
        const user = await User.findOne({ phone: phone });
        
        if (user && user.pendingPrize) {
            user.pendingPrize = ""; // 清空待领取状态，等于放弃奖品，次数之前已扣除不退回
            await user.save();
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: '操作失败' }); }
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

// 新增：管理员清空指定用户的所有奖品 (防止重复领取)
app.post('/api/admin/reset-rewards', requireAdmin, async (req, res) => {
    try {
        const { phone } = req.body;
        const user = await User.findOne({ phone: phone, role: 'user' });
        if(user) {
            user.rewards = [];
            user.pendingPrize = ""; // 一并清空可能卡住的暂存奖品
            await user.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: '未找到指定用户' });
        }
    } catch(err) {
        res.status(500).json({ error: '重置失败' });
    }
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
