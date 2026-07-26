// ... existing code ...
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
            // 查证是否在中奖集合有绑定
            const hasRewards = await RewardRecord.exists({ phone });

            // 【连锁删除】直接清理 CRM 中的客户线索档案
            await Customer.deleteOne({ phone });

            if (hasRewards) {
                // 如果有关联的财务/发奖流水，对 User 进行软删除保护资金对账
                await User.updateOne({ phone, role: 'user' }, { status: 'deleted' });
                deletedSoft++;
            } else {
                // 如果连奖品都没有，直接对 User 进行物理硬删除清理磁盘
                await User.deleteOne({ phone, role: 'user' });
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
// ... existing code ...
```

### 修改说明：
* 我们调整了 `app.post('/api/admin/users/batch-delete')` 内的逻辑。
* 现在循环处理每个被删除的手机号时，会**强制执行** `await Customer.deleteOne({ phone })`。
* 这样一来，一旦在设置页面把这个用户删掉，他对应的客户档案就会被物理销毁，再刷新 `customer-management.html` 页面时，这个无关客户就彻底消失了，大大降低销售人员的干扰。
