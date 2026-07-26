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
    shareStatus: { type: Number, default: 0 }, 
    invitees: [{ type: String }],              
    clickCount: { type: Number, default: 0 },
    phoneVerified: { type: Boolean, default: true },
    // 【新增】用户状态：active正常, deleted已软删除, invalid异常
    status: { type: String, default: 'active' }
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
    tags: { type: [String], default: [] },
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
    weight: { type: Number, required: true },
    cost: { type: Number, default: 0 }
});
const Prize = mongoose.model('Prize', prizeSchema);

const configSchema = new mongoose.Schema({
    identifier: { type: String, default: "global", unique: true },
    title: String, subtitle: String, paymentCopy: String, qrCodeUrl: String, rules: Array, brandPhilosophy: String, logoColorUrl: String, logoBlackUrl: String, logoWhiteUrl: String
});
const Config = mongoose.model('Config', configSchema);

// ==========================================
// 3. 自动初始化与异常数据清洗
// ==========================================
async function initData() {
    try {
        if (await User.countDocuments() === 0) {
            await User.create({ phone: "15728656310", password: "000000", role: "admin", chances: 0, rewards: [] });
            console.log("初始化: 管理员账号已创建");
        }
        if (await Prize.countDocuments() === 0) {
            await Prize.insertMany([
                { name: "NOEY DESIGN GIFT - 设计师床头柜", weight: 2, cost: 800 }, 
                { name: "NOEY COLLECTION - 极简边几", weight: 8, cost: 500 },
                { name: "CUSTOM UPGRADE - 拉直器2套", weight: 30, cost: 200 }, 
                { name: "HOME BONUS - 定制优惠券500元", weight: 30, cost: 0 }, 
                { name: "HOME BONUS - 定制优惠券1000元", weight: 30, cost: 0 }
            ]);
        }
        if (await Config.countDocuments() === 0) {
            await Config.create({ 
                identifier: "global", title: "NOEY 幸运礼遇", subtitle: "为每一位选择诺一家具的客户，准备专属定制礼物。",
                paymentCopy: "尊享专属设计方案，支付定金即刻解锁至臻礼遇。请扫码支付后联系您的专属设计师为您录入抽奖次数。", 
                qrCodeUrl: "https://cdn.phototourl.com/free/2026-07-18-98c9e787-a88e-4b7d-969f-3cb31603a68c.png",
                rules: [{ condition: "设计方案定金", value: "3000元", reward: "1次" }, { condition: "家具订单", value: "20000元", reward: "3次" }, { condition: "整屋定制", value: "50000元以上", reward: "8次" }],
                brandPhilosophy: "以设计回应生活，以品质兑现承诺", logoColorUrl: "https://cdn.phototourl.com/free/2026-07-22-3304ec9f-26ef-4847-b0b1-f9287f713966.png", logoBlackUrl: "https://cdn.phototourl.com/free/2026-07-22-9af23acf-27a4-46c1-b357-9c86c6911389.png", logoWhiteUrl: "https://cdn.phototourl.com/free/2026-07-22-2a300550-48b9-41fb-acd5-778e3e3af16e.png"
            });
        }

        // 启动时自动清洗：将过去非法手机号直接打上 invalid 标签以便后台一键清零
        const allUsers = await User.find({ role: 'user' });
        const phoneRegex = /^1[3-9]\d{9}$/;
        for (let u of allUsers) {
            if (!phoneRegex.test(u.phone) && u.status === 'active') {
                await User.updateOne({ _id: u._id }, { status: 'invalid', phoneVerified: false });
            } else if (phoneRegex.test(u.phone) && u.status === 'invalid') {
                await User.updateOne({ _id: u._id }, { status: 'active', phoneVerified: true });
            }
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
    const users = await User.find({ role: 'user', status: 'active' });
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
    } catch (e) { res.json([]); }
});
app.post('/api/invite/click', async (req, res) => {
    const { invite } = req.body;
    if (invite) await User.updateOne({ phone: invite, role: 'user' }, { $inc: { clickCount: 1 } }).catch(()=>{});
    res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
    try {
        const { phone, password, isAdminLogin, invite } = req.body;
        
        const phoneRegex = /^1[3-9]\d{9}$/;
        if (!phone || !phoneRegex.test(phone)) return res.status(400).json({ error: '手机号格式错误' });

        let user = await User.findOne({ phone: phone });

        if (isAdminLogin) {
            if (!user || user.password !== password || user.role !== 'admin') return res.status(401).json({ error: '管理员账号或密码错误' });
            return res.json({ token: user.phone, role: user.role });
        } else {
            if (user && user.role === 'admin') return res.status(403).json({ error: '管理员请通过专属通道登录' });
            if (user && user.status === 'deleted') return res.status(403).json({ error: '该账号已被冻结' });
            
            if (!user) {
                user = await User.create({ phone, role: 'user', chances: 1, rewards: [], pendingPrize: "", phoneVerified: true, registerTime: new Date().toLocaleString() });
                if (invite && invite !== phone) {
                    const inviter = await User.findOne({ phone: invite, role: 'user', status: 'active' });
                    if (inviter && !inviter.invitees.includes(phone)) {
                        inviter.invitees.push(phone);
                        if (inviter.invitees.length >= 3 && inviter.shareStatus === 0) {
                            inviter.chances += 1; inviter.shareStatus = 1; 
                        }
                        await inviter.save();
                    }
                }
            }
            await Customer.findOneAndUpdate(
                { phone }, 
                { $setOnInsert: { phone, registerTime: user.registerTime, source: invite ? `分享邀请` : '自然访问' } }, 
                { upsert: true }
            );
            return res.json({ token: user.phone, role: user.role });
        }
    } catch (err) { res.status(500).json({ error: '服务器错误' }); }
});

app.get('/api/user', async (req, res) => {
    const user = await User.findOne({ phone: req.headers.authorization, status: 'active' });
    user ? res.json(user) : res.status(404).json({ error: '用户不存在或被封禁' });
});
app.post('/api/draw', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.headers.authorization, status: 'active' });
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

        await Customer.findOneAndUpdate(
            { phone: user.phone },
            { name: userName, stage: stage, layout: layout, budget: budget, followUpStatus: "新客户" },
            { upsert: true }
        );

        await RewardRecord.create({ phone: user.phone, userName: userName, prizeName: prizeToClaim, winTime: winTime, claimStatus: "未领取" });
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
// 6. 后台数据分析聚合中枢 API 
// ==========================================
app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const users = await User.find({ role: 'user', status: 'active' });
        const records = await RewardRecord.find();
        const customers = await Customer.find();
        const prizes = await Prize.find();

        const todayStr = new Date().toLocaleDateString();

        const totalUsers = users.length;
        const todayNewUsers = users.filter(u => u.registerTime && u.registerTime.includes(todayStr)).length;
        const totalDraws = records.length;
        const todayDraws = records.filter(r => r.winTime && r.winTime.includes(todayStr)).length;
        const remainingChances = users.reduce((sum, u) => sum + (u.chances || 0), 0);
        const avgDraws = totalUsers > 0 ? (totalDraws / totalUsers).toFixed(1) : 0;

        let totalCost = 0;
        const prizeStats = {};
        prizes.forEach(p => { prizeStats[p.name] = { count: 0, cost: p.cost || 0 }; });

        records.forEach(r => {
            if (prizeStats[r.prizeName]) {
                prizeStats[r.prizeName].count++;
                totalCost += prizeStats[r.prizeName].cost;
            } else {
                prizeStats[r.prizeName] = { count: 1, cost: 0 };
            }
        });

        const totalCustomers = customers.length;
        const cac = totalCustomers > 0 ? (totalCost / totalCustomers).toFixed(2) : 0;
        const sharers = users.filter(u => u.shareStatus > 0 || u.clickCount > 0 || u.invitees.length > 0);
        const totalShareClicks = sharers.reduce((sum, u) => sum + (u.clickCount || 0), 0);
        const totalShareRegisters = sharers.reduce((sum, u) => sum + (u.invitees ? u.invitees.length : 0), 0);

        const funnel = { '新客户': 0, '未联系': 0, '已咨询': 0, '已量房': 0, '已报价': 0, '已成交': 0, '已完成安装': 0, '暂无需求': 0 };
        customers.forEach(c => {
            const status = c.followUpStatus || '新客户';
            if (funnel[status] !== undefined) funnel[status]++;
        });

        res.json({
            users: { total: totalUsers, today: todayNewUsers },
            draws: { total: totalDraws, today: todayDraws, remaining: remainingChances, avg: avgDraws },
            prizes: prizeStats,
            roi: { totalCost, cac, convertedCustomers: totalCustomers },
            shares: { sharers: sharers.length, clicks: totalShareClicks, registers: totalShareRegisters },
            funnel
        });
    } catch (e) { res.status(500).json({ error: "聚合数据失败" }); }
});

// ==========================================
// 7. 基础后台管理接口
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

// 【核心修改】读取用户接口，拉取所有用户包括被软删除的
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = await User.find({ role: 'user' }).select('phone chances registerTime rewards phoneVerified status');
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

// 【核心新增】智能批量软删除/硬删除用户接口
app.post('/api/admin/users/batch-delete', requireAdmin, async (req, res) => {
    try {
        const { phones } = req.body;
        if (!phones || !phones.length) return res.status(400).json({ error: '无效请求' });

        let deletedHard = 0; let deletedSoft = 0;

        for (let phone of phones) {
            // 查证是否在其他集合有绑定
            const hasRewards = await RewardRecord.exists({ phone });
            const hasCustomer = await Customer.exists({ phone, followUpStatus: { $ne: '暂无需求' } });

            if (hasRewards || hasCustomer) {
                // 如果有关联营销进度，进行软删除保护
                await User.updateOne({ phone, role: 'user' }, { status: 'deleted' });
                deletedSoft++;
            } else {
                // 如果完全是没有业务价值的纯空壳/异常号码，进行物理硬删除清理磁盘
                await User.deleteOne({ phone, role: 'user' });
                // 清理可能遗留的空客户档案
                await Customer.deleteOne({ phone });
                deletedHard++;
            }
        }
        res.json({ success: true, deletedHard, deletedSoft });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '批量删除失败' });
    }
});


app.get('/api/admin/customers', requireAdmin, async (req, res) => {
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
app.get('/api/admin/shares', requireAdmin, async (req, res) => {
    const shares = await User.find({ role: 'user', $or: [{ clickCount: { $gt: 0 } }, { 'invitees.0': { $exists: true } }] }).select('phone shareStatus clickCount invitees registerTime').sort({ 'invitees.length': -1, clickCount: -1 });
    res.json(shares);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`\n🚀 NOEY 服务已启动! 运行在端口: ${PORT}\n`); });
