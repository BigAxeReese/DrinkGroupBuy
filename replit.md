# Replit Agent Instructions

先遵守 repository root 的 `AGENTS.md`；它是共享工作規則與 Progressive Context Loading（漸進式 Context 載入）入口。本檔不另存一套專案狀態或架構。

- 不要因為 `docs/` 存在就全部載入；依 `AGENTS.md` 的任務路由，只讀直接相關 source 與必要文件。
- 目前進度只看 `PROGRESS.md`，實際行為仍以 implementation 與本次 validation 為準。
- 延續現有 React Native／Expo、Node.js、SQLite／PostgreSQL repository 架構，不在任務外重新設計、升級 dependency 或修改產品流程。
- 保留既有未提交修改；同一 implementation task 遵守 single-writer principle，不與其他 Agent 同時改同一範圍。
- 不顯示或提交 secret，不啟用真金流、production scheduler、外部部署或其他有成本／副作用的操作，除非使用者明確授權。
- 重要狀態改變時依 `docs/progress-tracking-rules.md` 更新 `PROGRESS.md`；架構或產品規則只有真的改變時才更新對應共享文件。
