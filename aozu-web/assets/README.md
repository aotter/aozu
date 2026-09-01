# AOZU 素材參考包

這裡的檔案是從原 App 素材複製的不可變參考副本，用來規劃 AOZU 首發角色、衣櫥、場景與卡片。AOZU 不會在 runtime 讀取原 App 路徑，修改本資料夾也不會反向改到原素材。

| AOZU 副本 | 原 App 來源 | 原始尺寸 | 規劃用途 | SHA-256 |
| --- | --- | --- | --- | --- |
| `reference/aotter-logo-red.svg` | `public/assets/brand/aotter-logo-red.svg` | SVG | 品牌參考 | `17aa6a0d6bc6c178c66ae72cf88464d683b86b1abc8533eb63817f14858e28ec` |
| `reference/mascot-otter-v1.png` | `public/assets/game/mascot-otter-v1.png` | 1024×1536 | 布丁獺 base body | `c3af37be5a4deba6bada96c180f94856338e9dd35a805e7052b1ece029f834d1` |
| `reference/otter-explorer-accessories-v1.png` | `public/assets/game/otter-explorer-accessories-v1.png` | 1024×1536 | 旅行任務探險配件 | `60994d0370261ffb7e963234c24e68aaa2d3f87e794616ed45eaa2a746b7a337` |
| `reference/scene-city-wide-v2.webp` | `public/assets/game/scene-city-wide-v2.webp` | 1672×941 | 城市旅行書／橫式預覽 | `6004826721bdc13f6ea3498727ccc64e5980429fccd2f9e6a3cf6569bf17eecb` |
| `reference/aotter-girl-card-v1.webp` | `public/assets/game/aotter-girl-card-v1.webp` | 960×1280 | Ability Card 視覺參考 | `26deb0dc953420ccd4d83e73eb65d443459a4e975500519fcc6dd46a378f6e1a` |

## 正式匯入規則

1. 先確認品牌、角色肖像與衍生素材的 Web／AI 處理授權範圍。
2. 只在工作副本上裁切、去背或縮放，保留來源 digest 與轉換紀錄。
3. 角色圖層轉為 Companion rig 的透明 `512×768` RGBA PNG；水獺兩張參考圖可等比例縮小 50%。
4. 場景另製作 `512×768` 構圖，不把 16:9 原圖直接拉伸。
5. 通過 alpha、尺寸、檔案大小、媒體簽章與 SHA-256 驗證後，建立版本化 AOZU character／scene pack。
6. 卡面人物、聲音或真實肖像沒有明確授權時，只能留作內部概念參考，不進可部署 bundle。
