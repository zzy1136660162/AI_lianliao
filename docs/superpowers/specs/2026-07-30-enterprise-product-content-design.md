# 企业码与重点产品内容展示设计

## 目标

在不改变现有 H5 接口行为的前提下，完善 Electron 企业码和重点产品页面：

- 企业码列表中的重点产品兼容历史图片地址并正常显示。
- “查看详情”改为“查看更多”，移动到“重点产品”标题右侧。
- 企业码所属行业改为数据库驱动的下拉选项。
- 重点产品列表简介显示纯文本，快速预览和详情页安全渲染富文本。

## 已确认方案

### 行业选项

cloud-api 为桌面端新增独立行业选项接口，数据来源为：

```sql
SELECT INDUSTRY, COUNT(*) AS COMPANY_COUNT
FROM J_CY_COMPANY
WHERE DEL_SIGN = 'N'
  AND INDUSTRY IS NOT NULL
  AND TRIM(INDUSTRY) IS NOT NULL
GROUP BY INDUSTRY
HAVING COUNT(*) >= 10
ORDER BY COMPANY_COUNT DESC, INDUSTRY ASC
```

返回项包含 `industry` 和 `companyCount`。Electron 新增 `company.industries` 跨进程操作，通过主进程固定白名单路由访问；渲染进程不直接请求网络。企业码筛选使用可搜索、可清空的 Ant Design Select，并在接口失败时保持页面和其他筛选可用。

不采用前端静态列表或当前分页数据推导，因为两者会遗漏行业并随数据库变化而过期。

### 历史图片地址兼容

在现有企业图片安全解析器中集中实现 PC 端兼容规则：

- 无协议的产品图片路径以 `https://img.lslnii.com/` 为基准。
- 协议相对地址统一使用 HTTPS。
- 可信业务域名的 HTTP 地址升级为 HTTPS。
- `www.gytaobao.cn:9328`、`www.gytaobao.cn:9428`、`video.gytaobao.cn` 和 `sjbang.lslnii.com` 的已知旧目录映射到现有 `www.lslnii.com` HTTPS 文件目录。
- 仅允许明确列出的业务图片域名、默认端口和无认证信息 URL；其他地址继续失败关闭。

该规则同时用于企业 Logo、企业码重点产品、重点产品列表和详情主图。富文本内图片在 HTML 清理后也使用同一地址策略，不能通过富文本绕过域名限制。

### 企业码重点产品布局

保留当前每家企业最多三项重点产品的结构：

- 标题行左侧显示“重点产品”和数量，右侧显示“查看更多”。
- 删除底部详情按钮，释放纵向空间。
- 产品图片预览高度增加，名称仍保持单行省略。
- “查看更多”仍进入企业详情；点击产品图片或名称仍进入对应产品详情。
- 空产品、图片加载失败、键盘操作和响应式布局保持现有降级行为。

### 产品简介显示

新增渲染层产品 HTML 工具，职责分离：

- `toPlainProductText`：解析 HTML、删除标签、解码实体、合并空白，供产品列表卡片使用。
- `sanitizeProductHtml`：使用 DOMPurify 删除脚本、事件属性、危险协议和不受信任资源，供快速预览与详情页使用。
- 富文本链接使用安全的 `target`/`rel` 策略；图片使用历史地址兼容规则，无法安全解析的图片移除。
- 空内容继续显示现有国际化“暂无”文案。

DOMPurify 作为项目直接依赖声明，避免依赖 Mermaid 的传递依赖。

## 接口与类型

新增共享类型：

```ts
export type EnterpriseIndustryOption = {
  industry: string;
  companyCount: number;
};
```

新增操作：

```ts
{ operation: 'company.industries'; payload: Record<string, never> }
{ operation: 'company.industries'; data: EnterpriseIndustryOption[] }
```

响应必须是普通数组，每项行业名称非空、数量为不小于 10 的安全整数；异常响应按现有 `INVALID_RESPONSE` 处理。

## 错误与降级

- 行业接口失败不阻断企业列表，只让行业下拉保留当前已选值并不显示远端选项。
- 图片兼容失败显示现有占位图标或无图文案。
- 富文本清理失败或清理结果为空时显示现有缺失文案。
- 不记录原始产品 HTML、用户身份、数据库凭据或外部资源内容。

## 验证

- cloud-api：Mapper 合同测试、服务编译。
- Electron：跨进程请求/响应校验、图片地址规则、HTML 纯文本与清理规则、行业下拉 DOM 行为、产品列表/预览/详情 DOM 行为。
- 国际化：更新全部配置语言，重新生成类型并运行结构检查。
- 完成前运行受影响测试、TypeScript、lint/format 检查和桌面构建。
