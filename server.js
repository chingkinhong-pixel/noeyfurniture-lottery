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
    registerTime: { type: String, default: () => new Date().toLocaleString() },
    rewards: [{ name: String, time: String }],
    pendingPrize: { type: String, default: "" }, 
    claimInfo: { userName: String, city: String, stage: String, layout: String, budget: String },
    // 【新增】分享裂变相关字段
    shareStatus: { type: Number, default: 0 }, // 0: 未完成任务, 1: 已完成(已加次数)
    invitees: [{ type: String }],              // 邀请注册成功的好友手机号列表
    clickCount: { type: Number, default: 0 }   // 专属链接被点击的次数
});
const User = mongoose.model('User', userSchema);

const customerSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: { type: String, default: "-" },
    registerTime: { type: String, default: () => new Date().toLocaleString() },
    source: { type: String, default: "抽奖活动" },
    stage: { type: String, default: "初步了解" },
    budget: { type: String, default: "未确定" },
    layout: { type: String, default: "未确定" },
    needType: { type: String, default: "未确定" },
    followUpStatus: { type: String, default: "新客户" },
    remark: { type: String, default: "" }
});
const Customer = mongoose.model('Customer', customerSchema);

const rewardRecordSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    userName: { type: String, default: "-" },
    prizeName: { type: String, required: true },
    prizeType: { type: String, default: "常规奖品" },
    winTime: { type: String, required: true },
    claimStatus: { type: String, default: "未领取" }
});
const RewardRecord = mongoose.model('RewardRecord', rewardRecordSchema);

const prizeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    weight: { type: Number, required: true }
});
const Prize = mongoose.model('Prize', prizeSchema);

const configSchema = new mongoose.Schema({
    identifier: { type: String, default: "global", unique: true },
    title: String, subtitle: String, paymentCopy: String, qrCodeUrl: String, rules: Array, brandPhilosophy: String, logoColorUrl: String, logoBlackUrl: String, logoWhiteUrl: String
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
                { name: "NOEY DESIGN GIFT - 设计师床头柜", weight: 2 }, { name: "NOEY COLLECTION - 极简边几", weight: 8 },
                { name: "CUSTOM UPGRADE - 拉直器2套", weight: 30 }, { name: "HOME BONUS - 定制优惠券500元", weight: 30 }, { name: "HOME BONUS - 定制优惠券1000元", weight: 30 }
            ]);
        }
        if (await Config.countDocuments() === 0) {
            await Config.create({ 
                identifier: "global", title: "NOEY 幸运礼遇", subtitle: "为每一位选择诺一家具的客户，准备专属定制礼物。",
                paymentCopy: "尊享专属设计方案，支付定金即刻解锁至臻礼遇。请扫码支付后联系您的专属设计师为您录入抽奖次数。", qrCodeUrl: "https://cdn.phototourl.com/free/2026-07-18-98c9e787-a88e-4b7d-969f-3cb31603a68c.png",
                rules: [{ condition: "设计方案定金", value: "3000元", reward: "1次" }, { condition: "家具订单", value: "20000元", reward: "3次" }, { condition: "整屋定制", value: "50000元以上", reward: "8次" }],
                brandPhilosophy: "以设计回应生活，以品质兑现承诺", logoColorUrl: "https://cdn.phototourl.com/free/2026-07-22-3304ec9f-26ef-4847-b0b1-f9287f713966.png", logoBlackUrl: "https://cdn.phototourl.com/free/2026-07-22-9af23acf-27a4-46c1-b357-9c86c6911389.png", logoWhiteUrl: "https://cdn.phototourl.com/free/2026-07-22-2a300550-48b9-41fb-acd5-778e3e3af16e.png"
            });
        }
    } catch (err) { console.error("初始化数据失败:", err); }
}
setTimeout(initData, 2000);

// ==========================================
// 4. 权限拦截器
// ==========================================
const requireAdmin = async (req, res, next) => {
    const phone = req.headers.authorization;
    const user = await User.findOne({ phone: phone, role: 'admin' });
    if (!user) return res.status(403).json({ error: '权限不足' });
    next();
};

// ==========================================
// 5. 前台业务 API 接口
// ==========================================
app.get('/api/config', async (req, res) => { res.json(await Config.findOne({ identifier: "global" }) || {}); });
app.get('/api/prizes', async (req, res) => { res.json(await Prize.find()); });
app.get('/api/stats', async (req, res) => {
    const users = await User.find({ role: 'user' });
    res.json({ totalUsers: users.length, totalRewards: users.reduce((sum, u) => sum + u.rewards.length, 0) });
});

app.get('/api/public/winners', async (req, res) => {
    try {
        const records = await RewardRecord.find({}).sort({ winTime: -1 }).limit(50);
        const safeRecords = records.map(r => ({
            userName: r.userName && r.userName !== '-' ? r.userName[0] + (r.userName.length > 1 ? (r.userName[1] === '先生' || r.userName[1] === '女士' ? r.userName.substring(1) : '**') : '女士') : '尊贵客户',
            phone: r.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2"),
            prizeName: r.prizeName.includes('-') ? r.prizeName.split('-')[1].trim() : (r.prizeName.includes('：') ? r.prizeName.split('：')[1].trim() : r.prizeName)
        }));
        res.json(safeRecords);
    } catch (e) {
        res.json([]);
    }
});

// 【新增】处理分享链接被点击，增加分享人的访问量
app.post('/api/invite/click', async (req, res) => {
    const { invite } = req.body;
    if (invite) {
        await User.updateOne({ phone: invite, role: 'user' }, { $inc: { clickCount: 1 } }).catch(()=>{});
    }
    res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, password, isAdminLogin, invite } = req.body;
        let user = await User.findOne({ phone: phone });

        if (isAdminLogin) {
            if (!user || user.password !== password || user.role !== 'admin') return res.status(401).json({ error: '管理员账号或密码错误' });
            return res.json({ token: user.phone, role: user.role });
        } else {
            if (user && user.role === 'admin') return res.status(403).json({ error: '管理员请通过专属通道登录' });
            
            // 【修改】如果是新用户，处理裂变邀请逻辑
            if (!user) {
                user = await User.create({ phone, role: 'user', chances: 1, rewards: [], pendingPrize: "", registerTime: new Date().toLocaleString() });
                
                // 处理邀请人奖励
                if (invite && invite !== phone) {
                    const inviter = await User.findOne({ phone: invite, role: 'user' });
                    if (inviter && !inviter.invitees.includes(phone)) {
                        inviter.invitees.push(phone);
                        // 当达到3人且任务未完成时，发放1次抽奖机会奖励
                        if (inviter.invitees.length >= 3 && inviter.shareStatus === 0) {
                            inviter.chances += 1;
                            inviter.shareStatus = 1; 
                        }
                        await inviter.save();
                    }
                }
            }
            await Customer.findOneAndUpdate(
                { phone }, 
                { $setOnInsert: { phone, registerTime: user.registerTime, source: invite ? `好友邀请(${invite})` : '抽奖活动' } }, 
                { upsert: true }
            );
            return res.json({ token: user.phone, role: user.role });
        }
    } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.get('/api/user', async (req, res) => {
    const user = await User.findOne({ phone: req.headers.authorization });
    user ? res.json(user) : res.status(404).json({ error: '用户不存在' });
});

app.post('/api/draw', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.headers.authorization });
        if (!user) return res.status(404).json({ error: '用户不存在' });
        if (user.pendingPrize) return res.status(400).json({ error: '您有尚未填写的奖品', hasPending: true });
        if (user.chances <= 0) return res.status(400).json({ error: '没有抽奖次数了' });

        const prizes = await Prize.find();
        let randomNum = Math.random() * prizes.reduce((sum, p) => sum + Number(p.weight), 0);
        let wonPrize = prizes[prizes.length - 1];
        for (let prize of prizes) {
            if (randomNum < prize.weight) { wonPrize = prize; break; }
            randomNum -= prize.weight;
        }

        user.chances -= 1;
        user.pendingPrize = wonPrize.name;
        await user.save(); 

        res.json({ prize: wonPrize, user: user });
    } catch (err) { res.status(500).json({ error: '抽奖失败' }); }
});

app.post('/api/claim', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.headers.authorization });
        if (!user || !user.pendingPrize) return res.status(400).json({ error: '无效请求' });

        const { userName, city, stage, layout, budget } = req.body;
        const winTime = new Date().toLocaleString();
        
        user.rewards.push({ name: user.pendingPrize, time: winTime });
        user.claimInfo = { userName, city, stage, layout, budget };
        const prizeToClaim = user.pendingPrize;
        user.pendingPrize = ""; 
        await user.save();

        let cleanName = userName;

        await Customer.findOneAndUpdate(
            { phone: user.phone },
            { name: cleanName, stage: stage, layout: layout, budget: budget, followUpStatus: "待联系" },
            { upsert: true }
        );

        await RewardRecord.create({
            phone: user.phone, userName: cleanName, prizeName: prizeToClaim, winTime: winTime, claimStatus: "未联系"
        });

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: '提交失败' }); }
});

app.post('/api/abandon', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.headers.authorization });
        if (user && user.pendingPrize) { user.pendingPrize = ""; await user.save(); }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: '操作失败' }); }
});

// ==========================================
// 6. 后台管理独立模块 API
// ==========================================
app.post('/api/config', requireAdmin, async (req, res) => {
    await Config.findOneAndUpdate({ identifier: "global" }, req.body, { upsert: true });
    res.json({ success: true });
});
app.post('/api/admin/account', requireAdmin, async (req, res) => {
    const admin = await User.findOne({ role: 'admin' });
    if (admin) { admin.phone = req.body.phone; if (req.body.password) admin.password = req.body.password; await admin.save(); }
    res.json({ success: true });
});
app.post('/api/admin/prizes', requireAdmin, async (req, res) => {
    await Prize.deleteMany({}); await Prize.insertMany(req.body); res.json({ success: true });
});
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = await User.find({ role: 'user' }).select('phone chances registerTime rewards');
    const admin = await User.findOne({ role: 'admin' }).select('phone');
    const prizes = await Prize.find();
    res.json({ users, admin, prizes });
});
app.put('/api/admin/users/:phone/chances', requireAdmin, async (req, res) => {
    await User.updateOne({ phone: req.params.phone, role: 'user' }, { chances: req.body.chances });
    res.json({ success: true });
});
app.post('/api/admin/reset-rewards', requireAdmin, async (req, res) => {
    await User.updateOne({ phone: req.body.phone, role: 'user' }, { rewards: [], pendingPrize: "" });
    await RewardRecord.deleteMany({ phone: req.body.phone });
    res.json({ success: true });
});
app.get('/api/admin/customers', requireAdmin, async (req, res) => {
    const allUsers = await User.find({ role: 'user' });
    for (let u of allUsers) {
        await Customer.updateOne(
            { phone: u.phone },
            { $setOnInsert: { phone: u.phone, registerTime: u.registerTime || new Date().toLocaleString(), name: u.claimInfo?.userName || '-' } },
            { upsert: true }
        );
    }
    const customers = await Customer.find().sort({ registerTime: -1 });
    res.json(customers);
});
app.put('/api/admin/customers/:phone', requireAdmin, async (req, res) => {
    await Customer.updateOne({ phone: req.params.phone }, req.body);
    res.json({ success: true });
});
app.get('/api/admin/rewards', requireAdmin, async (req, res) => {
    const records = await RewardRecord.find().sort({ winTime: -1 });
    res.json(records);
});
app.put('/api/admin/rewards/:id', requireAdmin, async (req, res) => {
    await RewardRecord.findByIdAndUpdate(req.params.id, { claimStatus: req.body.claimStatus });
    res.json({ success: true });
});

// 【新增】获取分享裂变管理列表
app.get('/api/admin/shares', requireAdmin, async (req, res) => {
    // 找出所有点击量大于0，或者成功邀请过人的用户
    const shares = await User.find({ 
        role: 'user', 
        $or: [{ clickCount: { $gt: 0 } }, { 'invitees.0': { $exists: true } }] 
    }).select('phone shareStatus clickCount invitees registerTime').sort({ 'invitees.length': -1, clickCount: -1 });
    res.json(shares);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`\n🚀 NOEY 服务已启动! 运行在端口: ${PORT}\n`); });
