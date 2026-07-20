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
    rewards: [{ name: String, time: String }]
});
const User = mongoose.model('User', userSchema);

const prizeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    weight: { type: Number, required: true }
});
const Prize = mongoose.model('Prize', prizeSchema);

// 新增：客户线索(中奖领取登记)模型
const leadSchema = new mongoose.Schema({
    userName: String,
    userPhone: String,
    city: String,
    stage: String,
    layout: String,
    budget: String,
    prizeName: String,
    claimTime: String,
    status: { type: String, default: "新客户" } // 新客户, 已联系, 已预约, 已成交, 无效
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
    // 新增：活动时间配置
    startTime: { type: Date, default: new Date() },
    endTime: { type: Date, default: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000) }
});
const Config = mongoose.model('Config', configSchema);
// 抽奖逻辑校验新增时间判断
app.post('/api/draw', async (req, res) => {
    try {
        const config = await Config.findOne({ identifier: "global" });
        const now = new Date();
        if (now < config.startTime || now > config.endTime) {
            return res.status(400).json({ error: '本期活动已结束，感谢关注' });
        }
        
        const phone = req.headers.authorization;
        const user = await User.findOne({ phone: phone });
        // ... existing code (原抽奖逻辑) ...
        user.chances -= 1;
        user.rewards.push({ name: wonPrize.name, time: new Date().toLocaleString() });
        await user.save(); 
        res.json({ prize: wonPrize, user: user });
    } catch (err) { res.status(500).json({ error: '抽奖失败' }); }
});

// 新增：前端提交领奖登记信息
app.post('/api/claim', async (req, res) => {
    try {
        const phone = req.headers.authorization;
        if (!phone) return res.status(401).json({ error: '非法请求' });
        
        const newLead = await Lead.create({
            userName: req.body.userName,
            userPhone: req.body.userPhone || phone,
            city: req.body.city,
            stage: req.body.stage,
            layout: req.body.layout,
            budget: req.body.budget,
            prizeName: req.body.prizeName,
            claimTime: new Date().toLocaleString(),
            status: '新客户'
        });
        res.json({ success: true, lead: newLead });
    } catch (err) { res.status(500).json({ error: '提交失败' }); }
});

// 新增：后台获取中奖客户线索列表 (倒序排列，新线索在前)
app.get('/api/admin/leads', requireAdmin, async (req, res) => {
    const leads = await Lead.find().sort({ _id: -1 });
    res.json(leads);
});

// 新增：后台销售更新线索跟进状态
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
