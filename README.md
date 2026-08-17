# 复健日常 PWA

一个适合 iPhone 使用的个人康复训练网页应用，包含：

线上地址：<https://yhbyyds.github.io/rehab-daily-pwa/>

- 单脚站立倒计时
- 单脚前后跨越计数（默认 60 次）
- 弹力带勾脚计数
- 语音报数、震动提示
- 本地训练记录
- 添加到主屏幕后离线使用

## 本地运行

PWA 需要通过 HTTP/HTTPS 打开，不能直接双击 `index.html` 使用离线安装功能。

```powershell
py -m http.server 8080
```

然后访问：<http://localhost:8080>

## 安装到 iPhone

1. 将本目录部署到任意支持 HTTPS 的静态网站托管服务。
2. 在 iPhone Safari 中打开网址。
3. 点击“共享” → “添加到主屏幕”，并启用“作为网页 App 打开”。

训练记录只保存在当前设备浏览器中。清理 Safari 网站数据会同时删除记录。
