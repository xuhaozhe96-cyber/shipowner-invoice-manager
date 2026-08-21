# Shipowner Invoice Manager — Online

这是 Shipowner Invoice Manager 的私有在线版本，可在 Windows 和 Mac 的浏览器中使用。

## 已实现功能

- 上传一个或多个 PDF，提取文本并预填船名、ETA、船东、账单号、集装箱等字段
- 人工校正字段；点击集装箱号可随时重新编辑原账单
- 保存人工校正后的版式样本；再次上传相似账单时，根据字段所在位置填写新的船名、账单号、箱号、B/L 和金额，不会复制上一张账单的动态值
- COSCO 专属解析支持反向排列的字段、费用名称与金额配对；箱号使用 ISO 6346 校验位检查，费用合计会与总金额交叉核对
- 相同账单号只保留一份，避免重复录入
- 按 `Vessel / Voyage / ETA` 汇总，按 ETA 从早到晚排列，并支持结束/恢复
- 按船东和集装箱汇总 B/L、箱型、多张账单及合计金额
- COSCO 专用索要账单邮件，默认收件人为 `Releases@coscoshipping.co.uk`
- 上传或直接从剪贴板粘贴多张付款截图
- 逐柜标记 Release 状态
- 批量或逐柜设置 Last Free Day 和提柜日期，自动计算延长天数并生成邮件
- 上传延长免租期账单，再次审核并加入付款汇总
- 导出 Excel

## 数据与访问

- 结构化数据保存在 Sites D1 数据库中
- PDF 和付款截图保存在 Sites R2 文件存储中
- 生产站点使用 Sites 私有访问，访问者需要登录获授权的 ChatGPT 账号

## 本地开发

需要 Node.js 22.13 或更高版本以及 pnpm。

```bash
pnpm install
pnpm dev
```

构建和测试：

```bash
pnpm test
```

数据库表定义在 `db/schema.ts`，Drizzle migration 位于 `drizzle/`。

## 迁移旧版 Flask 数据

仓库根目录的 `migrate_online.py` 会把旧版 SQLite、PDF 和付款截图迁入在线站点。迁移接口只有在生产环境临时设置了 `MIGRATION_SECRET` 时才可用；迁移完成后应立即删除该变量。
