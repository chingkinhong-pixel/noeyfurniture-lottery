const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// ----------------------------------------------------
// 🌟 核心修复：拦截根目录访问，自动跳转到登录页
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

const dataDir = path.join(__dirname, 'data');
// 确保 data 目录存在 (适配云环境)
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const usersFile = path.join(dataDir, 'users.json');
const prizesFile = path.join(dataDir, 'prizes.json');
const configFile = path.join(dataDir, 'config.json');

// 通用读写函数
const readData = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeData = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// 云环境初始化数据：如果文件丢失，自动重建默认数据，防止系统崩溃
function initData() {
    if (!fs.existsSync(usersFile)) {
        writeData(usersFile, [{ phone: "15728656310", password: "000000", role: "admin", chances: 0, rewards: [] }]);
    }
    if (!fs.existsSync(prizesFile)) {
        writeData(prizesFile, [
            { name: "一等奖：床头柜", weight: 2 }, { name: "二等奖：小凳子", weight: 8 },
            { name: "升级：拉直器", weight: 30 }, { name: "优惠券500", weight: 30 }, { name: "安慰奖", weight: 30 }
        ]);
    }
    if (!fs.existsSync(configFile)) {
        writeData(configFile, { title: "ARTISAN 高级定制抽奖", subtitle: "感恩回馈专属活动" });
    }
}
initData(); // 启动时强制执行

// 权限拦截器
const requireAdmin = (req, res, next) => {
    const phone = req.headers.authorization;
    const users = readData(usersFile);
    const user = users.find(u => u.phone === phone);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    next();
};

// --- API 接口 ---
app.get('/api/config', (req, res) => res.json(readData(configFile)));

app.post('/api/config', requireAdmin, (req, res) => {
    writeData(configFile, req.body);
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { phone, password, isAdminLogin } = req.body;
    let users = readData(usersFile);
    let user = users.find(u => u.phone === phone);

    if (isAdminLogin) {
        if (!user || user.password !== password || user.role !== 'admin') {
            return res.status(401).json({ error: '管理员账号或密码错误' });
        }
        return res.json({ token: user.phone, role: user.role });
    } else {
        if (user && user.role === 'admin') return res.status(403).json({ error: '管理员请通过专属通道登录' });
        if (!user) {
            user = { phone, role: 'user', chances: 1, rewards: [] };
            users.push(user);
            writeData(usersFile, users);
        }
        return res.json({ token: user.phone, role: user.role });
    }
});

app.get('/api/user', (req, res) => {
    const phone = req.headers.authorization;
    const user = readData(usersFile).find(u => u.phone === phone);
    user ? res.json(user) : res.status(404).json({ error: '用户不存在' });
});

app.post('/api/draw', (req, res) => {
    const phone = req.headers.authorization;
    let users = readData(usersFile);
    const userIndex = users.findIndex(u => u.phone === phone);
    
    if (userIndex === -1 || users[userIndex].chances <= 0) {
        return res.status(400).json({ error: '没有抽奖次数了' });
    }

    const prizes = readData(prizesFile);
    const totalWeight = prizes.reduce((sum, p) => sum + Number(p.weight), 0);
    let randomNum = Math.random() * totalWeight;
    let wonPrize = prizes[prizes.length - 1];

    for (let prize of prizes) {
        if (randomNum < prize.weight) { wonPrize = prize; break; }
        randomNum -= prize.weight;
    }

    users[userIndex].chances -= 1;
    users[userIndex].rewards.push({ name: wonPrize.name, time: new Date().toLocaleString() });
    writeData(usersFile, users);

    res.json({ prize: wonPrize, user: users[userIndex] });
});

app.get('/api/admin/data', requireAdmin, (req, res) => {
    res.json({ users: readData(usersFile).filter(u=>u.role!=='admin'), prizes: readData(prizesFile), admin: readData(usersFile).find(u=>u.role==='admin') });
});

app.post('/api/admin/prizes', requireAdmin, (req, res) => {
    writeData(prizesFile, req.body);
    res.json({ success: true });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
    let users = readData(usersFile);
    const adminUser = users.find(u => u.role === 'admin');
    users = req.body;
    users.push(adminUser);
    writeData(usersFile, users);
    res.json({ success: true });
});

app.post('/api/admin/account', requireAdmin, (req, res) => {
    let users = readData(usersFile);
    let adminIndex = users.findIndex(u => u.role === 'admin');
    users[adminIndex].phone = req.body.phone;
    if (req.body.password) users[adminIndex].password = req.body.password;
    writeData(usersFile, users);
    res.json({ success: true });
});

// 关键修改：兼容云平台的动态端口分配
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 服务已启动! 运行在端口: ${PORT}\n`);
});